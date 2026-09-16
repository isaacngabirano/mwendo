"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn } from "lucide-react";
import { login, getCurrentUser } from "@/lib/auth";
import { seedIfEmpty } from "@/lib/seed";
import { supabaseConfigured } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      await seedIfEmpty();
      const current = await getCurrentUser();
      if (current) router.replace("/dashboard");
    })();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      router.replace("/dashboard");
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full bg-navy-900 flex items-center justify-center mb-4">
            <span className="text-white text-3xl font-bold">M</span>
          </div>
          <h1 className="text-xl font-bold text-navy-900 text-center leading-snug">
            Mwendo Management
            <br />
            Systems Login
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-border-subtle rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green"
              placeholder="owner@mwendofoods.ug"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-border-subtle rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy-900 hover:bg-navy-800 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <LogIn size={16} />
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>

        <button className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-accent-green-dark font-medium">
          <KeyRound size={13} />
          Forgot Password?
        </button>

        <div className="mt-6 pt-5 border-t border-border-subtle text-xs text-text-muted space-y-1">
          {supabaseConfigured ? (
            <p>
              Connected to Supabase. Ask the owner to add your login from the Supabase
              dashboard (Authentication → Users) if you don&apos;t have one yet.
            </p>
          ) : (
            <>
              <p className="font-semibold text-navy-900">
                Demo accounts (local-only mode, seeded on first load):
              </p>
              <p>Owner: owner@mwendofoods.ug / owner123</p>
              <p>Cashier: cashier@mwendofoods.ug / cashier123</p>
              <p className="pt-1">
                Set up Supabase (see README) to sync data across devices instead of storing it
                only on this one.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
