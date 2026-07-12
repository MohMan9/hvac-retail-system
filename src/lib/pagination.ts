export const PAGE_SIZE = 20;

export function parsePage(pageParam: string | undefined) {
  const page = Number(pageParam);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function pageRange(page: number) {
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  return { from, to };
}

// Strip characters that are structurally significant to PostgREST's .or()
// filter syntax (comma separates conditions, parens group them), so
// free-text search input can't produce a malformed filter string.
export function sanitizeSearchTerm(term: string | undefined) {
  return (term ?? "").trim().replace(/[,()]/g, "");
}

export function buildPageHref(
  basePath: string,
  params: Record<string, string | undefined>,
  page: number
) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  search.set("page", String(page));
  return `${basePath}?${search.toString()}`;
}
