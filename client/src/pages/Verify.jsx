import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";

function StatusChip({ match }) {
  return match ? (
    <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">Verified</span>
  ) : (
    <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">Mismatch</span>
  );
}

export default function Verify() {
  const [records, setRecords] = useState([]);
  const [docs, setDocs] = useState([]);
  const [recordId, setRecordId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    api.get("/records").then(r => setRecords(r.data.records || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!recordId) { setDocs([]); setDocumentId(""); return; }
    api.get(`/records/${recordId}/documents`)
      .then(r => { setDocs(r.data.documents || []); setDocumentId(r.data.documents?.[0]?._id || ""); })
      .catch(() => { setDocs([]); setDocumentId(""); });
  }, [recordId]);

  async function submit(e) {
    e.preventDefault();
    setResult(null); setErr("");
    if (!documentId) return setErr("Pick a document");
    if (!file) return setErr("Pick a file to verify");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentId", documentId);
      const { data } = await api.post("/verify", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null); setFile(null); setErr("");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Verify document</h1>
        <p className="text-sm text-gray-500">
          Upload a file and compare its SHA-256 against the value anchored on the ledger.
        </p>
      </div>

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <label className="block">
          <span className="text-sm text-gray-700">Record</span>
          <select
            value={recordId}
            onChange={e => setRecordId(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          >
            <option value="">— pick a record —</option>
            {records.map(r => (
              <option key={r._id} value={r._id}>{r.title || r.templateKey}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">Document</span>
          <select
            value={documentId}
            onChange={e => setDocumentId(e.target.value)}
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
            disabled={!docs.length}
          >
            {docs.length === 0 && <option value="">— no documents —</option>}
            {docs.map(d => (
              <option key={d._id} value={d._id}>
                {d.filename} ({d.size} B)
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">File to verify</span>
          <input
            ref={fileInput}
            type="file"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="mt-1 w-full text-sm"
          />
        </label>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={busy}
            className="bg-amber text-navy font-semibold px-4 py-2 rounded disabled:opacity-60"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" onClick={reset} className="text-sm text-gray-600 hover:underline">
            Reset
          </button>
          {err && <span className="text-sm text-red-600">{err}</span>}
        </div>
      </form>

      {result && (
        <div className={`rounded-lg p-5 border ${result.result === "match" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center gap-3 mb-2">
            <StatusChip match={result.result === "match"} />
            <span className="text-sm text-gray-700">
              {result.result === "match" ? "File matches the ledger record." : "File does NOT match — possible tampering or wrong file."}
            </span>
          </div>
          <div className="text-xs font-mono break-all text-gray-700 space-y-1">
            <div><span className="text-gray-500">uploaded:</span> {result.uploadedHash}</div>
            <div><span className="text-gray-500">ledger:  </span> {result.ledgerHash}</div>
            {result.ledgerIndex !== null && <div><span className="text-gray-500">entry #:</span> {result.ledgerIndex}</div>}
            {result.signatureValid !== null && (
              <div>
                <span className="text-gray-500">signature:</span>{" "}
                {result.signatureValid ? "valid ✔" : "invalid ✘"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}