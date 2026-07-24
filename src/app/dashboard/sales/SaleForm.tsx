"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Barcode, CheckCircle2, Plus, Search, Tag, TrendingUp, X } from "lucide-react";
import { saveDraftInvoice } from "./actions";
import { createCustomer } from "../customers/new/actions";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { Badge } from "@/components/ui/badge";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { todayInShopTimezone } from "@/lib/date";
import { displayName } from "@/lib/display-name";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "@/lib/ui";

const DRAFT_STORAGE_KEY = "hvac-sale-draft";

type DraftSnapshot = {
  cart: CartItem[];
  serviceLines: ServiceLine[];
  customerId: string;
  appliedTier: CustomerTier;
  note: string;
};

type CustomerTier = "wholesale" | "craftsman" | "shop" | "retail";
type PaymentMethod = "cash" | "visa" | "cheque";

// A single quantity-based pricing rule (an "offer"): within [min_qty, max_qty]
// for its product, this price replaces the customer-tier price.
type QuantityPriceRule = {
  id: string;
  product_id: string;
  min_qty: number;
  max_qty: number;
  price: number;
};

// One line of the payment breakdown. Amounts are kept as raw strings (no
// reformatting while typing). Cheque fields are only meaningful when
// method === "cheque".
type PaymentLine = {
  rowId: string;
  method: PaymentMethod;
  amount: string;
  chequeNumber: string;
  chequeDate: string;
};

type Product = {
  id: string;
  barcode: string;
  name_ar: string | null;
  name_en: string | null;
  warranty_months: number | null;
  price_wholesale: number;
  price_craftsman: number;
  price_shop: number;
  price_retail: number;
};

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  customer_type: CustomerTier;
};

type Warehouse = { id: string; name_en: string | null };
type Service = { id: string; name_ar: string | null; name_en: string | null; default_price: number };
type StockRow = { product_id: string; warehouse_id: string; quantity: number };

type CartItem = {
  rowId: string;
  product: Product;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  lineDiscount: string;
  discountNote: string;
  // The EXACT full code scanned for this line, captured before the barcode was
  // prefix-resolved to a product. For a serialized product this carries the
  // per-unit suffix the customer actually owns (what a warranty claim needs),
  // which the product's own `barcode` column never stores. Null for lines added
  // via name search or the top-sellers row, where nothing was scanned.
  scannedBarcode: string | null;
};

type ServiceLine = {
  rowId: string;
  serviceId: string;
  description: string;
  price: string;
};

const tierDictKeys: Record<CustomerTier, "customerType.wholesale" | "customerType.craftsman" | "customerType.shop" | "customerType.retail"> = {
  wholesale: "customerType.wholesale",
  craftsman: "customerType.craftsman",
  shop: "customerType.shop",
  retail: "customerType.retail",
};

function priceForTier(product: Product, tier: CustomerTier) {
  return product[`price_${tier}`];
}

// Find the offer rule (if any) whose quantity range covers `quantity` for this
// product. Ranges are treated as inclusive on both ends.
function offerRuleFor(rules: QuantityPriceRule[], productId: string, quantity: number) {
  return (
    rules.find(
      (rule) =>
        rule.product_id === productId && quantity >= rule.min_qty && quantity <= rule.max_qty
    ) ?? null
  );
}

// The price a cart line should carry: a matching quantity offer overrides the
// customer-tier price (regardless of the customer's tier); otherwise the tier
// price applies.
function effectiveUnitPrice(
  product: Product,
  tier: CustomerTier,
  quantity: number,
  rules: QuantityPriceRule[]
) {
  const rule = offerRuleFor(rules, product.id, quantity);
  return rule ? rule.price : priceForTier(product, tier);
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number) {
  return money(value).toFixed(2);
}

