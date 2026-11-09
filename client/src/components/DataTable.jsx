export default function DataTable({
  columns,
  rows,
  rowKey = (r) => r._id,
  rowClassName,
  onRowClick,
  loading,
  empty,
}) {
  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!rows || rows.length === 0) {
    return <div className="p-6 text-gray-500">{empty || "No rows."}</div>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-600">
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              className={`text-left px-4 py-2 ${c.className || ""}`}
              style={c.width ? { width: c.width } : undefined}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={rowKey(r)}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            className={`border-t ${
              rowClassName ? rowClassName(r) : ""
            } ${onRowClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
          >
            {columns.map((c) => (
              <td key={c.key} className={`px-4 py-2 ${c.cellClassName || ""}`}>
                {c.render ? c.render(r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}