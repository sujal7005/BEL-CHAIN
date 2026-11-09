import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

/** Field renderer is identical to the one in RecordDetail — that's the point. */
function Field({ field, value, onChange }) {
  const common =
    "mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm";
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
            <option key={o}>{o}</option>
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

export default function PackAdmin() {
  const [packs, setPacks] = useState([]);
  const [activeId, setActiveId] = useState("defence");
  const [pack, setPack] = useState(null);
  const [templateKey, setTemplateKey] = useState("");
  const [formValues, setFormValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get("/packs")
      .then((r) => {
        setPacks(r.data.packs || []);
        if (!r.data.packs?.find((p) => p.id === activeId) && r.data.packs?.[0]) {
          setActiveId(r.data.packs[0].id);
        }
      })
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!activeId) return;
    setLoading(true);
    setErr("");
    api
      .get(`/packs/${activeId}`)
      .then((r) => {
        setPack(r.data.pack);
        const first = Object.keys(r.data.pack.templates || {})[0] || "";
        setTemplateKey(first);
        setFormValues({});
      })
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [activeId]);

  const template = useMemo(
    () => (templateKey && pack?.templates?.[templateKey]) || null,
    [templateKey, pack]
  );

  if (err) return <div className="p-8 text-red-600">{err}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy">Pack admin</h1>
        <p className="text-sm text-gray-500">
          The only industry-specific thing in BEL-Chain is the pack JSON. Changing the pack
          changes the record form — no frontend code changes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* left column: pack + templates */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="font-semibold text-navy mb-2">Packs</h2>
            {packs.length === 0 ? (
              <div className="text-sm text-gray-500">Loading packs…</div>
            ) : (
              <ul className="space-y-1">
                {packs.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setActiveId(p.id)}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        activeId === p.id
                          ? "bg-amber text-navy font-semibold"
                          : "hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <div>{p.name}</div>
                      <div className="text-xs opacity-75">
                        id: {p.id} · v{p.version}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pack && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="font-semibold text-navy mb-2">Templates</h2>
              <ul className="space-y-1">
                {Object.entries(pack.templates || {}).map(([k, t]) => (
                  <li key={k}>
                    <button
                      onClick={() => {
                        setTemplateKey(k);
                        setFormValues({});
                      }}
                      className={`w-full text-left px-3 py-2 rounded text-sm ${
                        templateKey === k
                          ? "bg-navy text-white font-semibold"
                          : "hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      {t.label} <span className="opacity-60 text-xs">({k})</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pack && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm text-xs space-y-2">
              <div className="uppercase text-gray-500 font-semibold">ABAC rules</div>
              <ul className="space-y-1 text-gray-700">
                {(pack.abac || []).map((r, i) => (
                  <li key={i} className="border-l-2 border-amber pl-2">
                    <code className="text-[11px]">{r.action}</code>{" "}
                    <span className="text-gray-500">→ {r.condition}</span>
                    <div className="text-gray-400">
                      roles: {r.roles.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
              {pack.requiredApprovals && Object.keys(pack.requiredApprovals).length > 0 && (
                <>
                  <div className="uppercase text-gray-500 font-semibold pt-2">
                    Required approvals
                  </div>
                  <ul className="text-gray-700 space-y-1">
                    {Object.entries(pack.requiredApprovals).map(([a, n]) => (
                      <li key={a}>
                        <code className="text-[11px]">{a}</code> → {n} approvers
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>

        {/* right column: live form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-navy">
                {template?.label || "—"} · live form preview
              </h2>
              {templateKey && (
                <span className="text-xs text-gray-500">
                  template: <code>{templateKey}</code>
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Rendered from <code>pack.templates[templateKey].fields</code> — no hardcoded
              inputs in this component.
            </p>
            <div className="mt-3 space-y-3">
              {!template ? (
                <div className="text-sm text-gray-500">Pick a template.</div>
              ) : (
                template.fields.map((f) => (
                  <Field
                    key={f.key}
                    field={f}
                    value={formValues[f.key]}
                    onChange={(k, v) => setFormValues((s) => ({ ...s, [k]: v }))}
                  />
                ))
              )}
            </div>
          </div>

          {template && (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="font-semibold text-navy mb-2">Raw template JSON</h2>
              <pre className="text-[11px] font-mono bg-gray-50 border rounded p-3 overflow-x-auto">
{JSON.stringify(template, null, 2)}
              </pre>
            </div>
          )}

          {pack && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
              <div className="font-semibold mb-1">Why this screen exists</div>
              <p>
                If BEL needs a new record type tomorrow (say, <em>Maintenance Log</em>), they
                add one entry under <code>templates</code> in <code>packs/defence.json</code>.
                The form on this screen updates on the next refresh — no React changes, no
                server code changes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}