function parseDecimal(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Recomputes every cart line's unit price for the given tier and offer rules.
// Unit price is fully system-computed now (never hand-edited), so each line is
// simply reset to its effective price — a matching quantity offer wins over the
// tier price. Called whenever the tier changes (customer pick) so prices track
// the newly-applied tier while still honoring any active bulk offers.
function recomputeCartPrices(
  cart: CartItem[],
  tier: CustomerTier,
  rules: QuantityPriceRule[]
) {
  return cart.map((item) => ({
    ...item,
    unitPrice: String(effectiveUnitPrice(item.product, tier, parseDecimal(item.quantity), rules)),
  }));
}

export function SaleForm({
  products,
  customers,
  warehouses,
  services,
  vatRate,
  stock,
  offerRules,
  topSellerIds,
}: {
  products: Product[];
  customers: Customer[];
  warehouses: Warehouse[];
  services: Service[];
  vatRate: number;
  stock: StockRow[];
  offerRules: QuantityPriceRule[];
  topSellerIds: string[];
}) {
  const { t, locale } = useLocale();

  // Restore an in-progress sale left in sessionStorage (e.g. after an
  // accidental reload or navigating away) so nothing gets lost. Read it once
  // here so it can seed the initial state via lazy `useState` initializers —
  // doing this synchronously (rather than in a useEffect that calls setState)
  // avoids the cascading extra render React warns about. Returns null on the
  // server, where sessionStorage doesn't exist.
  const restoredDraft = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DraftSnapshot) : null;
    } catch {
      // Corrupted or unavailable sessionStorage: start from a blank sale.
      return null;
    }
    // Read once on mount; the persist effect below is the source of truth
    // afterwards, so we deliberately don't re-run this.
  }, []);

  const [barcode, setBarcode] = useState("");
  const [barcodeMessage, setBarcodeMessage] = useState<string | null>(null);
  // Name-search fallback (for when the scanner isn't available). Filters the
  // already-loaded catalog client-side, mirroring the customer combobox on this
  // screen and the ilike name search on the products list page.
  const [productSearch, setProductSearch] = useState("");
  const [isProductListOpen, setIsProductListOpen] = useState(false);
  const productPickerRef = useRef<HTMLDivElement>(null);
  // Seed the combobox text with the restored customer's name so a recovered
  // draft shows its selection instead of an empty search box.
  const [customerSearch, setCustomerSearch] = useState(() => {
    const restoredId = restoredDraft?.customerId;
    return restoredId ? customers.find((customer) => customer.id === restoredId)?.name ?? "" : "";
  });
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false);
  const [customerList, setCustomerList] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState(() => restoredDraft?.customerId ?? "");
  const [appliedTier, setAppliedTier] = useState<CustomerTier>(
    () => restoredDraft?.appliedTier ?? "retail"
  );
  // Payment breakdown. Starts as a single Cash line; its amount auto-tracks the
  // invoice total until the cashier touches the payment section (see effect
  // below), so a normal single-method sale needs zero extra clicks.
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>(() => [
    { rowId: crypto.randomUUID(), method: "cash", amount: "0", chequeNumber: "", chequeDate: "" },
  ]);
  const [paymentsDirty, setPaymentsDirty] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() =>
    (restoredDraft?.cart ?? []).map((item) => ({
      ...item,
      product: products.find((product) => product.id === item.product.id) ?? item.product,
      // Drafts persisted before scanned codes existed have no such field.
      scannedBarcode: item.scannedBarcode ?? null,
    }))
  );
  const [expandedDiscounts, setExpandedDiscounts] = useState<Set<string>>(new Set());
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>(
    () => restoredDraft?.serviceLines ?? []
  );
  const [note, setNote] = useState(() => restoredDraft?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const customerPickerRef = useRef<HTMLDivElement>(null);

  // Close the customer results dropdown when tapping/clicking outside of it.
  useEffect(() => {
    if (!isCustomerListOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (customerPickerRef.current && !customerPickerRef.current.contains(event.target as Node)) {
        setIsCustomerListOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isCustomerListOpen]);

  // Close the product name-search dropdown when tapping/clicking outside of it.
  useEffect(() => {
    if (!isProductListOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (productPickerRef.current && !productPickerRef.current.contains(event.target as Node)) {
        setIsProductListOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isProductListOpen]);

  // Persist the in-progress sale as it changes. The initial state already
  // reflects any restored draft (via the lazy initializers above), so writing
  // it straight back on first run is harmless/idempotent.
  useEffect(() => {
    const snapshot: DraftSnapshot = {
      cart,
      serviceLines,
      customerId,
      appliedTier,
      note,
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [cart, serviceLines, customerId, appliedTier, note]);

  const stockByProduct = useMemo(() => {
    const map = new Map<string, { warehouseId: string; quantity: number }[]>();
    for (const row of stock) {
      const rows = map.get(row.product_id) ?? [];
      rows.push({ warehouseId: row.warehouse_id, quantity: row.quantity });
      map.set(row.product_id, rows);
    }
    return map;
  }, [stock]);

  function stockFor(productId: string, warehouseId: string) {
    return stockByProduct.get(productId)?.find((row) => row.warehouseId === warehouseId)?.quantity ?? 0;
  }

  function bestWarehouseFor(productId: string) {
    const rows = stockByProduct.get(productId) ?? [];
    const inStock = rows.filter((row) => row.quantity > 0);

    if (inStock.length === 0) {
      return warehouses[0]?.id ?? "";
    }

    return inStock.reduce((best, row) => (row.quantity > best.quantity ? row : best), inStock[0])
      .warehouseId;
  }

  const selectedCustomer = customerList.find((customer) => customer.id === customerId);

  // Match on name OR phone so cashiers can look a customer up by either.
  const filteredCustomers = customerList.filter((customer) => {
    const haystack = `${customer.name} ${customer.phone ?? ""}`.toLowerCase();
    return haystack.includes(customerSearch.trim().toLowerCase());
  });

  // Top sellers resolved (in ranked order) to full products from the loaded
  // catalog; drop any that no longer exist.
  const topSellers = topSellerIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product));

  // Name-search results over the loaded catalog: case-insensitive substring on
  // English OR Arabic name (same semantics as the products-list ilike search).
  // Only computed while the dropdown is open and a query is present.
  const productQuery = productSearch.trim().toLowerCase();
  const filteredProducts = productQuery
    ? products
        .filter((product) =>
          `${product.name_en ?? ""} ${product.name_ar ?? ""}`.toLowerCase().includes(productQuery)
        )
        .slice(0, 8)
    : [];

  // Add a product picked from the name-search dropdown, then reset the search
  // for the next entry — same cart behavior as a barcode scan or top-seller tap.
  function selectSearchProduct(product: Product) {
    addProduct(product);
    setProductSearch("");
    setIsProductListOpen(false);
  }

  const totals = useMemo(() => {
    const discountTotal = cart.reduce(
      (sum, item) => sum + parseDecimal(item.lineDiscount),
      0
    );
    const grossItems = cart.reduce(
      (sum, item) => sum + parseDecimal(item.quantity) * parseDecimal(item.unitPrice),
      0
    );
    const servicesTotal = serviceLines.reduce(
      (sum, service) => sum + parseDecimal(service.price),
      0
    );
    const subtotal = grossItems + servicesTotal;
    const taxableSubtotal = Math.max(subtotal - discountTotal, 0);
    const vatAmount = taxableSubtotal * (vatRate / 100);

    return {
      subtotal: money(subtotal),
      discountTotal: money(discountTotal),
      vatAmount: money(vatAmount),
      total: money(taxableSubtotal + vatAmount),
    };
  }, [cart, serviceLines, vatRate]);

  // Until the cashier touches the payment section, the single default line is
  // derived so its amount always equals the current invoice total (no effect /
  // cascading render needed). Once they split or edit it (paymentsDirty), the
  // stored `paymentLines` become authoritative and we stop auto-adjusting.
  const effectivePaymentLines: PaymentLine[] = paymentsDirty
    ? paymentLines
    : [{ ...paymentLines[0], method: "cash", amount: String(totals.total) }];

  const paymentsTotal = money(
    effectivePaymentLines.reduce((sum, line) => sum + parseDecimal(line.amount), 0)
  );
  // Positive => still owed; negative => overpaid. Balanced within the same 0.01
  // tolerance the DB completion trigger uses.
  const paymentRemaining = money(totals.total - paymentsTotal);
  const paymentsBalanced = Math.abs(paymentRemaining) <= 0.01;
  const chequeDetailsComplete = effectivePaymentLines.every(
    (line) => line.method !== "cheque" || (line.chequeNumber.trim() && line.chequeDate)
  );

  // When the payment section is still pristine, the first mutation must seed the
  // stored lines from the derived total so the amount isn't lost.
  function paymentBaseForEdit(): PaymentLine[] {
    return paymentsDirty ? paymentLines : effectivePaymentLines;
  }

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customerList.find((item) => item.id === nextCustomerId);
    const nextTier = customer?.customer_type ?? "retail";
    // Re-price existing cart lines to the newly-selected customer's tier
    // (bulk offers still override where their quantity range applies).
    setCart((current) => recomputeCartPrices(current, nextTier, offerRules));
    setAppliedTier(nextTier);
  }

  // Pick a customer from the combobox results: apply their tier and show their
  // name in the input, then close the dropdown.
  function selectCustomer(customer: Customer) {
    handleCustomerChange(customer.id);
    setCustomerSearch(customer.name);
    setIsCustomerListOpen(false);
  }

  function handleCustomerInputChange(value: string) {
    setCustomerSearch(value);
    setIsCustomerListOpen(true);
    // Editing the text after a selection means the user is searching again;
    // drop the current selection until they pick a new one (a sale can't be
    // saved without a selected customer).
    if (customerId) {
      setCustomerId("");
    }
  }

  function handleCustomerCreated(customer: Customer) {
    setCustomerList((current) =>
      [...current, customer].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCustomerId(customer.id);
    setCustomerSearch(customer.name);
    setIsCustomerListOpen(false);
    setCart((current) => recomputeCartPrices(current, customer.customer_type, offerRules));
    setAppliedTier(customer.customer_type);
    setIsNewCustomerModalOpen(false);
  }

  function handleTierChange(nextTier: CustomerTier) {
    setAppliedTier(nextTier);
    setCart((current) => recomputeCartPrices(current, nextTier, offerRules));
  }

  // `scannedBarcode` is the raw code when this came from an actual scan, and
  // null for the name-search / top-sellers paths.
  function addProduct(product: Product, scannedBarcode: string | null = null) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        // Bumping the quantity may cross into (or out of) an offer's range, so
        // recompute this line's price for the new quantity.
        return current.map((item) => {
          if (item.product.id !== product.id) {
            return item;
          }
          const nextQuantity = parseDecimal(item.quantity) + 1;
          return {
            ...item,
            quantity: String(nextQuantity),
            unitPrice: String(
              effectiveUnitPrice(item.product, appliedTier, nextQuantity, offerRules)
            ),
            // Keep the first scanned code recorded for this line; only fill it in
            // if the line was started without one (e.g. added via name search and
            // later scanned). One invoice line can only carry one code.
            scannedBarcode: item.scannedBarcode ?? scannedBarcode,
          };
        });
      }

      return [
        ...current,
        {
          rowId: crypto.randomUUID(),
          product,
          warehouseId: bestWarehouseFor(product.id),
          quantity: "1",
          unitPrice: String(effectiveUnitPrice(product, appliedTier, 1, offerRules)),
          lineDiscount: "0",
          discountNote: "",
          scannedBarcode,
        },
      ];
    });
  }

  // Quantity edits can move a line into or out of an offer's range, so recompute
  // its unit price. The raw quantity string is kept exactly as typed (no
  // reformatting) — only the price is derived from it.
  function handleQuantityChange(rowId: string, value: string) {
    setCart((current) =>
      current.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              quantity: value,
              unitPrice: String(
                effectiveUnitPrice(item.product, appliedTier, parseDecimal(value), offerRules)
              ),
            }
          : item
      )
    );
  }

  function addPaymentLine() {
    const base = paymentBaseForEdit();
    setPaymentsDirty(true);
    setPaymentLines([
      ...base,
      {
        rowId: crypto.randomUUID(),
        method: "cash",
        // Pre-fill with whatever is still owed so splitting is quick.
        amount: paymentRemaining > 0 ? String(paymentRemaining) : "0",
        chequeNumber: "",
        chequeDate: "",
      },
    ]);
  }

  function updatePaymentLine(rowId: string, patch: Partial<Omit<PaymentLine, "rowId">>) {
    const base = paymentBaseForEdit();
    setPaymentsDirty(true);
    setPaymentLines(base.map((line) => (line.rowId === rowId ? { ...line, ...patch } : line)));
  }

  function removePaymentLine(rowId: string) {
    const base = paymentBaseForEdit();
    setPaymentsDirty(true);
    setPaymentLines(base.length <= 1 ? base : base.filter((line) => line.rowId !== rowId));
  }

  async function handleBarcodeEnter() {
    const code = barcode.trim();
    if (!code) {
      return;
    }

    // Resolve via the find_product_by_barcode RPC (not a direct barcode
    // equality check) so serialized products match by prefix and normal
    // products match exactly. It returns the product id; hydrate the full
    // product from the already-loaded list.
    const supabase = createClient();
    const { data: productId, error } = await supabase.rpc("find_product_by_barcode", {
      p_scanned_code: code,
    });

    const product = productId
      ? products.find((item) => item.id === productId)
      : undefined;

    if (error || !product) {
      setBarcodeMessage(`${t("sales.barcodeNotFound")} (${code})`);
      setBarcode("");
      return;
    }

    // Record the exact string that was scanned — NOT product.barcode, which for
    // a serialized product is only the shared prefix.
    addProduct(product, code);
    setBarcodeMessage(null);
    setBarcode("");
  }

  function updateCartItem(rowId: string, patch: Partial<Omit<CartItem, "rowId" | "product">>) {
    setCart((current) =>
      current.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item))
    );
  }

  function toggleDiscount(rowId: string) {
    setExpandedDiscounts((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  function addServiceLine() {
    setServiceLines((current) => [
      ...current,
      {
        rowId: crypto.randomUUID(),
        serviceId: "",
        description: "",
        price: "0",
      },
    ]);
  }

  function updateServiceLine(rowId: string, patch: Partial<Omit<ServiceLine, "rowId">>) {
    setServiceLines((current) =>
      current.map((line) => (line.rowId === rowId ? { ...line, ...patch } : line))
    );
  }

  function handleServiceSelect(rowId: string, serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    updateServiceLine(rowId, {
      serviceId,
      description: service ? displayName(service.name_en, service.name_ar, locale) : "",
      price: service ? String(service.default_price) : "0",
    });
  }

  async function handleSaveDraft() {
    setError(null);

    if (!customerId) {
      setError(t("sales.customerRequired"));
      setIsCustomerListOpen(true);
      return;
    }

    if (cart.length === 0 && serviceLines.length === 0) {
      setError(t("sales.addAtLeastOne"));
      barcodeRef.current?.focus();
      return;
    }

    if (cart.some((item) => !item.warehouseId)) {
      setError(t("sales.chooseWarehouseAll"));
      return;
    }

    if (!chequeDetailsComplete) {
      setError(t("sales.chequeDetailsRequired"));
      return;
    }

    if (!paymentsBalanced) {
      setError(t("sales.paymentsMustMatch"));
      return;
    }

    setIsSubmitting(true);

    // Clear the persisted draft before saving. On success, saveDraftInvoice
    // redirects away, so this is the only chance to clear it; on failure we
    // restore it below since nothing was actually lost.
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);

    const result = await saveDraftInvoice({
      customer_id: customerId,
      applied_tier: appliedTier,
      payments: effectivePaymentLines.map((line) => ({
        method: line.method,
        amount: money(parseDecimal(line.amount)),
        cheque_number: line.method === "cheque" ? line.chequeNumber.trim() || null : null,
        cheque_date: line.method === "cheque" ? line.chequeDate || null : null,
      })),
      sale_date: todayInShopTimezone(),
      note: note.trim() || null,
      items: cart.map((item) => ({
        product_id: item.product.id,
        warehouse_id: item.warehouseId,
        quantity: parseDecimal(item.quantity),
        unit_price: money(parseDecimal(item.unitPrice)),
        line_discount: money(parseDecimal(item.lineDiscount)),
        discount_note: item.discountNote.trim() || null,
        warranty_months: item.product.warranty_months,
        scanned_barcode: item.scannedBarcode,
      })),
      services: serviceLines.map((line) => ({
        service_id: line.serviceId || null,
        description: line.description.trim(),
        price: money(parseDecimal(line.price)),
      })),
    });

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          cart,
          serviceLines,
          customerId,
          appliedTier,
          note,
        } satisfies DraftSnapshot)
      );
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      {/* LEFT: scan-and-build-cart flow */}
      <div className="flex flex-col gap-6">
        {/* Top Sellers: quick-add row of the best-selling products (last 30
            days). Tapping a card adds it to the cart exactly like a scan. */}
        {topSellers.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <TrendingUp className="h-4 w-4" />
              {t("sales.topSellers")}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {topSellers.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="flex w-32 shrink-0 flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 text-start hover:border-blue-400 hover:bg-blue-50/40"
                >
                  <span className="line-clamp-2 text-sm font-medium text-slate-900">
                    {displayName(product.name_en, product.name_ar, locale)}
                  </span>
                  <span className="text-xs font-semibold text-blue-600" dir="ltr">
                    {formatMoney(priceForTier(product, appliedTier))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Barcode scan (unchanged) plus a name-search fallback beside it. */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Barcode className="pointer-events-none absolute inset-y-0 start-4 my-auto h-6 w-6 text-slate-400" />
            <input
              ref={barcodeRef}
              autoFocus
              type="text"
              dir="ltr"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleBarcodeEnter();
                }
              }}
              placeholder={t("sales.barcode")}
              className="w-full rounded-xl border border-slate-300 bg-white py-4 ps-12 pe-4 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          <div ref={productPickerRef} className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={productSearch}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setIsProductListOpen(true);
              }}
              onFocus={() => setIsProductListOpen(true)}
              placeholder={t("sales.searchProductsPlaceholder")}
              role="combobox"
              aria-expanded={isProductListOpen}
              aria-controls="product-search-list"
              className="w-full rounded-xl border border-slate-300 bg-white py-4 ps-12 pe-4 text-lg text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />

            {isProductListOpen && productQuery && (
              <ul
                id="product-search-list"
                className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {filteredProducts.length === 0 ? (
                  <li className="px-3 py-3 text-center text-sm text-slate-500">
                    {t("sales.noProductsMatch")}
                  </li>
                ) : (
                  filteredProducts.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => selectSearchProduct(product)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-start hover:bg-slate-50"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                          {displayName(product.name_en, product.name_ar, locale)}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-blue-600" dir="ltr">
                          {formatMoney(priceForTier(product, appliedTier))}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
        {barcodeMessage && <p className="text-sm text-red-600">{barcodeMessage}</p>}

        <div className={cardClass}>
          {cart.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{t("sales.noProductsScanned")}</p>
          ) : (
            <ul>
              {cart.map((item) => {
                const lineTotal =
                  parseDecimal(item.quantity) * parseDecimal(item.unitPrice) -
                  parseDecimal(item.lineDiscount);
                const discountOpen = expandedDiscounts.has(item.rowId);
                const selectedWarehouseStock = item.warehouseId
                  ? stockFor(item.product.id, item.warehouseId)
                  : 0;
                const hasStockWarning = Boolean(item.warehouseId) && selectedWarehouseStock <= 0;
                // A matching quantity offer means this line's price came from a
                // bulk rule rather than the customer's tier — flag it.
                const hasBulkPrice = Boolean(
                  offerRuleFor(offerRules, item.product.id, parseDecimal(item.quantity))
                );

                return (
                  <li key={item.rowId} className="border-b border-slate-100 p-4 last:border-0">
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {displayName(item.product.name_en, item.product.name_ar, locale)}
                      </p>
                      <QuantityStepper
                        value={item.quantity}
                        onChange={(value) => handleQuantityChange(item.rowId, value)}
                        step={1}
                      />
                      {/* Unit price is system-computed: the customer's price tier,
                          or a bulk offer price when the quantity qualifies. It is
                          never hand-editable mid-sale by any role — pricing changes
                          belong on the product edit / offers pages. Shown as a
                          read-only field so the number stays clearly visible. */}
                      <span
                        dir="ltr"
                        title={hasBulkPrice ? t("sales.bulkPriceApplied") : t("sales.unitPriceLocked")}
                        className={`w-20 shrink-0 rounded-md border px-2 py-1 text-end text-sm tabular-nums ${
                          hasBulkPrice
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                        }`}
                      >
                        {formatMoney(parseDecimal(item.unitPrice))}
                      </span>
                      <span className="w-24 shrink-0 text-end font-semibold text-slate-900" dir="ltr">
                        {formatMoney(lineTotal)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setCart((current) => current.filter((line) => line.rowId !== item.rowId))
                        }
                        aria-label={t("sales.remove")}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={item.warehouseId}
                          onChange={(event) =>
                            updateCartItem(item.rowId, { warehouseId: event.target.value })
                          }
                          className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        >
                          <option value="">{t("sales.chooseWarehouse")}</option>
                          {warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name_en}
                            </option>
                          ))}
                        </select>
                        {hasStockWarning && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"
                            title={t("sales.noStockWarning")}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t("sales.noStockWarning")}
                          </span>
                        )}
                      </div>

                      {hasBulkPrice && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          <Tag className="h-3.5 w-3.5" />
                          {t("sales.bulkPriceApplied")}
                        </span>
                      )}

                      {discountOpen ? (
                        <>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            dir="ltr"
                            value={item.lineDiscount}
                            onChange={(event) =>
                              updateCartItem(item.rowId, { lineDiscount: event.target.value })
                            }
                            placeholder={t("sales.colDiscount")}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <input
                            type="text"
                            value={item.discountNote}
                            onChange={(event) =>
                              updateCartItem(item.rowId, { discountNote: event.target.value })
                            }
                            placeholder={t("sales.colDiscountNote")}
                            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                          <button
                            type="button"
                            onClick={() => toggleDiscount(item.rowId)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleDiscount(item.rowId)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {t("sales.addDiscount")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Services: smaller, visually separated sub-section */}
        <div className="border-t border-slate-200 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("sales.servicesTitle")}
            </h2>
            <button type="button" onClick={addServiceLine} className={btnSecondary}>
              <Plus className="h-3.5 w-3.5" />
              {t("sales.addService")}
            </button>
          </div>

          {serviceLines.length > 0 && (
            <div className="flex flex-col gap-3">
              {serviceLines.map((line) => (
                <div
                  key={line.rowId}
                  className={`grid gap-3 ${cardClass} p-3 md:grid-cols-[1fr_1fr_140px_auto]`}
                >
                  <select
                    value={line.serviceId}
                    onChange={(event) => handleServiceSelect(line.rowId, event.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t("sales.customService")}</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {displayName(service.name_en, service.name_ar, locale)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder={t("sales.descriptionPlaceholder")}
                    value={line.description}
                    onChange={(event) =>
                      updateServiceLine(line.rowId, { description: event.target.value })
                    }
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    value={line.price}
                    onChange={(event) => updateServiceLine(line.rowId, { price: event.target.value })}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setServiceLines((current) => current.filter((item) => item.rowId !== line.rowId))
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
                    aria-label={t("sales.remove")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>{t("sales.note")}</label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </div>

      {/* RIGHT: customer + totals + checkout, sticky while the left side scrolls */}
      <div className={`sticky top-6 flex flex-col gap-4 ${cardClass} p-5`}>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">{t("sales.customer")}</label>
            <button
              type="button"
              onClick={() => setIsNewCustomerModalOpen(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              {t("sales.newCustomerLink")}
            </button>
          </div>

          {/* Searchable customer combobox: type to filter by name or phone,
              tap a result to select. Sized for touch on the POS tablet. */}
          <div ref={customerPickerRef} className="relative">
            <input
              type="text"
              value={customerSearch}
              onChange={(event) => handleCustomerInputChange(event.target.value)}
              onFocus={() => setIsCustomerListOpen(true)}
              placeholder={t("sales.customerSearchPlaceholder")}
              role="combobox"
              aria-expanded={isCustomerListOpen}
              aria-controls="customer-combobox-list"
              className={`${inputClass} ${
                selectedCustomer ? "border-blue-400 bg-blue-50/40" : ""
              }`}
            />

            {isCustomerListOpen && (
              <ul
                id="customer-combobox-list"
                className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                {filteredCustomers.length === 0 ? (
                  <li className="px-3 py-3 text-center text-sm text-slate-500">
                    {t("sales.noCustomersMatch")}
                  </li>
                ) : (
                  filteredCustomers.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-3 text-start hover:bg-slate-50 ${
                          customer.id === customerId ? "bg-blue-50" : ""
                        }`}
                      >
                        <span className="font-medium text-slate-900">{customer.name}</span>
                        <span className="text-xs text-slate-500" dir="ltr">
                          {customer.phone ?? "—"} · {t(tierDictKeys[customer.customer_type])}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className={labelClass}>{t("sales.appliedTier")}</label>
          <Badge tone="blue">{t(tierDictKeys[appliedTier])}</Badge>
        </div>
        <select
          value={appliedTier}
          onChange={(event) => handleTierChange(event.target.value as CustomerTier)}
          disabled={Boolean(selectedCustomer)}
          className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
        >
          {(Object.keys(tierDictKeys) as CustomerTier[]).map((tier) => (
            <option key={tier} value={tier}>
              {t(tierDictKeys[tier])}
            </option>
          ))}
        </select>

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>{t("sales.subtotal")}</span>
            <span dir="ltr">{formatMoney(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{t("sales.discount")}</span>
            <span dir="ltr">{formatMoney(totals.discountTotal)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span dir="ltr">
              {t("sales.vat")} ({formatMoney(vatRate)}%)
            </span>
            <span dir="ltr">{formatMoney(totals.vatAmount)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-base font-semibold text-slate-900">{t("sales.total")}</span>
            <span className="text-2xl font-bold text-blue-600" dir="ltr">
              {formatMoney(totals.total)}
            </span>
          </div>
        </div>

        {/* Payment breakdown: one or more methods that must add up to the total.
            Splitting is opt-in via "+ Add Payment Method"; a plain single-method
            sale just leaves the one auto-filled Cash line as-is. */}
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between">
            <label className={labelClass}>{t("sales.paymentMethod")}</label>
            <button
              type="button"
              onClick={addPaymentLine}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              {t("sales.addPaymentMethod")}
            </button>
          </div>

          {effectivePaymentLines.map((line) => (
            <div key={line.rowId} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={line.method}
                  onChange={(event) =>
                    updatePaymentLine(line.rowId, { method: event.target.value as PaymentMethod })
                  }
                  className="w-28 shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="cash">{t("sales.paymentCash")}</option>
                  <option value="visa">{t("sales.paymentVisa")}</option>
                  <option value="cheque">{t("sales.paymentCheque")}</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  dir="ltr"
                  value={line.amount}
                  onChange={(event) => updatePaymentLine(line.rowId, { amount: event.target.value })}
                  placeholder={t("sales.paymentAmount")}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-end text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                {effectivePaymentLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePaymentLine(line.rowId)}
                    aria-label={t("sales.removePayment")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {line.method === "cheque" && (
                <div className="flex items-center gap-2 ps-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={line.chequeNumber}
                    onChange={(event) =>
                      updatePaymentLine(line.rowId, { chequeNumber: event.target.value })
                    }
                    placeholder={t("sales.chequeNumber")}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <input
                    type="date"
                    dir="ltr"
                    value={line.chequeDate}
                    onChange={(event) =>
                      updatePaymentLine(line.rowId, { chequeDate: event.target.value })
                    }
                    className="w-40 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Running balance indicator, mirroring the DB trigger's requirement
              that payments equal the total before completion. */}
          {paymentsBalanced ? (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              {t("sales.paymentsBalanced")}
            </p>
          ) : paymentRemaining > 0 ? (
            <p className="flex items-center justify-between text-sm font-medium text-amber-600">
              <span>{t("sales.paymentRemaining")}</span>
              <span dir="ltr">{formatMoney(paymentRemaining)}</span>
            </p>
          ) : (
            <p className="flex items-center justify-between text-sm font-medium text-red-600">
              <span>{t("sales.paymentOverBy")}</span>
              <span dir="ltr">{formatMoney(Math.abs(paymentRemaining))}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSubmitting || !paymentsBalanced || !chequeDetailsComplete}
          className={`${btnPrimary} mt-2 w-full py-3 text-base`}
        >
          <CheckCircle2 className="h-5 w-5" />
          {isSubmitting ? t("common.saving") : t("sales.saveDraft")}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {isNewCustomerModalOpen && (
        <NewCustomerModal
          onClose={() => setIsNewCustomerModalOpen(false)}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );
}

function NewCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createCustomer(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    onCreated(result.customer as Customer);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-md ${cardClass} p-6`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{t("customers.newTitle")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sales.remove")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("customers.name")}</label>
            <input name="name" type="text" required autoFocus className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("customers.phone")}</label>
            <input name="phone" type="text" dir="ltr" required className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("customers.address")}</label>
            <input name="address" type="text" required className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>{t("customers.customerType")}</label>
            <select name="customer_type" required className={inputClass}>
              <option value="retail">{t("customerType.retail")}</option>
              <option value="shop">{t("customerType.shop")}</option>
              <option value="craftsman">{t("customerType.craftsman")}</option>
              <option value="wholesale">{t("customerType.wholesale")}</option>
            </select>
          </div>

          <div className="mt-2 flex gap-3">
            <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isSubmitting} className={`${btnPrimary} flex-1`}>
              {isSubmitting ? t("common.creating") : t("customers.createButton")}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}
