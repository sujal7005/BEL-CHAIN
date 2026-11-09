import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import DataTable from "../components/DataTable";

function ChainBadge({ result }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
        ✔ Chain OK · {result.count} entries
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
      ✘ Broken at #{result.brokenIndex} · {result.reason}
    </span>
  );
}

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [chain, setChain] = useState(null);

  const load = (p = page) => {
    setLoading(true);
    setErr("");
    api
      .get(`/ledger?page=${p}&limit=25`)
      .then((r) => {
        setEntries(r.data.entries);
        setPage(r.data.page);
        setPages(r.data.pages);
        setTotal(r.data.total);
      })
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line
  }, []);

  async function verifyChain() {
    setVerifying(true);
    setChain(null);
    try {
      const { data } = await api.get("/ledger/verify");
      setChain(data);
    } catch (e) {
      setChain({ ok: false, reason: e.response?.data?.error || e.message });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Ledger explorer</h1>
          <p className="text-sm text-gray-500">
            Append-only, hash-linked. Never updated, never deleted. Only hashes and metadata
            — no personal data.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={verifyChain}
            disabled={verifying}
            className="bg-navy text-white font-semibold px-4 py-2 rounded disabled:opacity-60"
          >
            {verifying ? "Verifying…" : "Verify chain"}
          </button>
          <Link
            to="/tamper"
            className="text-sm text-amber-600 hover:underline whitespace-nowrap"
          >
            Tamper demo →
          </Link>
        </div>
      </div>

      {chain && (
        <div
          className={`rounded-lg p-4 border ${
            chain.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <ChainBadge result={chain} />
          {!chain.ok && (
            <div className="mt-2 text-xs font-mono text-gray-700 break-all">
              {chain.expected && <div>expected: {chain.expected}</div>}
              {chain.found && <div>found:    {chain.found}</div>}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between text-sm text-gray-600">
          <span>
            {total} entries · page {page} of {pages || 1}
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
        ) : entries.length === 0 ? (
          <div className="p-6 text-gray-500">No ledger entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 w-16">#</th>
                <th className="text-left px-4 py-2">Action</th>
                <th className="text-left px-4 py-2">Org</th>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Payload hash</th>
                <th className="text-left px-4 py-2">Entry hash</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{e.index}</td>
                  <td className="px-4 py-2">
                    <span className="text-gray-800">{e.action}</span>
                    {e.meta?.title && (
                      <span className="text-gray-500"> — {e.meta.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{e.orgId?.name || "—"}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-2 font-mono text-xs text-gray-600 break-all"
                    title={e.payloadHash}
                  >
                    {DataTable(e.payloadHash)}
                  </td>
                  <td
                    className="px-4 py-2 font-mono text-xs text-gray-600 break-all"
                    title={e.entryHash}
                  >
                    {DataTable(e.entryHash)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Prototype: simulated ledger (MongoDB). Not a real blockchain.{" "}
        <span className="text-amber-600">See the README for what's real vs simulated.</span>
      </p>
    </div>
  );
}