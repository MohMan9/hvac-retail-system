// Shared Tailwind class tokens for the design system. Centralizing these
// strings is what keeps buttons/inputs/tables visually consistent across
// dozens of pages instead of each one drifting slightly.

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40";

export const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export const cardClass = "rounded-xl border border-slate-200 bg-white";

export const tableWrapClass = "overflow-hidden rounded-xl border border-slate-200 bg-white";
export const theadRowClass = "border-b border-slate-200 bg-slate-50";
export const thClass = "px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-slate-500";
export const tdClass = "px-4 py-3 text-sm text-slate-700";
export const trClass = "border-b border-slate-100 last:border-0 hover:bg-slate-50";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const btnPrimary = `${btnBase} bg-blue-600 px-4 py-2 text-white hover:bg-blue-700`;
export const btnSecondary = `${btnBase} border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50`;
export const btnDestructiveOutline = `${btnBase} border border-red-300 px-4 py-2 text-red-600 hover:bg-red-50`;
export const btnDestructiveSolid = `${btnBase} bg-red-600 px-4 py-2 text-white hover:bg-red-700`;

export const btnPrimarySm = `${btnBase} bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700`;
export const btnSecondarySm = `${btnBase} border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50`;
export const btnDestructiveOutlineSm = `${btnBase} border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50`;

export const pageTitleClass = "text-2xl font-semibold text-slate-900";
export const sectionTitleClass = "text-lg font-semibold text-slate-900";
export const mutedTextClass = "text-sm text-slate-500";

export const linkClass = "text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline";
