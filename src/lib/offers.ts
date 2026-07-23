// Shared helpers for quantity-based pricing rules ("offers"). Kept free of any
// server-only imports so both Client Components (live overlap check) and Server
// Actions (defense-in-depth re-check) can use them.

export type OfferInput = {
  product_id: string;
  min_qty: number;
  max_qty: number;
  price: number;
};

// A minimal shape carrying just the fields needed to test range overlap.
export type OfferRange = {
  id: string;
  product_id: string;
  min_qty: number;
  max_qty: number;
};

// Two inclusive quantity ranges [aMin, aMax] and [bMin, bMax] overlap when each
// starts at or before the other ends.
export function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number) {
  return aMin <= bMax && bMin <= aMax;
}

// Does [minQty, maxQty] overlap any existing rule for the same product? When
// editing an existing rule, pass its id as excludeId so it doesn't count as
// overlapping itself.
export function overlapsExistingRule(
  rules: OfferRange[],
  productId: string,
  minQty: number,
  maxQty: number,
  excludeId?: string | null
) {
  return rules.some(
    (rule) =>
      rule.product_id === productId &&
      rule.id !== excludeId &&
      rangesOverlap(minQty, maxQty, rule.min_qty, rule.max_qty)
  );
}
