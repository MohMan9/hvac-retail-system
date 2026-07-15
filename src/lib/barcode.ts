// Serialized products (serial_suffix_length > 0) share a common barcode PREFIX
// across every physical unit; the last `serialSuffixLength` characters differ
// per unit and are stripped before storing. serial_suffix_length = 0 means a
// normal fixed barcode, stored exactly as scanned. The find_product_by_barcode
// RPC mirrors this: 0 = exact match, > 0 = prefix match.
export function truncateBarcode(barcode: string, serialSuffixLength: number): string {
  if (!Number.isFinite(serialSuffixLength) || serialSuffixLength <= 0) {
    return barcode;
  }
  return barcode.slice(0, Math.max(0, barcode.length - serialSuffixLength));
}

// Parse a raw serial-suffix-length form value into a safe non-negative integer.
export function parseSerialSuffixLength(raw: FormDataEntryValue | null | undefined): number {
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
