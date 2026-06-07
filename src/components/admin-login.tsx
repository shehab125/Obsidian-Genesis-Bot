"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useState } from "react";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Secure admin access");

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setMessage("Wrong password.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const nextPath = params.get("next") || "/admin";
    window.location.href = nextPath;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0d12] px-5 text-[#f8fafc]">
      <form
        onSubmit={login}
        className="w-full max-w-[420px] rounded-lg border border-[#242a36] bg-[#11151d] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="grid size-12 place-items-center rounded-lg bg-[#d69a2d] text-[#0b0d12]">
            <ShieldCheck size={24} />
          </div>
          <span className="rounded-full border border-[#263041] px-3 py-1 text-xs font-bold text-[#94a3b8]">
            Admin only
          </span>
        </div>
        <h1 className="mt-6 text-3xl font-black">Obsidian Admin</h1>
        <p className="mt-2 text-sm text-[#94a3b8]">{message}</p>
        <label className="mt-6 grid gap-2 text-sm font-bold text-[#cbd5e1]">
          Password
          <div className="flex h-12 items-center gap-3 rounded-lg border border-[#2d3646] bg-[#0b0d12] px-3">
            <LockKeyhole size={18} className="text-[#d69a2d]" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoFocus
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </div>
        </label>
        <button
          type="submit"
          className="mt-5 h-12 w-full rounded-lg bg-[#d69a2d] text-sm font-black text-[#0b0d12]"
        >
          Enter Dashboard
        </button>
      </form>
    </main>
  );
}
