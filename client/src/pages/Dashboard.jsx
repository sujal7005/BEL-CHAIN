import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";

function shortHash(h) {
  return h ? h.slice(0, 8) + "…" + h.slice(-6) : "";
}

function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    api
      .get("/dashboard")
      .then((r) => mounted && setData(r.data))
      .catch((e) => mounted && setErr(e.response?.data?.error || e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-gray-500">Loading dashboard…</div>
    );
  }
  if (err) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
          Failed to load dashboard: {err}
        </div>
      </div>
    );
  }

  const { stats, recentLedger, needsApproval, members } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Dashboard</h1>
        <p className="text-sm text-gray-500">A quick snapshot of your organisation and the network.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Records" value={stats.records} hint="In your scope" />
        <StatCard
          label="Pending approvals"
          value={stats.pendingApprovals}
          hint="High-risk actions awaiting sign-off"
          tone={stats.pendingApprovals > 0 ? "warn" : "default"}
        />
        <StatCard label="Ledger entries" value={stats.ledgerEntries} hint="Append-only, hash-linked" accent="amber" />
        <StatCard
          label="Verification failures"
          value={stats.verificationFailures}
          hint="Last 7 days"
          tone={stats.verificationFailures > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent ledger */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-navy">Recent ledger activity</h2>
              <p className="text-xs text-gray-500">Append-only — other orgs see only hashes and metadata</p>
            </div>
            <Link to="/ledger" className="text-sm text-amber-600 hover:underline">
              Open explorer →
            </Link>
          </div>
          <div className="divide-y">
            {recentLedger.length === 0 && (
              <div className="p-6 text-sm text-gray-500">No ledger entries yet.</div>
            )}
            {recentLedger.map((e) => (
              <div key={e._id} className="px-5 py-3 flex items-center gap-3">
                <div className="w-12 text-xs text-gray-400 font-mono">#{e.index}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {e.action}
                    {e.meta?.title ? ` — ${e.meta.title}` : ""}
                  </div>
                  <div className="text-xs text-gray-500">
                    {e.orgId?.name || "—"} · {timeAgo(e.timestamp)}
                  </div>
                </div>
                <div className="hidden sm:block text-xs font-mono text-gray-500">
                  {shortHash(e.entryHash)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Needs approval */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-navy">Needs approval</h2>
            <Link to="/approvals" className="text-sm text-amber-600 hover:underline">
              All →
            </Link>
          </div>
          <div className="divide-y">
            {needsApproval.length === 0 && (
              <div className="p-6 text-sm text-gray-500">Nothing pending. </div>
            )}
            {needsApproval.map((a) => (
              <div key={a._id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {a.action}
                  </div>
                  <StatusChip status={a.status} />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {a.recordId?.title || a.recordId?.templateKey || "—"} ·{" "}
                  {a.approvals?.length || 0}/{a.requiredApprovals} approvals
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Requested by {a.requestedBy?.name || a.requestedBy?.email || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Network members */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-navy">Network members</h2>
          <p className="text-xs text-gray-500">Organizations on this BEL-Chain network</p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <div key={m._id} className="border border-gray-200 rounded p-3">
              <div className="font-medium text-gray-800 truncate">{m.name}</div>
              <div className="text-xs text-gray-500 mt-1">
                {m.type} · pack <span className="font-mono">{m.packId}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                joined {new Date(m.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}