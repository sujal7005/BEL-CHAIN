import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import StatusChip from '../components/StatusChip';


function ApprovalRow({ a, onDecide, busy }) {
  const votes = a.approvals || [];
  const approveCount = votes.filter((v) => v.decision === "approve").length;
  const rejectCount = votes.filter((v) => v.decision === "reject").length;

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-navy">{a.action}</span>
            <StatusChip status={a.status} />
            {a.isRequester && (
              <span className="text-[10px] uppercase bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                your request
              </span>
            )}
            {a.alreadyVoted && (
              <span className="text-[10px] uppercase bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                you voted
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {a.recordId ? (
              <>
                record:{" "}
                <Link
                  to={`/records/${a.recordId._id}`}
                  className="text-amber-600 hover:underline"
                >
                  {a.recordId.title || a.recordId.templateKey}
                </Link>{" "}
                · v{a.recordId.version}
              </>
            ) : (
                "record deleted"
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            requested by {a.requestedBy?.name || a.requestedBy?.email || "—"} ·{" "}
            {new Date(a.createdAt).toLocaleString()}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-xs text-gray-500">Approvals</div>
          <div className="text-lg font-semibold text-navy">
            {approveCount}
            <span className="text-gray-400 text-sm">/{a.requiredApprovals}</span>
          </div>
          {rejectCount > 0 && (
            <div className="text-xs text-red-600">{rejectCount} reject</div>
          )}
        </div>
      </div>

      {a.payload?.proposedFields && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-700 select-none">
            Proposed changes
          </summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs bg-gray-50 border rounded p-2">
            {Object.entries(a.payload.proposedFields).map(([k, v]) => (
              <div key={k}>
                <span className="text-gray-500">{k}:</span>{" "}
                <span className="text-gray-800 font-mono break-all">{String(v ?? "")}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {votes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-700 select-none">
            Vote history ({votes.length})
          </summary>
          <ul className="mt-2 text-xs space-y-1">
            {votes.map((v, i) => (
              <li key={i} className="text-gray-600">
                <span
                  className={
                    v.decision === "approve" ? "text-green-700 font-medium" : "text-red-700 font-medium"
                  }
                >
                  {v.decision}
                </span>{" "}
                by {v.userId?.name || v.userId?.email || "—"} ·{" "}
                {new Date(v.at).toLocaleString()}
                {v.note ? ` — "${v.note}"` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {a.status === "pending" && a.canVote && (
        <div className="flex gap-2 pt-1">
          <button
            disabled={busy}
            onClick={() => onDecide(a._id, "approve")}
            className="bg-amber text-navy font-semibold px-4 py-2 rounded disabled:opacity-60"
          >
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => onDecide(a._id, "reject")}
            className="bg-red-600 text-white font-semibold px-4 py-2 rounded disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {a.status === "pending" && !a.canVote && (
        <div className="text-xs text-gray-500">
          {a.isRequester
            ? "You cannot vote on your own request."
            : a.alreadyVoted
            ? "You already voted on this request."
            : "Awaiting votes from other approvers."}
        </div>
      )}
    </div>
  );
}

export default function Approvals() {
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState("");

  const load = () => {
    setLoading(true);
    setErr("");
    api
      .get(`/approvals?status=${tab}`)
      .then((r) => setItems(r.data.approvals || []))
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  async function decide(id, decision) {
    setBusy(true);
    setFlash("");
    try {
      const res = await api.post(`/approvals/${id}/${decision}`, {});
      if (res.data.finalized && res.data.rejected) {
        setFlash("❌ Rejected — recorded on ledger");
      } else if (res.data.finalized) {
        setFlash(`✔ Approved — version v${res.data.version} written · ledger #${res.data.ledgerIndex}`);
      } else {
        setFlash(`✔ Vote recorded (${res.data.approveCount}/${res.data.requiredApprovals})`);
      }
      load();
    } catch (e) {
      setFlash("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Approvals</h1>
        <p className="text-sm text-gray-500">
          High-risk actions require multiple approvers before the change is applied and written to the ledger.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === s
                ? "border-amber text-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {flash && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-sm">
          {flash}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : err ? (
        <div className="text-red-600">{err}</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          No {tab} approvals.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <ApprovalRow key={a._id} a={a} onDecide={decide} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}