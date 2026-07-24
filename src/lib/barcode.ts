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

// Decides which barcode value an EDIT should store.
//
// Truncation may only ever be applied to a genuinely NEW barcode string. What is
// stored for a serialized product is ALREADY the truncated prefix, so blindly
// truncating whatever the form submits would strip another `serialSuffixLength`
// real characters on every single save — cumulatively shortening the barcode
// until it is empty.
//
// `current` must be read fresh from the database by the caller, never taken from
// a client-supplied "original value" field: a stale or missing client value is
// exactly how the previous attempt at this fix failed. A byte-for-byte match
// against the stored value is authoritative and cannot be defeated by client
// state.
export function resolveEditedBarcode({
  submitted,
  current,
  serialSuffixLength,
}: {
  submitted: string;
  current: string;
  serialSuffixLength: number;
}): string {
  // Identical to what's stored: the user did not touch the barcode. Keep it
  // exactly as-is regardless of serialSuffixLength. This also covers the
  // "changed only the serial suffix length" path, so a new N can never
  // re-truncate an already-short stored prefix.
  if (submitted === current) {
    return current;
  }

  // Genuinely different: the user typed or scanned a new full code, so strip the
  // per-unit suffix from that NEW value.
  return truncateBarcode(submitted, serialSuffixLength);
}
