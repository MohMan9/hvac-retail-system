import {
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

const columns = Array.from({ length: 8 });
const rows = Array.from({ length: 6 });

export default function ProductsLoading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-8 py-6" aria-busy="true">
      <div className="mb-6 flex items-center justify-between">
        <div className={`${pageTitleClass} h-8 w-40 rounded bg-slate-200`} />
        <div className="h-10 w-28 rounded-lg bg-slate-200" />
      </div>

      <div className="mb-4 h-10 w-full max-w-sm rounded-lg bg-slate-200" />

      <div className={tableWrapClass}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={theadRowClass}>
              {columns.map((_, columnIndex) => (
                <th key={columnIndex} className={thClass}>
                  <div className="h-4 w-16 rounded bg-slate-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((_, rowIndex) => (
              <tr key={rowIndex} className={trClass}>
                {columns.map((_, columnIndex) => (
                  <td key={columnIndex} className={tdClass}>
                    <div
                      className={`h-4 rounded bg-slate-200 ${
                        columnIndex === 0 ? "w-32" : "w-14"
                      }`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
