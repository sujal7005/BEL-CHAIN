import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

function shortHash(h, n = 8) {
  if (!h) return "";
  return h.length <= n * 2 ? h : `${h.slice(0, n)}…${h.slice(-n)}`;
}

function ChainResult({ chain }) {
  if (!chain) return null;
  return (
    <div
      className={`rounded-lg border p-4 ${
        chain.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div
        className={`font-semibold ${
          chain.ok ? "text-green-800" : "text-red-800"
        }`}
      >
        {chain.ok
          ? `✔ Chain OK · ${chain.count} entries`
          : `✘ Chain broken at index #${chain.brokenIndex} · ${chain.reason}`}
      </div>
      {!chain.ok && (
        <div className="mt-2 text-xs font-mono text-gray-700 break-all space-y-1">
          {chain.expected && (
            <div>
              <span className="text-gray-500">expected: </span>
              {chain.expected}
            </div>
          )}
          {chain.found && (
            <div>
              <span className="text-gray-500">found:    </span>
              {chain.found}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TamperDemo() {
  const [entries, setEntries] = useState([]);
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [log, setLog] = useState([]);

  async function refresh() {
    const [list, v] = await Promise.all([
      api.get("/ledger?limit=10").then((r) => r.data.entries),
      api.get("/ledger/verify").then((r) => r.data),
    ]);
    setEntries(list);
    setChain(v);
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  function pushLog(line) {
    setLog((l) => [{ at: new Date().toISOString(), text: line }, ...l].slice(0, 20));
  }

  async function tamper(index, field = "payloadHash") {
    setBusy(true);
    pushLog(`POST /ledger/__tamper  index=${index}  field=${field}`);
    try {
      const { data } = await api.post("/ledger/__tamper", { index, field });
      pushLog(
        `✔ tampered #${data.index}: ${data.field} ${String(data.before).slice(0, 12)}… → ${String(data.after).slice(0, 12)}…`
      );
      const v = await api.get("/ledger/verify");
      setChain(v.data);
      pushLog(
        v.data.ok
          ? `verify → OK (${v.data.count})`
          : `verify → BROKEN at #${v.data.brokenIndex} (${v.data.reason})`
      );
    } catch (e) {
      pushLog("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setBusy(false);
      const list = await api.get("/ledger?limit=10");
      setEntries(list.data.entries);
    }
  }

  async function restore() {
    setRestoring(true);
    pushLog("POST /ledger/__restore  (runs npm run seed)");
    try {
      const { data } = await api.post("/ledger/__restore", {});
      pushLog("✔ restored");
      if (data.output) pushLog(data.output.split("\n").slice(-3).join("\n"));
      await refresh();
    } catch (e) {
      pushLog("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Tamper demo</h1>
          <p className="text-sm text-gray-500">
            Edit a ledger entry directly in the database (bypassing the append-only guard)
            and watch the hash chain detect it. Dev only — disabled when{" "}
            <code>NODE_ENV=production</code>.
          </p>
        </div>
        <Link to="/ledger" className="text-sm text-amber-600 hover:underline whitespace-nowrap">
          ← Ledger
        </Link>
      </div>

      <ChainResult chain={chain} />

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold text-navy">Last 10 entries</div>
            <div className="text-xs text-gray-500">
              Tampering any row breaks the chain at that index and every subsequent one.
            </div>
          </div>
          <button
            onClick={restore}
            disabled={restoring}
            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-60"
            title="Runs npm run seed — full reset"
          >
            {restoring ? "Restoring…" : "Reset (re-seed)"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 w-16">#</th>
              <th className="text-left px-4 py-2">Action</th>
              <th className="text-left px-4 py-2">Entry hash</th>
              <th className="text-right px-4 py-2">Tamper</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e._id} className="border-t">
                <td className="px-4 py-2 font-mono text-xs">{e.index}</td>
                <td className="px-4 py-2">{e.action}</td>
                <td
                  className="px-4 py-2 font-mono text-xs text-gray-600 break-all"
                  title={e.entryHash}
                >
                  {shortHash(e.entryHash)}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    disabled={busy}
                    onClick={() => tamper(e.index, "payloadHash")}
                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded disabled:opacity-60"
                  >
                    Tamper payload
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => tamper(e.index, "timestamp")}
                    className="text-xs ml-2 border px-3 py-1.5 rounded disabled:opacity-60"
                  >
                    Tamper time
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-5 py-3 border-b">
          <div className="font-semibold text-navy">Activity log</div>
          <div className="text-xs text-gray-500">What the demo just did, step by step.</div>
        </div>
        <ul className="divide-y text-xs font-mono">
          {log.map((l, i) => (
            <li key={i} className="px-4 py-2 flex gap-3">
              <span className="text-gray-400 shrink-0">
                {new Date(l.at).toLocaleTimeString()}
              </span>
              <span className="text-gray-700 whitespace-pre-wrap break-all">{l.text}</span>
            </li>
          ))}
          {log.length === 0 && (
            <li className="px-4 py-4 text-gray-500">Click a "Tamper" button to start.</li>
          )}
        </ul>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <div className="font-semibold mb-1">Why this matters</div>
        <p>
          The ledger is append-only and hash-linked. If someone with DB access flips a single
          byte, the recomputed hash no longer equals the stored <code>entryHash</code>, and the
          next link's <code>prevHash</code> no longer matches. <b>Verify chain</b> catches both.
          That's the whole point of tamper-evidence — you don't need to trust the database,
          you verify it.
        </p>
      </div>
    </div>
  );
}