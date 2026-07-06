// Customer dashboard: favorites, rental requests with statuses, and
// per-request conversations (customers can always send messages).

import { getState, setState, isSignedIn, hasProfile, currentUserId } from "../state.js";
import { fetchFavorites, removeFavorite } from "../api/favorites.js";
import { fetchCustomerRequests, updateRequestStatus, fetchMessages, sendMessage, fetchProfilesMap } from "../api/requests.js";
import { photoPublicUrl } from "../api/storage.js";
import { navigate, listingPath } from "../router.js";
import { openAuthModal } from "./authModal.js";
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  inlineLoadingHtml,
  emptyStateHtml,
  renderErrorBox,
  toast,
  mediaVariant,
} from "./feedback.js";

const ownerNames = {};

export async function loadCustomerData() {
  const customerId = currentUserId();
  if (!customerId) return;
  setState({ favoritesLoading: true, customerRequestsLoading: true });
  try {
    const [favorites, requests] = await Promise.all([
      fetchFavorites(customerId),
      fetchCustomerRequests(customerId),
    ]);
    const ownerIds = [...new Set(requests.map((r) => r.owner_id))];
    Object.assign(ownerNames, await fetchProfilesMap(ownerIds));
    setState({
      favorites,
      customerRequests: requests,
      favoritesLoading: false,
      customerRequestsLoading: false,
    });
  } catch (err) {
    setState({ favoritesLoading: false, customerRequestsLoading: false });
    toast(err.message, "error");
  }
}

export function renderCustomerDashboardView(rootEl, { onRefresh } = {}) {
  if (!isSignedIn() || !hasProfile()) {
    rootEl.innerHTML = `
      <div class="container">
        <div class="gate-panel view-enter">
          <div class="card">
            <h2>Your rentals, in one place</h2>
            <p>Sign in to save favorites, track rental requests, and chat with robot owners.</p>
            <button class="btn btn-primary" type="button" data-gate-signin>${isSignedIn() ? "Finish your profile" : "Sign in"}</button>
          </div>
        </div>
      </div>
    `;
    rootEl.querySelector("[data-gate-signin]").addEventListener("click", () => {
      openAuthModal(isSignedIn() ? "profile" : "signin", onRefresh);
    });
    return;
  }

  rootEl.innerHTML = `
    <div class="container view-enter">
      <div class="dash-head">
        <div>
          <h1 style="font-size:clamp(1.6rem,3vw,2.2rem)">My rentals</h1>
          <p>Favorites, requests, and conversations with owners.</p>
        </div>
        <a class="btn btn-primary" href="#/">Browse robots</a>
      </div>

      <section aria-labelledby="cust-requests-title">
        <h2 id="cust-requests-title">Rental requests</h2>
        <div data-customer-requests></div>
      </section>

      <section style="margin-top:40px" aria-labelledby="cust-favorites-title">
        <h2 id="cust-favorites-title">Favorites</h2>
        <div data-customer-favorites></div>
      </section>
    </div>
  `;

  renderRequests(rootEl.querySelector("[data-customer-requests]"), onRefresh);
  renderFavorites(rootEl.querySelector("[data-customer-favorites]"), onRefresh);
}

function statusPill(status) {
  switch (status) {
    case "pending":
      return '<span class="status-pill status-warn">Waiting for owner</span>';
    case "accepted":
      return '<span class="status-pill status-ok">Accepted</span>';
    case "declined":
      return '<span class="status-pill status-danger">Declined</span>';
    case "completed":
      return '<span class="status-pill status-teal">Completed</span>';
    case "cancelled":
      return '<span class="status-pill status-muted">Cancelled</span>';
    default:
      return '<span class="status-pill status-muted">' + escapeHtml(status) + "</span>";
  }
}

