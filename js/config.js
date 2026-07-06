// Centralized runtime config for BotShare (app707).
// Reads Polymai-owned runtime config objects; never contains secrets.

const supabaseConfig =
  (typeof window !== "undefined" && window.__POLYMAI_SUPABASE_CONFIG__) || {};
const stripeConfig =
  (typeof window !== "undefined" && window.__POLYMAI_STRIPE_CONFIG__) || {};

export const config = Object.freeze({
  appId: supabaseConfig.appId || "app707",
  appName: "BotShare",
  appSchema: "app707_botshare",
  mediaBucket: "app707_botshare_media",
  unlockPlanSlug: "listing_unlock",

  supabaseUrl: supabaseConfig.url || "",
  supabaseAnonKey: supabaseConfig.anonKey || "",
  functionsBaseUrl:
    supabaseConfig.functionsBaseUrl ||
    (supabaseConfig.url ? supabaseConfig.url.replace(/\/+$/, "") + "/functions/v1" : ""),
  siteUrl: supabaseConfig.siteUrl || "",
  appStoragePrefix: supabaseConfig.appStoragePrefix || "polymai:app707:",
  authStorageKey: supabaseConfig.authStorageKey || "polymai:app707:auth",

  apiFunctionName: "app707-botshare-api",

  stripeMode: stripeConfig.mode || "test",
  stripePublishableKey: stripeConfig.publishableKey || "",
});

export const isSupabaseConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);

// Every app-owned browser storage key must be app-scoped.
export function storageKey(name) {
  return config.appStoragePrefix + name;
}

export function readLocal(name) {
  try {
    return window.localStorage.getItem(storageKey(name));
  } catch (_err) {
    return null;
  }
}

export function writeLocal(name, value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(storageKey(name));
    } else {
      window.localStorage.setItem(storageKey(name), String(value));
    }
  } catch (_err) {
    /* storage unavailable: non-fatal */
  }
}

// Auth email redirects: current URL base on localhost previews, configured
// site URL otherwise. Never append a hash route.
export function authRedirectBase() {
  const { hostname, origin, pathname } = window.location;
  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return origin + pathname;
  }
  if (config.siteUrl) return config.siteUrl;
  return origin + pathname;
}
