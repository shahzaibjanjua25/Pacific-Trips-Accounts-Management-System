"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type Mode = "login" | "reset";

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [q1, setQ1] = useState("");
  const [q2, setQ2] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadQuestions() {
    setError("");
    setMsg("");
    if (!username) {
      setError("Enter your username first");
      return;
    }
    const res = await fetch(
      `/api/auth/questions?username=${encodeURIComponent(username)}`
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "User not found");
      return;
    }
    setQ1(data.securityQ1);
    setQ2(data.securityQ2);
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          answer1: a1,
          answer2: a2,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setMsg("Password updated. You can sign in now.");
      setMode("login");
      setPassword("");
      setNewPassword("");
      setA1("");
      setA2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white border border-slate-200 overflow-hidden mb-3">
            <Image
              src="/logo.jpg"
              alt="Pacific Trips"
              width={80}
              height={80}
              priority
              className="object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Pacific Trips</h1>
          <p className="text-sm text-slate-500">Accounting System · Lahore · PKR</p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {msg && (
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {msg}
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={login} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Username</span>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Password</span>
              <input
                type="password"
                className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="w-full text-sm text-slate-600 hover:text-emerald-700"
              onClick={() => {
                setMode("reset");
                setError("");
              }}
            >
              Forgot password? Answer security questions
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form onSubmit={reset} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Username</span>
              <div className="flex gap-2 mt-1">
                <input
                  className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={loadQuestions}
                  className="bg-slate-800 hover:bg-slate-700 text-white text-sm px-3 rounded-lg"
                >
                  Load Qs
                </button>
              </div>
            </label>
            {q1 && (
              <>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{q1}</span>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={a1}
                    onChange={(e) => setA1(e.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">{q2}</span>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={a2}
                    onChange={(e) => setA2(e.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    New password (min 10 chars)
                  </span>
                  <input
                    type="password"
                    className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={10}
                  />
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={loading || !q1}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
            >
              {loading ? "Updating…" : "Reset password"}
            </button>
            <button
              type="button"
              className="w-full text-sm text-slate-600 hover:text-emerald-700"
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Back to login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginInner />
    </Suspense>
  );
}