"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Barcode, CheckCircle2, CreditCard, Plus, X } from "lucide-react";
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
  paymentMethod: PaymentMethod;
  note: string;
};

type CustomerTier = "wholesale" | "craftsman" | "shop" | "retail";
type PaymentMethod = "cash" | "visa";

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

// Re-prices cart lines when the applied tier changes (e.g. picking a customer
// whose type differs from the current tier). Only lines still sitting at the
// OLD tier's list price get remapped — a price the salesperson deliberately
// hand-edited away from the list price is left untouched.
function repriceCartLines(cart: CartItem[], oldTier: CustomerTier, newTier: CustomerTier) {
  if (oldTier === newTier) {
    return cart;
  }

  return cart.map((item) => {
    const stillAtOldListPrice = parseDecimal(item.unitPrice) === priceForTier(item.product, oldTier);
    return stillAtOldListPrice
      ? { ...item, unitPrice: String(priceForTier(item.product, newTier)) }
      : item;
  });
}

export function SaleForm({
  products,
  customers,
  warehouses,
  services,
  vatRate,
  stock,
}: {
  products: Product[];
  customers: Customer[];
  warehouses: Warehouse[];
  services: Service[];
  vatRate: number;
  stock: StockRow[];
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
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerList, setCustomerList] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState(() => restoredDraft?.customerId ?? "");
  const [appliedTier, setAppliedTier] = useState<CustomerTier>(
    () => restoredDraft?.appliedTier ?? "retail"
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    () => restoredDraft?.paymentMethod ?? "cash"
  );
  const [cart, setCart] = useState<CartItem[]>(() =>
    (restoredDraft?.cart ?? []).map((item) => ({
      ...item,
      product: products.find((product) => product.id === item.product.id) ?? item.product,
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

  // Persist the in-progress sale as it changes. The initial state already
  // reflects any restored draft (via the lazy initializers above), so writing
  // it straight back on first run is harmless/idempotent.
  useEffect(() => {
    const snapshot: DraftSnapshot = {
      cart,
      serviceLines,
      customerId,
      appliedTier,
      paymentMethod,
      note,
    };
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
  }, [cart, serviceLines, customerId, appliedTier, paymentMethod, note]);

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

  const filteredCustomers = customerList.filter((customer) => {
    const haystack = `${customer.name} ${customer.phone ?? ""}`.toLowerCase();
    return haystack.includes(customerSearch.toLowerCase());
  });

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

  function handleCustomerChange(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customerList.find((item) => item.id === nextCustomerId);
    const nextTier = customer?.customer_type ?? "retail";
    // Re-price existing cart lines for the newly-selected customer's tier,
    // preserving any hand-edited prices (see repriceCartLines).
    setCart((current) => repriceCartLines(current, appliedTier, nextTier));
    setAppliedTier(nextTier);
  }

  function handleCustomerCreated(customer: Customer) {
    setCustomerList((current) =>
      [...current, customer].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCustomerId(customer.id);
    setCart((current) => repriceCartLines(current, appliedTier, customer.customer_type));
    setAppliedTier(customer.customer_type);
    setIsNewCustomerModalOpen(false);
  }

  function handleTierChange(nextTier: CustomerTier) {
    setAppliedTier(nextTier);
    setCart((current) =>
      current.map((item) => ({
        ...item,
        unitPrice: String(priceForTier(item.product, nextTier)),
      }))
    );
  }

  function addProduct(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: String(parseDecimal(item.quantity) + 1) }
            : item
        );
      }

      return [
        ...current,
        {
          rowId: crypto.randomUUID(),
          product,
          warehouseId: bestWarehouseFor(product.id),
          quantity: "1",
          unitPrice: String(priceForTier(product, appliedTier)),
          lineDiscount: "0",
          discountNote: "",
        },
      ];
    });
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

    addProduct(product);
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

    if (cart.length === 0 && serviceLines.length === 0) {
      setError(t("sales.addAtLeastOne"));
      barcodeRef.current?.focus();
      return;
    }

    if (cart.some((item) => !item.warehouseId)) {
      setError(t("sales.chooseWarehouseAll"));
      return;
    }

    setIsSubmitting(true);

    // Clear the persisted draft before saving. On success, saveDraftInvoice
    // redirects away, so this is the only chance to clear it; on failure we
    // restore it below since nothing was actually lost.
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);

    const result = await saveDraftInvoice({
      customer_id: customerId || null,
      applied_tier: appliedTier,
      payment_method: paymentMethod,
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
          paymentMethod,
          note,
        } satisfies DraftSnapshot)
      );
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      {/* LEFT: scan-and-build-cart flow */}
      <div className="flex flex-col gap-6">
        <div className="relative">
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
          {barcodeMessage && <p className="mt-2 text-sm text-red-600">{barcodeMessage}</p>}
        </div>

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

                return (
                  <li key={item.rowId} className="border-b border-slate-100 p-4 last:border-0">
                    <div className="flex items-center gap-3">
                      <p className="min-w-0 flex-1 truncate font-medium text-slate-900">
                        {displayName(item.product.name_en, item.product.name_ar, locale)}
                      </p>
                      <QuantityStepper
                        value={item.quantity}
                        onChange={(value) => updateCartItem(item.rowId, { quantity: value })}
                        step={1}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateCartItem(item.rowId, { unitPrice: event.target.value })
                        }
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-end text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
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
          <label className={labelClass}>{t("sales.searchCustomers")}</label>
          <input
            type="text"
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            className={inputClass}
          />
        </div>

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
          <select
            value={customerId}
            onChange={(event) => handleCustomerChange(event.target.value)}
            className={inputClass}
          >
            <option value="">{t("sales.walkInCustomer")}</option>
            {filteredCustomers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({t(tierDictKeys[customer.customer_type])})
              </option>
            ))}
          </select>
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

        <div>
          <label className={labelClass}>{t("sales.paymentMethod")}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                paymentMethod === "cash"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Banknote className="h-4 w-4" />
              {t("sales.paymentCash")}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod("visa")}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                paymentMethod === "visa"
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              {t("sales.paymentVisa")}
            </button>
          </div>
        </div>

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

        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSubmitting}
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
            <input name="phone" type="text" dir="ltr" className={inputClass} />
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
