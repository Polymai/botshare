// BotShare auth: sign-in, sign-up, sign-out, idempotent auth-change handling,
// and app-local profile bootstrap. Auth session is identity only — protected
// views also require the app-local profile row.

import { sb, callAppApi } from "./supabaseClient.js";
import { setState, getState } from "./state.js";
import { authRedirectBase, readLocal, writeLocal } from "./config.js";

let lastUserId = null;
let userChangedCallback = null;

export function onUserChanged(fn) {
  userChangedCallback = fn;
}

export async function initAuth() {
  if (!sb) {
    setState({ authReady: true });
    return;
  }

  const { data } = await sb.auth.getSession();
  const session = data?.session || null;
  lastUserId = session?.user?.id || null;
  setState({ session });
  if (session) {
    await loadProfile();
  }
  setState({ authReady: true });

  sb.auth.onAuthStateChange((event, nextSession) => {
    const nextUserId = nextSession?.user?.id || null;
    const sameUser = nextUserId === lastUserId;

    if (event === "SIGNED_OUT" || (!nextUserId && lastUserId)) {
      lastUserId = null;
      setState({
        session: null,
        profile: null,
        favorites: [],
        customerRequests: [],
        ownerListings: [],
        ownerRequests: [],
        ownerPayments: [],
        messagesByRequest: {},
      });
      if (userChangedCallback) userChangedCallback("signed-out");
      return;
    }

    // Same-user SIGNED_IN / TOKEN_REFRESHED (e.g. tab refocus): update the
    // session quietly and refresh data in the background — never re-boot.
    if (sameUser) {
      setState({ session: nextSession });
      return;
    }

    lastUserId = nextUserId;
    setState({ session: nextSession, profile: null });
    loadProfile().then(() => {
      if (userChangedCallback) userChangedCallback("signed-in");
    });
  });
}

export async function loadProfile() {
  const userId = getState().session?.user?.id;
  if (!sb || !userId) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("user_id, display_name, primary_role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    setState({ profile: null });
    return null;
  }
  setState({ profile: data || null });
  return data || null;
}

// Complete app-level signup: create/refresh the app-local profile row.
export async function createProfile(displayName, primaryRole) {
  const userId = getState().session?.user?.id;
  if (!sb || !userId) throw new Error("Sign in first.");
  const { data, error } = await sb
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        display_name: displayName,
        primary_role: primaryRole,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("user_id, display_name, primary_role")
    .single();
  if (error) throw new Error("Could not save your profile. Please try again.");
  setState({ profile: data });

  // One welcome email per browser per account; failures are non-fatal.
  const welcomeFlag = "welcome-sent:" + userId;
  if (!readLocal(welcomeFlag)) {
    writeLocal(welcomeFlag, "1");
    callAppApi("welcome-email").catch(() => {});
  }
  return data;
}

export async function signIn(email, password) {
  if (!sb) throw new Error("Sign-in is not available in this preview.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error("Sign-in failed. Check your email and password, or reset your password.");
  }
}

export async function signUp(email, password) {
  if (!sb) throw new Error("Sign-up is not available in this preview.");
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectBase() },
  });
  if (error) {
    // Shared Supabase project: never disclose account existence details.
    throw new Error("This email may already work for sign-in. Sign in instead, or reset your password.");
  }
  return Boolean(data?.session);
}

export async function resetPassword(email) {
  if (!sb) throw new Error("Not available in this preview.");
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectBase(),
  });
  if (error) throw new Error("Could not send the reset email. Try again shortly.");
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}
