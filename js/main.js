// BotShare bootstrap: config, auth, state, router, initial data load, and
// the render cycle. Views render from state; data loading happens here and
// in action handlers, never inside render functions.

import { isSupabaseConfigured } from "./config.js";
import { isBackendReady } from "./supabaseClient.js";
import { initAuth, onUserChanged, signOut } from "./auth.js";
import { getState, isSignedIn } from "./state.js";
import { parseRoute, onRouteChange, navigate } from "./router.js";
import { renderShell, updateShellNav } from "./ui/shell.js";
import { openAuthModal } from "./ui/authModal.js";
import { renderMarketplaceView, renderListingResults, loadListings } from "./ui/marketplaceView.js";
import { renderListingDetailView, loadListingDetail } from "./ui/listingDetailView.js";
import { renderOwnerDashboardView, loadOwnerData } from "./ui/ownerDashboardView.js";
import { renderListingEditorView } from "./ui/listingEditorView.js";
import { renderCustomerDashboardView, loadCustomerData } from "./ui/customerDashboardView.js";
import { reconcileCheckout } from "./api/payments.js";
import { toast, showAppLoader, hideAppLoader, emptyStateHtml } from "./ui/feedback.js";

let routeRoot = null;
let renderToken = 0;

function currentRouteToken() {
  return renderToken;
}

async function renderRoute(route) {
  const token = ++renderToken;
  updateShellNav(route.name === "listing" ? "marketplace" : route.name);
  window.scrollTo({ top: 0, behavior: "auto" });

  if (!isBackendReady()) {
    routeRoot.innerHTML =
      '<div class="container" style="padding-top:48px">' +
      emptyStateHtml({
        title: "BotShare is warming up",
        body: "The marketplace backend is not reachable in this preview. Reload once provisioning has finished.",
      }) +
      "</div>";
    return;
  }

  switch (route.name) {
    case "marketplace": {
      renderMarketplaceView(routeRoot, { onBrowseIntent: refreshMarketplace });
      if (!getState().listings.length && !getState().listingsLoading) {
        await refreshMarketplace(token);
      } else {
        renderListingResults(routeRoot, { onBrowseIntent: refreshMarketplace });
      }
      break;
    }
    case "listing": {
      const id = route.params[0];
      renderListingDetailView(routeRoot, { onRefresh: () => rerender() });
      await loadListingDetail(id);
      if (isSignedIn()) await loadCustomerData();
      if (token === currentRouteToken()) {
        renderListingDetailView(routeRoot, { onRefresh: () => rerender() });
      }
      break;
    }
    case "owner": {
      renderOwnerDashboardView(routeRoot, { onRefresh: () => rerender() });
      if (isSignedIn()) {
        await loadOwnerData();
        if (token === currentRouteToken()) {
          renderOwnerDashboardView(routeRoot, { onRefresh: () => rerender() });
        }
      }
      break;
    }
    case "listing-new": {
      await renderListingEditorView(routeRoot, null, { onSaved: () => {} });
      break;
    }
    case "listing-edit": {
      await renderListingEditorView(routeRoot, route.params[0], { onSaved: () => {} });
      break;
    }
    case "account": {
      renderCustomerDashboardView(routeRoot, { onRefresh: () => rerender() });
      if (isSignedIn()) {
        await loadCustomerData();
        if (token === currentRouteToken()) {
          renderCustomerDashboardView(routeRoot, { onRefresh: () => rerender() });
        }
      }
      break;
    }
    case "checkout-return": {
      // Handled during boot; if reached directly, just go to the dashboard.
      navigate("/owner");
      break;
    }
    default:
      renderMarketplaceView(routeRoot, { onBrowseIntent: refreshMarketplace });
  }
}

async function refreshMarketplace(token) {
  const activeToken = typeof token === "number" ? token : currentRouteToken();
  renderListingResults(routeRoot, { onBrowseIntent: refreshMarketplace });
  await loadListings();
  if (activeToken === currentRouteToken()) {
    renderListingResults(routeRoot, { onBrowseIntent: refreshMarketplace });
  }
}

function rerender() {
  renderRoute(parseRoute());
}

// Checkout return: verify the session server-side, then land on the dashboard.
async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const cancelled = params.get("checkout") === "cancelled";
  if (!sessionId && !cancelled) return;

  // Clean the query string but keep the hash route.
  const cleanUrl = window.location.pathname + (window.location.hash || "");
  window.history.replaceState({}, "", cleanUrl);

  if (cancelled) {
    toast("Checkout was cancelled — you can unlock conversations any time.");
    navigate("/owner");
    return;
  }

  showAppLoader("Confirming your payment…");
  try {
    const result = await reconcileCheckout(sessionId);
    if (result.status === "paid") {
      toast("Conversations unlocked — you can now reply to renters!", "success");
    } else if (result.status === "pending") {
      toast("Payment received — the unlock confirms within a moment. Refresh if it still shows pending.");
    } else {
      toast("That checkout session expired. You can start the unlock again.", "error");
    }
  } catch (err) {
    toast("We could not confirm the payment yet. Your dashboard shows the current unlock status.", "error");
  } finally {
    hideAppLoader();
    navigate("/owner");
  }
}

async function boot() {
  const appEl = document.getElementById("app");
  routeRoot = renderShell(appEl, {
    onSignIn: () => openAuthModal("signin", rerender),
    onSignOut: async () => {
      await signOut();
      toast("Signed out.");
      navigate("/");
    },
  });

  onUserChanged(() => {
    // If the signed-in user has no app profile yet, offer the completion step.
    const state = getState();
    if (state.session && !state.profile) {
      openAuthModal("profile", rerender);
    }
    rerender();
  });

  if (isSupabaseConfigured) {
    await initAuth();
  }

  onRouteChange(renderRoute);
  await handleCheckoutReturn();
  await renderRoute(parseRoute());
}

boot();
