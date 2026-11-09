import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import StatusChip from '../components/StatusChip';


export default function Records() {
  const [records, setRecords] = useState([]);
  const [packs, setPacks] = useState([]);
  const [templates, setTemplates] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([
      api.get("/records").then(r => r.data.records),
      api.get("/packs").then(r => r.data.packs),
      api.get("/records/meta/template?packId=defence").then(r => r.data.templates),
    ])
      .then(([recs, pk, tpl]) => { setRecords(recs); setPacks(pk); setTemplates(tpl); })
      .catch(e => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading records…</div>;
  if (err) return <div className="p-8 text-red-600">Error: {err}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Records</h1>
          <p className="text-sm text-gray-500">Asset passports, one row per record.</p>
        </div>
        <Link
          to="/records/new"
          className="bg-amber text-navy font-semibold px-4 py-2 rounded hover:brightness-95"
        >
          + New record
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Template</th>
              <th className="text-left px-4 py-3">Version</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No records yet.</td></tr>
            )}
            {records.map(r => (
              <tr key={r._id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <button onClick={() => nav(`/records/${r._id}`)} className="text-navy font-medium hover:underline text-left">
                    {r.title || r.templateKey}
                  </button>
                </td>
                <td className="px-4 py-3">{templates[r.templateKey]?.label || r.templateKey}</td>
                <td className="px-4 py-3">v{r.version}</td>
                <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                <td className="px-4 py-3 text-gray-500">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}