function renderRequests(el, onRefresh) {
  const state = getState();
  if (state.customerRequestsLoading) {
    el.innerHTML = inlineLoadingHtml("Loading your requests…");
    return;
  }
  if (!state.customerRequests.length) {
    el.innerHTML = emptyStateHtml({
      title: "No rental requests yet",
      body: "Find a robot you like and send a request with your dates — it shows up here.",
      actionLabel: "Browse robots",
      actionAttr: "data-browse",
    });
    const browseBtn = el.querySelector("[data-browse]");
    if (browseBtn) browseBtn.addEventListener("click", () => navigate("/"));
    return;
  }

  el.innerHTML = state.customerRequests
    .map((request) => {
      const listing = request.listings || {};
      return `
        <div class="card request-card" data-request-id="${escapeHtml(request.id)}">
          <div class="card-title-row">
            <div>
              <h3 style="margin-bottom:4px">${escapeHtml(listing.title || "Robot listing")}</h3>
              <div class="request-meta">
                <span>${escapeHtml(ownerNames[request.owner_id] || "Owner")}</span>
                <span>${formatDate(request.start_date)} – ${formatDate(request.end_date)}</span>
                <span>Sent ${formatDateTime(request.created_at)}</span>
              </div>
            </div>
            ${statusPill(request.status)}
          </div>
          <div class="card-actions">
            ${listing.id ? '<button class="btn btn-ghost btn-sm" data-view-listing="' + escapeHtml(listing.id) + '">View robot</button>' : ""}
            <button class="btn btn-ghost btn-sm" data-thread-toggle>Conversation</button>
            ${request.status === "pending" ? '<button class="btn btn-danger btn-sm" data-cancel>Cancel request</button>' : ""}
          </div>
          <div data-thread hidden></div>
        </div>
      `;
    })
    .join("");

  el.querySelectorAll("[data-view-listing]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(listingPath(btn.dataset.viewListing)));
  });

  el.querySelectorAll(".request-card").forEach((card) => {
    const requestId = card.dataset.requestId;
    const request = getState().customerRequests.find((r) => r.id === requestId);
    if (!request) return;

    const cancelBtn = card.querySelector("[data-cancel]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        cancelBtn.disabled = true;
        try {
          await updateRequestStatus(requestId, "cancelled");
          toast("Request cancelled.");
          await loadCustomerData();
          if (onRefresh) onRefresh();
        } catch (err) {
          toast(err.message, "error");
          cancelBtn.disabled = false;
        }
      });
    }

    const toggleBtn = card.querySelector("[data-thread-toggle]");
    const threadEl = card.querySelector("[data-thread]");
    toggleBtn.addEventListener("click", async () => {
      if (!threadEl.hidden) {
        threadEl.hidden = true;
        return;
      }
      threadEl.hidden = false;
      await renderThread(threadEl, request);
    });
  });
}

async function renderThread(threadEl, request) {
  threadEl.innerHTML = inlineLoadingHtml("Loading conversation…");
  let messages = [];
  try {
    messages = await fetchMessages(request.id);
  } catch (err) {
    renderErrorBox(threadEl, err.message, () => renderThread(threadEl, request));
    return;
  }
  const me = currentUserId();
  const canWrite = ["pending", "accepted"].includes(request.status);

  threadEl.innerHTML = `
    <div class="thread">
      ${messages.length
        ? messages
            .map(
              (msg) =>
                '<div class="msg ' + (msg.sender_id === me ? "msg-own" : "") + '">' +
                escapeHtml(msg.body) +
                "<time>" + formatDateTime(msg.created_at) + "</time></div>"
            )
            .join("")
        : '<p class="detail-meta">No messages yet. The owner sees your request and can reply here.</p>'}
    </div>
    ${canWrite
      ? `<form class="thread-composer" data-composer>
          <textarea name="body" maxlength="2000" placeholder="Message the owner…" required></textarea>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>`
      : '<p class="detail-meta">This conversation is closed.</p>'}
  `;

  const composer = threadEl.querySelector("[data-composer]");
  if (composer) {
    composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      const body = composer.body.value.trim();
      if (!body) return;
      const btn = composer.querySelector("button");
      btn.disabled = true;
      try {
        await sendMessage(request.id, me, body);
        await renderThread(threadEl, request);
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  }
}

function renderFavorites(el, onRefresh) {
  const state = getState();
  if (state.favoritesLoading) {
    el.innerHTML = inlineLoadingHtml("Loading favorites…");
    return;
  }
  const favorites = state.favorites.filter((fav) => fav.listings);
  if (!favorites.length) {
    el.innerHTML = emptyStateHtml({
      title: "No favorites yet",
      body: "Tap the heart on any robot to keep it here for quick access.",
    });
    return;
  }

  el.innerHTML =
    '<div class="dash-grid">' +
    favorites
      .map((fav) => {
        const listing = fav.listings;
        const photos = (listing.listing_photos || [])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const photo = photos[0];
        const unavailable = listing.status !== "published";
        return `
          <div class="card owner-listing-card">
            <div class="owner-listing-row">
              <div class="thumb${photo ? "" : " media-ph media-ph-" + mediaVariant(listing.id)}">${photo ? '<img src="' + escapeHtml(photoPublicUrl(photo.storage_path)) + '" alt="">' : ""}</div>
              <div class="grow">
                <h3>${escapeHtml(listing.title || "Robot listing")}</h3>
                <span class="location" style="color:var(--muted);font-size:0.88rem">${escapeHtml(listing.location_name || "")} · ${Number(listing.price_per_day).toLocaleString("sv-SE")} kr/day</span>
                ${unavailable ? '<div style="margin-top:6px"><span class="status-pill status-muted">No longer listed</span></div>' : ""}
              </div>
            </div>
            <div class="card-actions">
              ${!unavailable ? '<button class="btn btn-ghost btn-sm" data-open-fav="' + escapeHtml(listing.id) + '">View robot</button>' : ""}
              <button class="btn btn-danger btn-sm" data-remove-fav="${escapeHtml(fav.id)}">Remove</button>
            </div>
          </div>
        `;
      })
      .join("") +
    "</div>";

  el.querySelectorAll("[data-open-fav]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(listingPath(btn.dataset.openFav)));
  });
  el.querySelectorAll("[data-remove-fav]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removeFavorite(btn.dataset.removeFav);
        toast("Removed from favorites.");
        await loadCustomerData();
        if (onRefresh) onRefresh();
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  });
}
