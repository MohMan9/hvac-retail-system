// Small "5 minutes ago" style formatter. Uses Intl.RelativeTimeFormat so the
// output is localized (English/Arabic) with correct pluralization for free,
// instead of hand-rolled English-only strings.
export function formatRelativeTime(dateString: string, locale: string = "en"): string {
  const diffSeconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (diffSeconds < 60) {
    return rtf.format(0, "second");
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return rtf.format(-diffMinutes, "minute");
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return rtf.format(-diffHours, "hour");
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return rtf.format(-diffDays, "day");
  }

  const diffMonths = Math.floor(diffDays / 30);
  return rtf.format(-diffMonths, "month");
}
