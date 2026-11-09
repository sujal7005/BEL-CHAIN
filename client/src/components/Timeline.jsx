export default function Timeline({ items, emptyLabel = "No history yet." }) {
  if (!items?.length) {
    return <div className="text-sm text-gray-500">{emptyLabel}</div>;
  }
  return (
    <ol className="relative border-l border-gray-200 ml-3 space-y-4">
      {items.map((it, i) => (
        <li key={i} className="ml-5">
          <div
            className={`absolute -left-1.5 w-3 h-3 rounded-full ${
              it.kind === "ledger" ? "bg-amber" : "bg-navy"
            }`}
          />
          <div className="text-sm font-medium text-gray-800">
            {it.kind === "ledger"
              ? `Ledger #${it.index} · ${it.action}`
              : `Version v${it.version}`}
          </div>
          <div className="text-xs text-gray-500">
            {new Date(it.at).toLocaleString()}
            {it.note ? ` · ${it.note}` : ""}
          </div>
          {it.entryHash && (
            <div className="text-[11px] font-mono text-gray-400 break-all">
              {it.entryHash}
            </div>
          )}
          {it.fieldsHash && (
            <div className="text-[11px] font-mono text-gray-400 break-all">
              {it.fieldsHash}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}