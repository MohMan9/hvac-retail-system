// Profit-margin math shared between the product form (live bidirectional
// price/margin inputs) and the product list (read-only margin display).
//
// margin% = (price - landed_cost) / landed_cost * 100
// price   = landed_cost * (1 + margin% / 100)
//
// Margin is ALWAYS derived from cost + price on the fly and never stored, so it
// can't drift out of sync with the real numbers.

// Returns the margin percentage for a price against a landed cost, or null when
// the cost isn't a usable positive number (avoids dividing by zero).
export function marginPercent(price: number, landedCost: number): number | null {
  if (!(landedCost > 0)) {
    return null;
  }
  return ((price - landedCost) / landedCost) * 100;
}

// Returns the price implied by a margin percentage over a landed cost.
export function priceFromMargin(landedCost: number, marginPct: number): number {
  return landedCost * (1 + marginPct / 100);
}
