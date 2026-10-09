"use client";

import { useEffect, useState } from "react";

type Me = { id: string; username: string; securityQ1: string; securityQ2: string } | null;

export default function SecurityPage() {
  const [me, setMe] = useState<Me>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [securityQ1, setSecurityQ1] = useState("");
  const [securityQ2, setSecurityQ2] = useState("");
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user);
        if (d.user) {
          setSecurityQ1(d.user.securityQ1);
          setSecurityQ2(d.user.securityQ2);
        }
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");

    if (newPassword !== confirm) {
      setError("New password and confirmation do not match");
      return;
    }
    if (newPassword.length < 10) {
      setError("New password must be at least 10 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          securityQ1,
          securityQ2,
          answer1,
          answer2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Change failed");
      setMsg("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setAnswer1("");
      setAnswer2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security Settings</h1>
        <p className="text-sm text-slate-500">
          Change your password and reset your security questions. Minimum 10 characters.
        </p>
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

      <form onSubmit={submit} className="bg-white rounded-xl border p-6 space-y-4 max-w-2xl">
        <h2 className="font-semibold text-slate-800">
          Signed in as <span className="text-emerald-700">{me?.username || "…"}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Current password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <div />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">New password (min 10)</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Confirm new password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={10}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </div>

        <hr />

        <p className="text-xs text-slate-500">
          Optionally update your security questions. Leave blank to keep existing.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Security Question 1</span>
            <input
              value={securityQ1}
              onChange={(e) => setSecurityQ1(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Answer 1</span>
            <input
              value={answer1}
              onChange={(e) => setAnswer1(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Security Question 2</span>
            <input
              value={securityQ2}
              onChange={(e) => setSecurityQ2(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Answer 2</span>
            <input
              value={answer2}
              onChange={(e) => setAnswer2(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          {loading ? "Updating…" : "Update security"}
        </button>
      </form>
    </div>
  );
}