"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { overlapsExistingRule, type OfferInput, type OfferRange } from "@/lib/offers";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type ProductOption = { id: string; name: string };

type InitialValues = {
  productId: string;
  minQty: string;
  maxQty: string;
  price: string;
};

function parseDecimal(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Shared create/edit form for a quantity price rule. `submit` is the route's
// Server Action (create, or update bound to the rule id); on success it
// redirects, so only the failure branch returns here.
export function OfferForm({
  products,
  existingRules,
  submit,
  initialValues,
  excludeRuleId,
  submitLabelKey,
}: {
  products: ProductOption[];
  existingRules: OfferRange[];
  submit: (input: OfferInput) => Promise<{ success: false; error: string }>;
  initialValues?: InitialValues;
  excludeRuleId?: string | null;
  submitLabelKey: "offers.createButton" | "offers.saveButton";
}) {
  const { t } = useLocale();

  const [productId, setProductId] = useState(initialValues?.productId ?? "");
  const [productSearch, setProductSearch] = useState(
    () => products.find((product) => product.id === initialValues?.productId)?.name ?? ""
  );
  const [isProductListOpen, setIsProductListOpen] = useState(false);
  const [minQty, setMinQty] = useState(initialValues?.minQty ?? "");
  const [maxQty, setMaxQty] = useState(initialValues?.maxQty ?? "");
  const [price, setPrice] = useState(initialValues?.price ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const productPickerRef = useRef<HTMLDivElement>(null);

  // Close the product results dropdown when tapping/clicking outside of it.
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

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase())
  );

  const minValue = parseDecimal(minQty);
  const maxValue = parseDecimal(maxQty);
  // Live overlap check against the selected product's other rules. Recomputed on
  // every keystroke so the cashier sees the conflict before submitting.
  const hasOverlap =
    Boolean(productId) &&
    minQty !== "" &&
    maxQty !== "" &&
    maxValue >= minValue &&
    overlapsExistingRule(existingRules, productId, minValue, maxValue, excludeRuleId);

  function selectProduct(product: ProductOption) {
    setProductId(product.id);
    setProductSearch(product.name);
    setIsProductListOpen(false);
  }

  function handleProductInputChange(value: string) {
    setProductSearch(value);
    setIsProductListOpen(true);
    if (productId) {
      setProductId("");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!productId) {
      setError(t("offers.selectProductError"));
      return;
    }

    if (minQty === "" || maxQty === "" || price === "") {
      setError(t("offers.allFieldsRequired"));
      return;
    }

    if (maxValue < minValue) {
      setError(t("offers.invalidRange"));
      return;
    }

    if (hasOverlap) {
      setError(t("offers.overlapError"));
      return;
    }

    setIsSubmitting(true);
    const result = await submit({
      product_id: productId,
      min_qty: minValue,
      max_qty: maxValue,
      price: parseDecimal(price),
    });

    // Success redirects inside the action; only failures land here.
    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("offers.product")}</label>
        {/* Searchable product picker, same combobox pattern as the sales screen. */}
        <div ref={productPickerRef} className="relative">
          <input
            type="text"
            value={productSearch}
            onChange={(event) => handleProductInputChange(event.target.value)}
            onFocus={() => setIsProductListOpen(true)}
            placeholder={t("offers.searchProducts")}
            className={`${inputClass} ${productId ? "border-blue-400 bg-blue-50/40" : ""}`}
          />
          {isProductListOpen && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {filteredProducts.length === 0 ? (
                <li className="px-3 py-3 text-center text-sm text-slate-500">
                  {t("offers.noProductsMatch")}
                </li>
              ) : (
                filteredProducts.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => selectProduct(product)}
                      className={`w-full px-3 py-3 text-start text-sm hover:bg-slate-50 ${
                        product.id === productId ? "bg-blue-50 font-medium" : ""
                      }`}
                    >
                      {product.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>{t("offers.minQty")}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          value={minQty}
          onChange={(event) => setMinQty(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("offers.maxQty")}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          value={maxQty}
          onChange={(event) => setMaxQty(event.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("offers.price")}</label>
        <input
          type="number"
          min="0"
          step="0.01"
          dir="ltr"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className={inputClass}
        />
      </div>

      {hasOverlap && <p className="text-sm text-amber-600">{t("offers.overlapError")}</p>}

      <button
        type="submit"
        disabled={isSubmitting || hasOverlap}
        className={`${btnPrimary} mt-2`}
      >
        {isSubmitting ? t("common.saving") : t(submitLabelKey)}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
