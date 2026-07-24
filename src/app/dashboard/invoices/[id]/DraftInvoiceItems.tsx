"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Pencil, Plus, X } from "lucide-react";
import { addInvoiceItem, approveDiscount, rejectDiscount, removeInvoiceItem, updateInvoiceItem } from "./actions";
import { DiscountBadge } from "./discount-badge";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { displayName } from "@/lib/display-name";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import {
  btnPrimarySm,
  btnSecondarySm,
  inputClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
} from "@/lib/ui";

type CustomerTier = "wholesale" | "craftsman" | "shop" | "retail";

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

type Warehouse = { id: string; name_en: string | null };

type InvoiceItemRow = {
  id: string;
  productId: string;
  productName: string;
  warehouseId: string;
  warehouseName: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  discountNote: string | null;
  discountApprovedBy: string | null;
  discountRejectedBy: string | null;
  scannedBarcode: string | null;
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

type EditDraft = {
  quantity: string;
  unitPrice: string;
  lineDiscount: string;
  discountNote: string;
};

export function DraftInvoiceItems({
  invoiceId,
  items,
  warehouses,
  products,
  appliedTier,
  canEditItems,
  canDecideDiscounts,
}: {
  invoiceId: string;
  items: InvoiceItemRow[];
  warehouses: Warehouse[];
  products: Product[];
  appliedTier: CustomerTier;
  canEditItems: boolean;
  canDecideDiscounts: boolean;
}) {
  const { t, locale } = useLocale();
  const router = useRouter();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [isAdding, setIsAdding] = useState(false);
  const [addBarcode, setAddBarcode] = useState("");
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [addProduct, setAddProduct] = useState<Product | null>(null);
  const [addWarehouseId, setAddWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [addQuantity, setAddQuantity] = useState("1");
  const [addUnitPrice, setAddUnitPrice] = useState("0");
  const [addLineDiscount, setAddLineDiscount] = useState("0");
  const [addDiscountNote, setAddDiscountNote] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function startEdit(item: InvoiceItemRow) {
    setEditingId(item.id);
    setEditDraft({
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      lineDiscount: String(item.lineDiscount),
      discountNote: item.discountNote ?? "",
    });
    setRowError((current) => ({ ...current, [item.id]: "" }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit(itemId: string) {
    if (!editDraft) return;
    setPendingId(itemId);
    setRowError((current) => ({ ...current, [itemId]: "" }));

    const result = await updateInvoiceItem(itemId, {
      quantity: parseDecimal(editDraft.quantity),
      unit_price: parseDecimal(editDraft.unitPrice),
      line_discount: parseDecimal(editDraft.lineDiscount),
      discount_note: editDraft.discountNote.trim() || null,
    });

    setPendingId(null);

    if (!result.success) {
      setRowError((current) => ({ ...current, [itemId]: result.error }));
      return;
    }

    setEditingId(null);
    setEditDraft(null);
    router.refresh();
  }

  async function handleRemove(itemId: string) {
    if (!window.confirm(t("invoiceDetail.confirmRemove"))) {
      return;
    }

    setPendingId(itemId);
    setRowError((current) => ({ ...current, [itemId]: "" }));

    const result = await removeInvoiceItem(itemId);
    setPendingId(null);

    if (!result.success) {
      setRowError((current) => ({ ...current, [itemId]: result.error }));
      return;
    }

    router.refresh();
  }

  async function handleApprove(itemId: string) {
    setPendingId(itemId);
    setRowError((current) => ({ ...current, [itemId]: "" }));
    const result = await approveDiscount(itemId);
    setPendingId(null);

    if (!result.success) {
      setRowError((current) => ({ ...current, [itemId]: result.error }));
      return;
    }

    router.refresh();
  }

  async function handleReject(itemId: string) {
    setPendingId(itemId);
    setRowError((current) => ({ ...current, [itemId]: "" }));
    const result = await rejectDiscount(itemId);
    setPendingId(null);

    if (!result.success) {
      setRowError((current) => ({ ...current, [itemId]: result.error }));
      return;
    }

    router.refresh();
  }

  function handleBarcodeEnter() {
    const code = addBarcode.trim();
    if (!code) return;

    const product = products.find((item) => item.barcode === code);

    if (!product) {
      setAddMessage(`${t("sales.barcodeNotFound")} (${code})`);
      setAddBarcode("");
      return;
    }

    setAddProduct(product);
    setAddWarehouseId(warehouses[0]?.id ?? "");
    setAddQuantity("1");
    setAddUnitPrice(String(priceForTier(product, appliedTier)));
    setAddLineDiscount("0");
    setAddDiscountNote("");
    setAddMessage(null);
    setAddBarcode("");
  }

  function resetAddLine() {
    setIsAdding(false);
    setAddProduct(null);
    setAddBarcode("");
    setAddMessage(null);
    setAddError(null);
  }

  async function handleAddLine() {
    if (!addProduct) return;
    setAddError(null);

    if (!addWarehouseId) {
      setAddError(t("invoiceDetail.chooseWarehouseError"));
      return;
    }

    setIsSubmittingAdd(true);

    const result = await addInvoiceItem(invoiceId, {
      product_id: addProduct.id,
      warehouse_id: addWarehouseId,
      quantity: parseDecimal(addQuantity),
      unit_price: parseDecimal(addUnitPrice),
      line_discount: parseDecimal(addLineDiscount),
      discount_note: addDiscountNote.trim() || null,
      warranty_months: addProduct.warranty_months,
    });

    setIsSubmittingAdd(false);

    if (!result.success) {
      setAddError(result.error);
      return;
    }

    resetAddLine();
    router.refresh();
  }

  return (
    <div className={`${tableWrapClass} mb-8`}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className={theadRowClass}>
            <th className={thClass}>{t("invoiceDetail.colProduct")}</th>
            <th className={thClass}>{t("invoiceDetail.colWarehouse")}</th>
            <th className={thClass}>{t("invoiceDetail.colQty")}</th>
            <th className={thClass}>{t("invoiceDetail.colUnitPrice")}</th>
            <th className={thClass}>{t("invoiceDetail.colDiscount")}</th>
            <th className={thClass}>{t("invoiceDetail.colLineTotal")}</th>
            {canEditItems && <th className={thClass}>{t("common.actions")}</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const isPending = pendingId === item.id;
            const lineTotal = isEditing && editDraft
              ? parseDecimal(editDraft.quantity) * parseDecimal(editDraft.unitPrice) -
                parseDecimal(editDraft.lineDiscount)
              : item.quantity * item.unitPrice - item.lineDiscount;
            const hasDiscount = item.lineDiscount > 0;
            const isDecided = Boolean(item.discountApprovedBy || item.discountRejectedBy);
            const isPendingDecision = hasDiscount && !isDecided;

            return (
              <tr key={item.id} className="border-b border-slate-100 last:border-0 align-top">
                {/* Scanned code = the specific unit sold (serialized products
                    carry a per-unit suffix the product barcode lacks). */}
                <td className={tdClass}>
                  <span className="block">{item.productName}</span>
                  {item.scannedBarcode && (
                    <span className="mt-0.5 block text-xs text-slate-400" dir="ltr">
                      {t("invoiceDetail.scannedCode")}: {item.scannedBarcode}
                    </span>
                  )}
                </td>
                <td className={tdClass}>{item.warehouseName}</td>
                <td className={tdClass} dir="ltr">
                  {isEditing && editDraft ? (
                    <QuantityStepper
                      value={editDraft.quantity}
                      onChange={(value) => setEditDraft({ ...editDraft, quantity: value })}
                      step={1}
                    />
                  ) : (
                    item.quantity
                  )}
                </td>
                <td className={tdClass} dir="ltr">
                  {isEditing && editDraft ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      dir="ltr"
                      value={editDraft.unitPrice}
                      onChange={(event) => setEditDraft({ ...editDraft, unitPrice: event.target.value })}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-end text-sm"
                    />
                  ) : (
                    formatMoney(item.unitPrice)
                  )}
                </td>
                <td className={tdClass} dir="ltr">
                  {isEditing && editDraft ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        value={editDraft.lineDiscount}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, lineDiscount: event.target.value })
                        }
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-end text-sm"
                      />
                      <input
                        type="text"
                        value={editDraft.discountNote}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, discountNote: event.target.value })
                        }
                        placeholder={t("sales.colDiscountNote")}
                        dir="rtl"
                        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span>{formatMoney(item.lineDiscount)}</span>
                      {hasDiscount && (
                        <DiscountBadge
                          approvedBy={item.discountApprovedBy}
                          rejectedBy={item.discountRejectedBy}
                          t={t}
                        />
                      )}
                      {isPendingDecision && !canDecideDiscounts && (
                        <span className="text-xs font-medium text-red-600">
                          {t("invoiceDetail.unapproved")}
                        </span>
                      )}
                      {isPendingDecision && canDecideDiscounts && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApprove(item.id)}
                            disabled={isPending}
                            className={`${btnPrimarySm} gap-1`}
                          >
                            <Check className="h-3 w-3" />
                            {t("invoiceDetail.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(item.id)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            {t("invoiceDetail.reject")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </td>
                <td className={tdClass} dir="ltr">
                  {formatMoney(lineTotal)}
                </td>
                {canEditItems && (
                  <td className={tdClass}>
                    {isEditing ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveEdit(item.id)}
                          disabled={isPending}
                          className={btnPrimarySm}
                        >
                          {isPending ? t("common.saving") : t("invoiceDetail.save")}
                        </button>
                        <button type="button" onClick={cancelEdit} className={btnSecondarySm}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className={`${btnSecondarySm} gap-1`}
                        >
                          <Pencil className="h-3 w-3" />
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                          {t("invoiceDetail.remove")}
                        </button>
                      </div>
                    )}
                    {rowError[item.id] && (
                      <p className="mt-1 max-w-[180px] text-xs text-red-600">{rowError[item.id]}</p>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {canEditItems && (
        <div className="border-t border-slate-200 p-4">
          {!isAdding ? (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className={`${btnSecondarySm} gap-1`}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("invoiceDetail.addProductLine")}
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {!addProduct ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    autoFocus
                    value={addBarcode}
                    onChange={(event) => setAddBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleBarcodeEnter();
                      }
                    }}
                    placeholder={t("sales.barcode")}
                    className={`${inputClass} max-w-xs`}
                  />
                  <button type="button" onClick={resetAddLine} className={btnSecondarySm}>
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-slate-900">
                    {displayName(addProduct.name_en, addProduct.name_ar, locale)}
                  </span>
                  <select
                    value={addWarehouseId}
                    onChange={(event) => setAddWarehouseId(event.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="">{t("sales.chooseWarehouse")}</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name_en}
                      </option>
                    ))}
                  </select>
                  <QuantityStepper value={addQuantity} onChange={setAddQuantity} step={1} />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    value={addUnitPrice}
                    onChange={(event) => setAddUnitPrice(event.target.value)}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-end text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    dir="ltr"
                    placeholder={t("sales.colDiscount")}
                    value={addLineDiscount}
                    onChange={(event) => setAddLineDiscount(event.target.value)}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-end text-sm"
                  />
                  <input
                    type="text"
                    placeholder={t("sales.colDiscountNote")}
                    value={addDiscountNote}
                    onChange={(event) => setAddDiscountNote(event.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddLine}
                    disabled={isSubmittingAdd}
                    className={btnPrimarySm}
                  >
                    {isSubmittingAdd ? t("invoiceDetail.adding") : t("invoiceDetail.addLine")}
                  </button>
                  <button type="button" onClick={resetAddLine} className={btnSecondarySm}>
                    {t("common.cancel")}
                  </button>
                </div>
              )}
              {addMessage && (
                <p className="flex items-center gap-1 text-sm text-red-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {addMessage}
                </p>
              )}
              {addError && <p className="text-sm text-red-600">{addError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
