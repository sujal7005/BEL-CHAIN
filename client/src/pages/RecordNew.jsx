import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api/client";

function Field({ field, value, onChange }) {
  const common = "mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm";
  if (field.type === "textarea") {
    return (
      <label className="block">
        <span className="text-sm text-gray-700">{field.label}{field.required && <span className="text-red-500"> *</span>}</span>
        <textarea rows={3} value={value || ""} onChange={e => onChange(field.key, e.target.value)} className={common} />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-sm text-gray-700">{field.label}{field.required && <span className="text-red-500"> *</span>}</span>
        <select value={value || ""} onChange={e => onChange(field.key, e.target.value)} className={common}>
          <option value="">—</option>
          {field.options?.map(o => <option key={o}>{o}</option>)}
        </select>
      </label>
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return (
    <label className="block">
      <span className="text-sm text-gray-700">{field.label}{field.required && <span className="text-red-500"> *</span>}</span>
      <input type={inputType} value={value || ""} onChange={e => onChange(field.key, e.target.value)} className={common} />
    </label>
  );
}

export default function RecordNew() {
  const nav = useNavigate();
  const [templates, setTemplates] = useState({});
  const [templateKey, setTemplateKey] = useState("");
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/records/meta/template?packId=defence")
      .then(r => {
        setTemplates(r.data.templates || {});
        const first = Object.keys(r.data.templates || {})[0];
        if (first) setTemplateKey(first);
      })
      .catch(e => setErr(e.response?.data?.error || e.message));
  }, []);

  const tpl = templateKey ? templates[templateKey] : null;

  async function save() {
    setBusy(true); setMsg("");
    try {
      const res = await api.post("/records", { packId: "defence", templateKey, fields });
      nav(`/records/${res.data.record._id}`);
    } catch (e) {
      setMsg("❌ " + (e.response?.data?.error || e.message));
    } finally {
      setBusy(false);
    }
  }

  if (err) return <div className="p-8 text-red-600">{err}</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <div className="text-xs text-gray-500"><Link to="/records" className="hover:underline">Records</Link> / New</div>
        <h1 className="text-2xl font-semibold text-navy">New record</h1>
        <p className="text-sm text-gray-500">Form generated from the defence pack — no hard-coded fields.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
        <label className="block">
          <span className="text-sm text-gray-700">Template</span>
          <select
            value={templateKey}
            onChange={e => { setTemplateKey(e.target.value); setFields({}); }}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {Object.entries(templates).map(([k, t]) => (
              <option key={k} value={k}>{t.label}</option>
            ))}
          </select>
        </label>

        {tpl?.fields?.map(f => (
          <Field key={f.key} field={f} value={fields[f.key]} onChange={(k, v) => setFields(s => ({ ...s, [k]: v }))} />
        ))}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={busy || !templateKey}
            className="bg-amber text-navy font-semibold px-4 py-2 rounded disabled:opacity-60"
          >
            {busy ? "Saving…" : "Create record"}
          </button>
          {msg && <span className="text-sm">{msg}</span>}
        </div>
      </div>
    </div>
  );
}