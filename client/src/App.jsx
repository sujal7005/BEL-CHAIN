import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api/client";

import Sidebar from "./components/Sidebar";
import SignIn from "./pages/SignIn";
import Dashboard from "./pages/Dashboard";
import Records from "./pages/Records";
import RecordNew from "./pages/RecordNew";
import RecordDetail from "./pages/RecordDetail";
import Verify from "./pages/Verify";
import Ledger from "./pages/Ledger";
import Audit from "./pages/Audit";
import Approvals from "./pages/Approvals";
import PackAdmin from "./pages/PackAdmin";
import TamperDemo from "./pages/TamperDemo";

/* ---------- Auth hook ---------- */
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => {
        localStorage.removeItem("token");
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, setUser };
}

/* ---------- Chrome (header + footer + main) ---------- */
function Shell({ user, onLogout, children }) {
  return (
    <div className="min-h-screen flex bg-gray-50 font-sans">
      <Sidebar user={user} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">
        <header className="h-14 px-6 flex items-center border-b bg-white">
          <div className="text-sm text-gray-500">
            Prototype · simulated ledger · BEL only
          </div>
        </header>
        <div className="p-6">{children}</div>
        <footer className="px-6 py-3 text-xs text-gray-400 border-t bg-white">
          Prototype: simulated ledger (MongoDB). Not production-secure. Not real blockchain.
        </footer>
      </main>
    </div>
  );
}

/* ---------- Protected route ---------- */
function Protected({ user, loading, children }) {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/signin" replace />;
  return children;
}

/* ---------- App ---------- */
export default function App() {
  const { user, loading, setUser } = useAuth();

  const handleSignOut = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/signin"
          element={
            user ? <Navigate to="/" replace /> : <SignIn onSignedIn={setUser} />
          }
        />

        <Route
          path="/*"
          element={
            <Protected user={user} loading={loading}>
              <Shell user={user} onLogout={handleSignOut}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/records" element={<Records />} />
                  <Route path="/records/new" element={<RecordNew />} />
                  <Route path="/records/:id" element={<RecordDetail />} />
                  <Route path="/verify" element={<Verify />} />
                  <Route path="/ledger" element={<Ledger />} />
                  <Route path="/audit" element={<Audit />} />
                  <Route path="/approvals" element={<Approvals />} />
                  <Route path="/packs" element={<PackAdmin />} />
                  <Route path="/tamper" element={<TamperDemo />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            </Protected>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}