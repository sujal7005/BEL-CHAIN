const TONES = {
  active: "bg-green-100 text-green-800",
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  draft: "bg-gray-100 text-gray-700",
  rejected: "bg-red-100 text-red-800",
  revoked: "bg-red-100 text-red-800",
  archived: "bg-gray-200 text-gray-700",
  mismatch: "bg-red-100 text-red-800",
  match: "bg-green-100 text-green-800",
};

export default function StatusChip({ status, label, className = "" }) {
  const tone = TONES[status] || "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tone} ${className}`}
    >
      {label || status}
    </span>
  );
}