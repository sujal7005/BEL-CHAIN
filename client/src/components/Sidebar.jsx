import { Link, useLocation } from "react-router-dom";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/records", label: "Records" },
  { to: "/verify", label: "Verify Document" },
  { to: "/ledger", label: "Ledger" },
  { to: "/audit", label: "Audit Log" },
  { to: "/packs", label: "Packs (admin)" },
  { to: "/tamper", label: "Tamper Demo" },
  { to: "/approvals", label: "Approvals" },
];

export default function Sidebar({ user, onLogout }) {
  const location = useLocation();
  return (
    <aside className="w-64 bg-navy text-white flex flex-col">
      <div className="px-5 py-6 border-b border-white/10">
        <div className="text-amber font-bold text-xl tracking-tight">BEL-Chain</div>
        <div className="text-xs text-white/50 mt-1">Simulated ledger</div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map((n) => {
          const active =
            n.to === "/"
              ? location.pathname === "/"
              : location.pathname === n.to || location.pathname.startsWith(n.to + "/");
          return (
            <Link
              key={n.to}
              to={n.to}
              className={`block px-3 py-2 rounded text-sm transition ${
                active
                  ? "bg-amber text-navy font-semibold"
                  : "text-white/80 hover:bg-white/10"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 text-xs">
        <div className="text-white/60">Signed in as</div>
        <div className="truncate">{user?.email}</div>
        <div className="text-amber">{user?.role}</div>
        <button
          onClick={onLogout}
          className="mt-3 w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-sm"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}