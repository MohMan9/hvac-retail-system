"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { marginPercent, priceFromMargin } from "@/lib/margin";
import { inputClass, labelClass } from "@/lib/ui";

const fieldsetClass = "rounded-lg border border-slate-200 p-4";
const legendClass = "px-1 text-sm font-medium text-slate-700";

const TIERS = ["wholesale", "craftsman", "shop", "retail"] as const;
type Tier = (typeof TIERS)[number];

const tierLabelKeys: Record<Tier, keyof Dictionary> = {
  wholesale: "productForm.wholesalePrice",
  craftsman: "productForm.craftsmanPrice",
  shop: "productForm.shopPrice",
  retail: "productForm.retailPrice",
};

const tierFieldNames: Record<Tier, string> = {
  wholesale: "price_wholesale",
  craftsman: "price_craftsman",
  shop: "price_shop",
  retail: "price_retail",
};

export type PricingCostInitial = {
  price_wholesale: number | string | null;
  price_craftsman: number | string | null;
  price_shop: number | string | null;
  price_retail: number | string | null;
  factory_price: number | string | null;
  shipping_cost: number | string | null;
  customs_cost: number | string | null;
};

function toInputString(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

// Parses an input string to a number, treating empty/invalid as 0 (used for
// summing the landed cost).
function toAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Rounds to at most `decimals` places and returns a clean string (no forced
// trailing zeros). Only ever used to fill the OTHER field during bidirectional
// recalculation — never the field the user is actively typing in.
function roundToString(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

// Is this input string a usable number (so we can compute the paired field)?
function isNumeric(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

// Margin display string for a price against a landed cost. An empty/invalid
// price yields "" (rather than a misleading margin computed from 0).
function deriveMargin(priceValue: string, landedCost: number) {
  if (!isNumeric(priceValue)) {
    return "";
  }
  const margin = marginPercent(Number(priceValue), landedCost);
  return margin === null ? "" : roundToString(margin, 2);
}

type PriceRecord = Record<Tier, string>;

function buildPriceRecord(initial: PricingCostInitial | undefined): PriceRecord {
  return {
    wholesale: toInputString(initial?.price_wholesale),
    craftsman: toInputString(initial?.price_craftsman),
    shop: toInputString(initial?.price_shop),
    retail: toInputString(initial?.price_retail),
  };
}

// The pricing (and, for cost-viewers, cost) section of the product create/edit
// forms. For users WITHOUT view_product_costs this renders exactly the plain
// price inputs as before — margin mode is purely additive for cost-viewers.
export function PricingCostSection({
  canViewCosts,
  initial,
}: {
  canViewCosts: boolean;
  initial?: PricingCostInitial;
}) {
  const { t } = useLocale();

  const [prices, setPrices] = useState<PriceRecord>(() => buildPriceRecord(initial));
  const [factory, setFactory] = useState(() => toInputString(initial?.factory_price));
  const [shipping, setShipping] = useState(() => toInputString(initial?.shipping_cost));
  const [customs, setCustoms] = useState(() => toInputString(initial?.customs_cost));

  // Margins are derived, but kept in state so the user can also type into them
  // (driving the price). Seed from the initial price + cost values.
  const [margins, setMargins] = useState<PriceRecord>(() => {
    const seededLanded =
      toAmount(toInputString(initial?.factory_price)) +
      toAmount(toInputString(initial?.shipping_cost)) +
      toAmount(toInputString(initial?.customs_cost));
    const seededPrices = buildPriceRecord(initial);
    const record = {} as PriceRecord;
    for (const tier of TIERS) {
      record[tier] = deriveMargin(seededPrices[tier], seededLanded);
    }
    return record;
  });

  const landedCost = toAmount(factory) + toAmount(shipping) + toAmount(customs);
  const hasCost = landedCost > 0;

  // Typing a PRICE: keep the price string exactly as typed (no reformatting)
  // and only recompute the paired margin display.
  function handlePriceChange(tier: Tier, value: string) {
    setPrices((current) => ({ ...current, [tier]: value }));
    if (!hasCost) {
      return;
    }
    setMargins((current) => ({ ...current, [tier]: deriveMargin(value, landedCost) }));
  }

  // Typing a MARGIN: keep the margin string exactly as typed and recompute the
  // paired price (which is the value actually submitted).
  function handleMarginChange(tier: Tier, value: string) {
    setMargins((current) => ({ ...current, [tier]: value }));
    if (!hasCost) {
      return;
    }
    setPrices((current) => {
      if (!isNumeric(value)) {
        return { ...current, [tier]: "" };
      }
      return { ...current, [tier]: roundToString(priceFromMargin(landedCost, Number(value)), 2) };
    });
  }

  // Editing a COST field: keep it as typed and refresh every tier's margin
  // display from its current price against the new landed cost.
  function handleCostChange(setter: (value: string) => void, value: string, nextLanded: number) {
    setter(value);
    setMargins((current) => {
      const record = { ...current };
      for (const tier of TIERS) {
        record[tier] = deriveMargin(prices[tier], nextLanded);
      }
      return record;
    });
  }

  // Plain price inputs for users who can't see costs — unchanged from before.
  if (!canViewCosts) {
    return (
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t("productForm.pricingLegend")}</legend>
        <div className="flex flex-col gap-4">
          {TIERS.map((tier) => (
            <div key={tier}>
              <label className={labelClass}>{t(tierLabelKeys[tier])}</label>
              <input
                name={tierFieldNames[tier]}
                type="number"
                step="0.01"
                min={0}
                required
                dir="ltr"
                defaultValue={toInputString(initial?.[`price_${tier}` as const])}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <>
      {/* Cost first so margins below can be computed from a live landed cost. */}
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t("productForm.costLegend")}</legend>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("productForm.factoryPrice")}</label>
            <input
              name="factory_price"
              type="number"
              step="0.01"
              min={0}
              dir="ltr"
              value={factory}
              onChange={(event) =>
                handleCostChange(
                  setFactory,
                  event.target.value,
                  toAmount(event.target.value) + toAmount(shipping) + toAmount(customs)
                )
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("productForm.shippingCost")}</label>
            <input
              name="shipping_cost"
              type="number"
              step="0.01"
              min={0}
              dir="ltr"
              value={shipping}
              onChange={(event) =>
                handleCostChange(
                  setShipping,
                  event.target.value,
                  toAmount(factory) + toAmount(event.target.value) + toAmount(customs)
                )
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("productForm.customsCost")}</label>
            <input
              name="customs_cost"
              type="number"
              step="0.01"
              min={0}
              dir="ltr"
              value={customs}
              onChange={(event) =>
                handleCostChange(
                  setCustoms,
                  event.target.value,
                  toAmount(factory) + toAmount(shipping) + toAmount(event.target.value)
                )
              }
              className={inputClass}
            />
          </div>

          <p className="text-sm text-slate-500">
            {t("productForm.landedCost")}:{" "}
            <span className="font-medium text-slate-700" dir="ltr">
              {roundToString(landedCost, 2)}
            </span>
          </p>
        </div>
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t("productForm.pricingLegend")}</legend>

        {hasCost ? (
          <p className="mb-3 text-xs text-slate-500">{t("productForm.marginModeHint")}</p>
        ) : (
          <p className="mb-3 text-xs text-slate-400">{t("productForm.marginNeedCost")}</p>
        )}

        <div className="flex flex-col gap-4">
          {TIERS.map((tier) => (
            <div key={tier}>
              <label className={labelClass}>{t(tierLabelKeys[tier])}</label>
              <div className="grid grid-cols-2 gap-3">
                {/* Price — the value actually submitted. Kept raw as typed. */}
                <input
                  name={tierFieldNames[tier]}
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  dir="ltr"
                  value={prices[tier]}
                  onChange={(event) => handlePriceChange(tier, event.target.value)}
                  className={inputClass}
                />
                {/* Margin % — recalculates the price. Not submitted. */}
                <input
                  type="number"
                  step="0.01"
                  dir="ltr"
                  value={margins[tier]}
                  onChange={(event) => handleMarginChange(tier, event.target.value)}
                  disabled={!hasCost}
                  placeholder={t("productForm.margin")}
                  aria-label={t("productForm.margin")}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                />
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </>
  );
}
