import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const DEMO_ACCOUNTS = [
  { email: "admin@bel.test", role: "admin" },
  { email: "manager@bel.test", role: "manager" },
  { email: "staff@bel.test", role: "staff" },
  { email: "auditor@bel.test", role: "auditor" },
  { email: "a@supplier.test", role: "supplier A" },
  { email: "b@supplier.test", role: "supplier B" },
];

const DEMO_PASSWORD = "Bel@12345";

export default function SignIn({ onSignedIn }) {
  const [email, setEmail] = useState("admin@bel.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      onSignedIn(data.user);
      navigate("/");
    } catch (e) {
      setErr(e.response?.data?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy">
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl w-full max-w-sm p-8 space-y-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-navy">BEL-Chain</h1>
          <p className="text-sm text-gray-500">Sign in to the console</p>
        </div>

        <label className="block">
          <span className="text-sm text-gray-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 w-full border rounded px-3 py-2 text-sm"
          />
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-amber hover:brightness-95 text-navy font-semibold rounded px-3 py-2 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-xs text-gray-500 pt-2 border-t">
          <div className="font-semibold mb-1">Demo accounts</div>
          <ul className="space-y-0.5">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => fillDemo(a.email)}
                  className="hover:underline text-left"
                >
                  <span className="text-gray-700">{a.email}</span>{" "}
                  <span className="text-gray-400">({a.role})</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 text-gray-400">password: {DEMO_PASSWORD}</div>
        </div>
      </form>
    </div>
  );
}