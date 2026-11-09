export default function StatCard({ label, value, hint, tone = "default" }) {
  const toneCls =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : "border-gray-200 bg-white";
  const valueCls =
    tone === "danger"
      ? "text-red-700"
      : tone === "warn"
      ? "text-amber-700"
      : "text-navy";
  return (
    <div className={`rounded-lg border ${toneCls} p-5 shadow-sm`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${valueCls}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}