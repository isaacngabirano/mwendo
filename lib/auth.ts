"use client";

import { db, nowISO } from "./db";
import { supabase, supabaseConfigured } from "./supabaseClient";
import type { AppUser } from "./types";

const SESSION_KEY = "mwendo-session-user-uuid";

// This hashing is only used in the no-Supabase local demo mode below — it
// is NOT a substitute for real auth. Once Supabase is configured, real
// password auth is handled by Supabase Auth instead.
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function login(
  email: string,
  password: string
): Promise<{ ok: true; user: AppUser } | { ok: false; error: string }> {
  if (supabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: error?.message ?? "Login failed." };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    const user: AppUser = {
      uuid: data.user.id,
      name: profile?.name ?? data.user.email ?? "User",
      email: data.user.email ?? email,
      passwordHash: "",
      role: (profile?.role as AppUser["role"]) ?? "Cashier",
      createdAt: profile?.created_at ?? nowISO(),
    };
    // Cache locally so the app has user info available offline afterward.
    const existing = await db.users.where("uuid").equals(user.uuid).first();
    if (existing?.id) await db.users.update(existing.id, user);
    else await db.users.add(user);

    localStorage.setItem(SESSION_KEY, user.uuid);
    return { ok: true, user };
  }

  // Local-only fallback (no Supabase configured yet) — same as the
  // original offline demo mode.
  const user = await db.users.where("email").equals(email.trim().toLowerCase()).first();
  if (!user) return { ok: false, error: "No account found with that email." };
  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) {
    return { ok: false, error: "Incorrect password." };
  }
  localStorage.setItem(SESSION_KEY, user.uuid);
  return { ok: true, user };
}

export async function logout() {
  if (supabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem(SESSION_KEY);
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (supabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const uuid = data.session.user.id;
    const cached = await db.users.where("uuid").equals(uuid).first();
    if (cached) return cached;
    // Session exists but we haven't cached the profile locally yet
    // (e.g. a fresh device that restored a session token) — fetch it.
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", uuid).single();
    const user: AppUser = {
      uuid,
      name: profile?.name ?? data.session.user.email ?? "User",
      email: data.session.user.email ?? "",
      passwordHash: "",
      role: (profile?.role as AppUser["role"]) ?? "Cashier",
      createdAt: profile?.created_at ?? nowISO(),
    };
    await db.users.add(user);
    return user;
  }

  const uuid = localStorage.getItem(SESSION_KEY);
  if (!uuid) return null;
  const user = await db.users.where("uuid").equals(uuid).first();
  return user ?? null;
}
