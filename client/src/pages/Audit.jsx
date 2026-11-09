import { useEffect, useState } from "react";
import { api } from "../api/client";
import DataTable from "../components/DataTable";

function rowTone(action) {
  if (action === "verify:mismatch" || action === "ledger:tamper-dev") return "bg-red-50";
  if (action?.startsWith("approval:")) return "bg-amber-50";
  return "";
}

function shortId(v) {
  if (!v) return "—";
  return typeof v === "string" ? v.slice(0, 8) : v._id?.slice(0, 8) || "—";
}

export default function Audit() {
  const [events, setEvents] = useState([]);
  const [actions, setActions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [filters, setFilters] = useState({
    action: "",
    from: "",
    to: "",
    mismatchOnly: false,
  });

  const load = (p = page, f = filters) => {
    setLoading(true);
    setErr("");
    const q = new URLSearchParams();
    q.set("page", String(p));
    q.set("limit", "50");
    if (f.action) q.set("action", f.action);
    if (f.from) q.set("from", new Date(f.from).toISOString());
    if (f.to) q.set("to", new Date(f.to).toISOString());
    if (f.mismatchOnly) q.set("mismatchOnly", "1");

    api
      .get(`/audit?${q.toString()}`)
      .then((r) => {
        setEvents(r.data.events);
        setTotal(r.data.total);
        setPage(r.data.page);
        setPages(r.data.pages);
      })
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/audit/actions").then((r) => setActions(r.data.actions)).catch(() => {});
    load(1, filters);
    // eslint-disable-next-line
  }, []);

  function apply() {
    load(1, filters);
  }
  function reset() {
    const f = { action: "", from: "", to: "", mismatchOnly: false };
    setFilters(f);
    load(1, f);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Audit log</h1>
        <p className="text-sm text-gray-500">
          Every state-changing action writes a row. Mismatch and tamper events are highlighted.
        </p>
      </div>

      {/* filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <label className="block">
            <span className="text-xs text-gray-600">Action</span>
            <select
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              {actions.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">From</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">To</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className="mt-1 w-full border rounded px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600">Only problems</span>
            <div className="mt-1 flex items-center h-[34px]">
              <input
                type="checkbox"
                checked={filters.mismatchOnly}
                onChange={(e) => setFilters((f) => ({ ...f, mismatchOnly: e.target.checked }))}
                className="mr-2"
              />
              <span className="text-xs text-gray-600">mismatch / tamper only</span>
            </div>
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={apply}
              className="bg-amber text-navy font-semibold px-3 py-1.5 rounded text-sm"
            >
              Apply
            </button>
            <button onClick={reset} className="text-sm text-gray-600 hover:underline">
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between text-sm text-gray-600">
          <span>
            {total} events · page {page} of {pages || 1}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              ← Prev
            </button>
            <button
              disabled={page >= pages}
              onClick={() => load(page + 1)}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-gray-500">Loading…</div>
        ) : err ? (
          <div className="p-6 text-red-600">{err}</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-gray-500">No audit events match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Org</th>
                <th className="text-left px-4 py-2">Resource</th>
                <th className="text-left px-4 py-2">Meta</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e._id}
                  className={`border-t ${rowTone(e.action)}`}
                >
                  <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {e.userId?.name || e.userId?.email || "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{e.orgId?.name || "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {shortId(e.resourceId)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600 break-all max-w-xs">
                    {e.meta && Object.keys(e.meta).length > 0
                      ? Object.entries(e.meta)
                          .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
                          .join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}