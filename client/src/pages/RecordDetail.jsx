import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";
import Timeline from "../components/Timeline";
import StatusChip from "../components/StatusChip";

/* --------------------------------------------------------------
 * Small presentational helpers
 * ------------------------------------------------------------ */
function Field({ field, value, onChange }) {
  const common =
    "mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300";
  const label = (
    <span className="text-sm text-gray-700">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </span>
  );

  if (field.type === "textarea") {
    return (
      <label className="block">
        {label}
        <textarea
          rows={3}
          value={value || ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={common}
        />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        {label}
        <select
          value={value || ""}
          onChange={(e) => onChange(field.key, e.target.value)}
          className={common}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const inputType =
    field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return (
    <label className="block">
      {label}
      <input
        type={inputType}
        value={value || ""}
        onChange={(e) => onChange(field.key, e.target.value)}
        className={common}
      />
    </label>
  );
}

function ProofCard({ proof }) {
  if (!proof) return null;
  return (
    <div className="bg-navy text-white rounded-lg p-5 space-y-2">
      <div className="text-xs uppercase text-white/60">Ledger proof</div>
      <div className="text-lg font-semibold">Entry #{proof.index}</div>
      <div className="text-xs text-white/70">
        Anchored at {new Date(proof.timestamp).toLocaleString()}
      </div>
      <div className="mt-2 text-[11px] font-mono break-all text-white/60">
        entryHash: {proof.entryHash}
      </div>
      <div className="text-[11px] font-mono break-all text-white/60">
        payloadHash: {proof.payloadHash}
      </div>
    </div>
  );
}

function DocumentsPanel({
  documents,
  uploading,
  uploadMsg,
  onUpload,
  onDownload,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-navy">Documents ({documents.length})</h2>
        <label className="bg-amber text-navy font-semibold px-3 py-1.5 rounded cursor-pointer text-sm">
          {uploading ? "Uploading…" : "+ Upload file"}
          <input
            type="file"
            className="hidden"
            onChange={(e) => onUpload(e.target.files?.[0])}
            disabled={uploading}
          />
        </label>
      </div>

      {uploadMsg && <div className="text-sm text-gray-700 mb-2">{uploadMsg}</div>}

      {documents.length === 0 ? (
        <div className="text-sm text-gray-500">No documents yet.</div>
      ) : (
        <ul className="divide-y">
          {documents.map((d) => (
            <li key={d._id} className="py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {d.filename}
                </div>
                <div className="text-xs text-gray-500">
                  {d.size} B · {new Date(d.createdAt).toLocaleString()}
                </div>
                <div className="text-[11px] font-mono text-gray-400 break-all">
                  {d.sha256}
                </div>
              </div>
              <button
                onClick={() => onDownload(d._id, d.filename)}
                className="text-sm text-amber-600 hover:underline"
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------
 * RecordDetail
 * ------------------------------------------------------------ */
export default function RecordDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [template, setTemplate] = useState(null);
  const [history, setHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [draft, setDraft] = useState({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  /* ---- initial fetch: record + history + documents (one round-trip group) ---- */
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr("");
    Promise.all([
      api.get(`/records/${id}`).then((r) => r.data),
      api.get(`/records/${id}/history`).then((r) => r.data.timeline),
      api.get(`/records/${id}/documents`).then((r) => r.data.documents || []),
    ])
      .then(async ([recData, tl, docs]) => {
        if (!mounted) return;
        setData(recData);
        setDraft(recData.record.fields || {});
        setHistory(tl);
        setDocuments(docs);
        const tplRes = await api.get(
          `/records/meta/template?packId=${recData.record.packId}&templateKey=${recData.record.templateKey}`
        );
        if (mounted) setTemplate(tplRes.data);
      })
      .catch((e) => mounted && setErr(e.response?.data?.error || e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [id]);

  /* ---- form change ---- */
  const onChange = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  /* ---- helpers ---- */
  async function refreshAfterMutation() {
    const [fresh, tl, docs] = await Promise.all([
      api.get(`/records/${id}`).then((r) => r.data),
      api.get(`/records/${id}/history`).then((r) => r.data.timeline),
      api.get(`/records/${id}/documents`).then((r) => r.data.documents || []),
    ]);
    setData(fresh);
    setDraft(fresh.record.fields || {});
    setHistory(tl);
    setDocuments(docs);
  }

  async function save() {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await api.put(`/records/${id}`, { fields: draft });
      if (res.status === 202) {
        setSaveMsg(
          `⏳ Requires approvals — request created (${res.data.approvalId})`
        );
      } else {
        setSaveMsg(`✔ Saved. Ledger entry #${res.data.ledgerIndex}`);
      }
      await refreshAfterMutation();
    } catch (e) {
      setSaveMsg("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/records/${id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadMsg(
        `✔ Uploaded ${data.document.filename} · ledger #${data.ledgerIndex}`
      );
      const list = await api.get(`/records/${id}/documents`);
      setDocuments(list.data.documents || []);
    } catch (e) {
      setUploadMsg("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setUploading(false);
    }
  }

  async function downloadDoc(docId, filename) {
    try {
      const res = await api.get(`/documents/${docId}/download`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed: " + (e.response?.data?.error || e.message));
    }
  }

  /* ---- render guards ---- */
  if (loading) return <div className="p-8 text-gray-500">Loading record…</div>;
  if (err) return <div className="p-8 text-red-600">{err}</div>;
  if (!data) return null;

  const { record, proof } = data;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">
            <Link to="/records" className="hover:underline">
              Records
            </Link>{" "}
            / {template?.label || record.templateKey}
          </div>
          <h1 className="text-2xl font-semibold text-navy">{record.title}</h1>
          <div className="text-xs text-gray-500 mt-1">
            v{record.version} · {record.status} · created{" "}
            {new Date(record.createdAt).toLocaleString()}
          </div>
        </div>
        <button
          onClick={() => nav("/records")}
          className="text-sm text-gray-600 hover:underline"
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Fields form */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-3">
            <h2 className="font-semibold text-navy">
              {template?.label || "Fields"}
            </h2>
            {template?.fields?.map((f) => (
              <Field
                key={f.key}
                field={f}
                value={draft[f.key]}
                onChange={onChange}
              />
            ))}
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="bg-amber text-navy font-semibold px-4 py-2 rounded disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveMsg && <span className="text-sm text-gray-700">{saveMsg}</span>}
            </div>
          </div>

          {/* Documents */}
          <DocumentsPanel
            documents={documents}
            uploading={uploading}
            uploadMsg={uploadMsg}
            onUpload={uploadFile}
            onDownload={downloadDoc}
          />

          {/* Life history */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="font-semibold text-navy mb-3">Life history</h2>
            <Timeline items={history} />
          </div>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <ProofCard proof={proof} />
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm text-sm">
            <div className="text-xs uppercase text-gray-500 mb-1">Record ID</div>
            <div className="font-mono text-xs break-all text-gray-700">
              {record._id}
            </div>
            <div className="text-xs uppercase text-gray-500 mt-3 mb-1">
              Template
            </div>
            <div>{record.templateKey}</div>
          </div>
        </div>
      </div>
    </div>
  );
}