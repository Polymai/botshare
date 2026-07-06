// Payments: unlock plan lookup, checkout via the app API router, unlock
// status refresh after return, and billing portal. The browser never creates
// Checkout Sessions itself and never decides paid state.

import { sb, callAppApi } from "../supabaseClient.js";
import { config } from "../config.js";

function requireClient() {
  if (!sb) throw new Error("Payments are unavailable in this preview.");
  return sb;
}

export async function fetchUnlockPlan() {
  const client = requireClient();
  const { data, error } = await client
    .from("plans")
    .select("slug, name, price_amount, currency")
    .eq("slug", config.unlockPlanSlug)
    .eq("active", true)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function fetchOwnerPayments(ownerId) {
  const client = requireClient();
  const { data, error } = await client
    .from("payments")
    .select("id, listing_id, plan_slug, status, amount, currency, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your unlock status.");
  return data || [];
}

// Start hosted checkout for a listing conversation unlock. Redirects away on
// success; the caller shows the app loader until then.
export async function startListingUnlockCheckout(listingId) {
  const returnUrl = window.location.origin + window.location.pathname;
  const result = await callAppApi("create-checkout-session", {
    listing_id: listingId,
    return_url: returnUrl,
  });
  if (result.already_unlocked) return { alreadyUnlocked: true };
  if (!result.url) throw new Error("Checkout could not be started. Please try again.");
  window.location.assign(result.url);
  return { redirecting: true };
}

// Verify a returned Checkout Session server-side and report its state.
export async function reconcileCheckout(sessionId) {
  return callAppApi("reconcile-checkout", { session_id: sessionId });
}

export async function openBillingPortal() {
  const returnUrl = window.location.origin + window.location.pathname + "#/owner";
  const result = await callAppApi("billing-portal", { return_url: returnUrl });
  if (!result.url) throw new Error("Billing history is not available yet.");
  window.location.assign(result.url);
  return { redirecting: true };
}

export function formatAmount(amountMinor, currency) {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount)) return "";
  const value = amount / 100;
  const code = String(currency || "sek").toUpperCase();
  if (code === "SEK") {
    return value.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " kr";
  }
  return value.toLocaleString(undefined, { style: "currency", currency: code });
}
