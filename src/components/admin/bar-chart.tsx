/**
 * Single-series daily bar chart (server-rendered, no JS required).
 * Colour #A6742A validated with the dataviz palette validator (light surface).
 * Each bar is a focusable hit target with a hover/focus tooltip; a table view is provided.
 */
export function BarChart({ title, data, format = (n) => n.toLocaleString("en-GB"), height = 160 }: {
  title: string; data: { day: string; value: number }[]; format?: (n: number) => string; height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  const label = (day: string) => new Date(day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <figure className="rounded-[var(--radius-md)] border border-line bg-white p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        <span className="text-[12px] text-muted">Total <strong className="text-ink">{format(total)}</strong></span>
      </figcaption>
      <div className="relative mt-4" style={{ height }}>
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[10.5px] text-muted" aria-hidden>{format(max)}</span>
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-silver" role="list" aria-label={`${title} by day`}>
          {data.map((d) => (
            <div key={d.day} role="listitem" tabIndex={0} aria-label={`${label(d.day)}: ${format(d.value)}`}
              className="group relative flex h-full flex-1 items-end outline-none">
              <div className="w-full rounded-t-[4px] bg-[#A6742A] transition-opacity group-hover:opacity-80 group-focus:opacity-80"
                style={{ height: d.value ? `${Math.max(2, (d.value / max) * 100)}%` : 0 }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-ink px-2 py-1 text-[11px] text-white shadow group-hover:block group-focus:block">
                <strong>{format(d.value)}</strong> <span className="text-white/60">{label(d.day)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-muted" aria-hidden>
        <span>{data[0] ? label(data[0].day) : ""}</span><span>{data.at(-1) ? label(data.at(-1)!.day) : ""}</span>
      </div>
      <details className="mt-3 text-[12px]">
        <summary className="cursor-pointer text-muted">Table view</summary>
        <table className="mt-2 w-full"><tbody>{data.filter((d) => d.value).map((d) => <tr key={d.day} className="border-b border-line"><td className="py-1 text-slate">{label(d.day)}</td><td className="py-1 text-right text-ink">{format(d.value)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
