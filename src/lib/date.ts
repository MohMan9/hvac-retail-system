// The shop operates in Palestine (Asia/Hebron). Using UTC-based date math
// (e.g. `new Date().toISOString().slice(0, 10)`) means that between local
// midnight and UTC midnight, "today" resolves to the wrong calendar day —
// so late-evening sales get stamped with yesterday's date and the dashboard
// "today"/"this month" stats query the wrong period. Always derive the local
// date through the shop's timezone instead.
export const SHOP_TIMEZONE = "Asia/Hebron";

// Returns today's date in the shop's timezone as a "YYYY-MM-DD" string.
// The en-CA locale formats dates as YYYY-MM-DD, so no reordering is needed.
export function todayInShopTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIMEZONE }).format(new Date());
}

// Returns the first day of the current month in the shop's timezone as
// "YYYY-MM-DD" — used by month-to-date stats.
export function monthStartInShopTimezone(): string {
  return `${todayInShopTimezone().slice(0, 7)}-01`;
}

// Returns the current month in the shop's timezone as "YYYY-MM" — used as the
// default value for the finance report's month picker.
export function currentMonthInShopTimezone(): string {
  return todayInShopTimezone().slice(0, 7);
}

// Formats an ISO timestamp for display in the shop's timezone, localized to
// the given UI locale. Falls back to the raw value if it can't be parsed
// (e.g. an unexpected/null-ish string) rather than throwing.
export function formatShopDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(locale, {
    timeZone: SHOP_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
