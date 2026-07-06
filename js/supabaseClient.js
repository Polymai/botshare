// Configured Supabase client for BotShare: auth, schema-scoped query builder
// CRUD, Edge Function calls, and storage.

import { config, isSupabaseConfigured } from "./config.js";

function createBrowserClient() {
  if (!isSupabaseConfigured || typeof window === "undefined" || !window.supabase) {
    return null;
  }
  return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    db: { schema: config.appSchema },
    auth: {
      storageKey: config.authStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const sb = createBrowserClient();

export function isBackendReady() {
  return Boolean(sb);
}

// Call the BotShare app API router with the signed-in user's JWT.
export async function callAppApi(action, payload = {}, { timeoutMs = 60000 } = {}) {
  if (!sb) throw new Error("Backend is not available in this preview.");
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token || config.supabaseAnonKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(config.functionsBaseUrl + "/" + config.apiFunctionName, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    throw new Error("Could not reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  let body = {};
  try {
    body = await response.json();
  } catch (_err) {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body.detail || body.error || "Request failed.");
    error.code = body.error || String(response.status);
    error.status = response.status;
    throw error;
  }
  return body;
}
