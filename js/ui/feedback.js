// Reusable UI feedback: escaping, app-level loader, toasts, retryable error
// boxes, empty states, and small formatting helpers.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Deterministic placeholder-art variant (1..3) for listings without photos;
// pairs with the .media-ph-N background classes in css/components.css.
export function mediaVariant(seed) {
  const value = String(seed || "");
  let sum = 0;
  for (let i = 0; i < value.length; i++) sum = (sum + value.charCodeAt(i)) % 997;
  return (sum % 3) + 1;
}

// ---- App-level blocking loader (AI actions, checkout redirects) ----

let loaderEl = null;

export function showAppLoader(text) {
  hideAppLoader();
  loaderEl = document.createElement("div");
  loaderEl.className = "app-loader";
  loaderEl.setAttribute("role", "status");
  loaderEl.setAttribute("aria-busy", "true");
  loaderEl.innerHTML =
    '<div class="spinner" aria-hidden="true"></div><p>' + escapeHtml(text || "Working…") + "</p>";
  document.body.appendChild(loaderEl);
}

export function hideAppLoader() {
  if (loaderEl) {
    loaderEl.remove();
    loaderEl = null;
  }
}

// ---- Toasts ----

let toastRegion = null;

function ensureToastRegion() {
  if (!toastRegion) {
    toastRegion = document.createElement("div");
    toastRegion.className = "toast-region";
    toastRegion.setAttribute("aria-live", "polite");
    document.body.appendChild(toastRegion);
  }
  return toastRegion;
}

export function toast(message, kind = "info") {
  const region = ensureToastRegion();
  const el = document.createElement("div");
  el.className = "toast" + (kind === "error" ? " toast-error" : kind === "success" ? " toast-success" : "");
  el.textContent = message;
  region.appendChild(el);
  window.setTimeout(() => el.remove(), 4200);
}

// ---- Section-level states ----

export function inlineLoadingHtml(text) {
  return (
    '<div class="inline-loading" role="status" aria-busy="true">' +
    '<div class="spinner" aria-hidden="true"></div><span>' +
    escapeHtml(text || "Loading…") +
    "</span></div>"
  );
}

export function emptyStateHtml({ title, body, actionLabel, actionAttr }) {
  return (
    '<div class="empty-state"><h3>' +
    escapeHtml(title) +
    "</h3><p>" +
    escapeHtml(body || "") +
    "</p>" +
    (actionLabel
      ? '<button class="btn btn-primary" ' + (actionAttr || "") + ">" + escapeHtml(actionLabel) + "</button>"
      : "") +
    "</div>"
  );
}

export function renderErrorBox(el, message, onRetry) {
  el.innerHTML =
    '<div class="error-box"><p>' +
    escapeHtml(message || "Something went wrong.") +
    "</p>" +
    (onRetry ? '<button class="btn btn-ghost" data-retry>Try again</button>' : "") +
    "</div>";
  if (onRetry) {
    const retryBtn = el.querySelector("[data-retry]");
    if (retryBtn) retryBtn.addEventListener("click", onRetry);
  }
}
