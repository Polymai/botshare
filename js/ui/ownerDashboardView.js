// Owner dashboard: listings with publish + unlock status, incoming rental
// requests with conversations, unlock checkout, and billing access.

import {
  getState,
  setState,
  isSignedIn,
  hasProfile,
  currentUserId,
  listingUnlocked,
  listingUnlockPending,
} from "../state.js";
import { fetchOwnerListings, updateListing } from "../api/listings.js";
import { fetchOwnerRequests, updateRequestStatus, fetchMessages, sendMessage, fetchProfilesMap } from "../api/requests.js";
import { fetchOwnerPayments, fetchUnlockPlan, startListingUnlockCheckout, openBillingPortal, formatAmount } from "../api/payments.js";
import { photoPublicUrl } from "../api/storage.js";
import { openAuthModal } from "./authModal.js";
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  inlineLoadingHtml,
  emptyStateHtml,
  renderErrorBox,
  toast,
  showAppLoader,
  hideAppLoader,
  mediaVariant,
} from "./feedback.js";

const profileNames = {};

export async function loadOwnerData() {
  const ownerId = currentUserId();
  if (!ownerId) return;
  setState({ ownerListingsLoading: true, ownerRequestsLoading: true });
  try {
    const [listings, requests, payments, plan] = await Promise.all([
      fetchOwnerListings(ownerId),
      fetchOwnerRequests(ownerId),
      fetchOwnerPayments(ownerId),
      fetchUnlockPlan(),
    ]);
    const customerIds = [...new Set(requests.map((r) => r.customer_id))];
    Object.assign(profileNames, await fetchProfilesMap(customerIds));
    setState({
      ownerListings: listings,
      ownerRequests: requests,
      ownerPayments: payments,
      unlockPlan: plan,
      ownerListingsLoading: false,
      ownerRequestsLoading: false,
    });
  } catch (err) {
    setState({ ownerListingsLoading: false, ownerRequestsLoading: false });
    toast(err.message, "error");
  }
}

export function renderOwnerDashboardView(rootEl, { onRefresh } = {}) {
  if (!isSignedIn() || !hasProfile()) {
    renderGate(rootEl, onRefresh);
    return;
  }
  const state = getState();

  rootEl.innerHTML = `
    <div class="container view-enter">
      <div class="dash-head">
        <div>
          <h1 style="font-size:clamp(1.6rem,3vw,2.2rem)">Owner dashboard</h1>
          <p>Your robots, requests, and next actions.</p>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-ghost" type="button" data-billing>Manage billing</button>
          <a class="btn btn-primary" href="#/owner/new">+ New listing</a>
        </div>
      </div>

      <section aria-labelledby="owner-listings-title">
        <h2 id="owner-listings-title">Your listings</h2>
        <div data-owner-listings></div>
      </section>

      <section style="margin-top:40px" aria-labelledby="owner-requests-title">
        <h2 id="owner-requests-title">Incoming rental requests</h2>
        <div data-owner-requests></div>
      </section>
    </div>
  `;

  rootEl.querySelector("[data-billing]").addEventListener("click", async () => {
    showAppLoader("Opening your billing overview…");
    try {
      await openBillingPortal();
      // Redirecting away; keep the loader visible.
    } catch (err) {
      hideAppLoader();
      if (err.code === "no_billing_history") {
        toast("No billing history yet — it appears after your first unlock payment.");
      } else {
        toast(err.message, "error");
      }
    }
  });

  renderOwnerListings(rootEl.querySelector("[data-owner-listings]"), onRefresh);
  renderOwnerRequests(rootEl.querySelector("[data-owner-requests]"), onRefresh);
}

function renderGate(rootEl, onRefresh) {
  rootEl.innerHTML = `
    <div class="container">
      <div class="gate-panel view-enter">
        <div class="card">
          <h2>Rent out your robot</h2>
          <p>Publish a listing with photos, skills, availability, and a pickup pin — then handle requests from renters near you.</p>
          <button class="btn btn-primary" type="button" data-gate-signin>${isSignedIn() ? "Finish your profile" : "Sign in to get started"}</button>
        </div>
      </div>
    </div>
  `;
  rootEl.querySelector("[data-gate-signin]").addEventListener("click", () => {
    openAuthModal(isSignedIn() ? "profile" : "signin", onRefresh);
  });
}

function unlockStatusPill(listingId) {
  if (listingUnlocked(listingId)) {
    return '<span class="status-pill status-ok">Conversations unlocked</span>';
  }
  if (listingUnlockPending(listingId)) {
    return '<span class="status-pill status-warn">Unlock payment pending</span>';
  }
  return '<span class="status-pill status-muted">Conversations locked</span>';
}

function renderOwnerListings(el, onRefresh) {
  const state = getState();
  if (state.ownerListingsLoading) {
    el.innerHTML = inlineLoadingHtml("Loading your listings…");
    return;
  }
  if (!state.ownerListings.length) {
    el.innerHTML = emptyStateHtml({
      title: "No listings yet",
      body: "Your first robot listing takes about five minutes: photos, skills, price, and a pickup pin.",
      actionLabel: "Create your first listing",
      actionAttr: 'onclick="window.location.hash=\'#/owner/new\'"',
    });
    return;
  }

  el.innerHTML =
    '<div class="dash-grid">' +
    state.ownerListings
      .map((listing) => {
        const photo = listing.photos && listing.photos[0];
        const statusPill =
          listing.status === "published"
            ? '<span class="status-pill status-ok">Published</span>'
            : listing.status === "archived"
              ? '<span class="status-pill status-muted">Archived</span>'
              : '<span class="status-pill status-warn">Draft</span>';
        return `
          <div class="card owner-listing-card">
            <div class="owner-listing-row">
              <div class="thumb${photo ? "" : " media-ph media-ph-" + mediaVariant(listing.id)}">${photo ? '<img src="' + escapeHtml(photoPublicUrl(photo.storage_path)) + '" alt="">' : ""}</div>
              <div class="grow">
                <h3>${escapeHtml(listing.title)}</h3>
                <div class="chip-row">${statusPill}${unlockStatusPill(listing.id)}</div>
              </div>
            </div>
            <div class="card-actions">
              <a class="btn btn-ghost btn-sm" href="#/owner/edit/${escapeHtml(listing.id)}">Edit</a>
              ${listing.status === "published"
                ? '<a class="btn btn-ghost btn-sm" href="#/listing/' + escapeHtml(listing.id) + '">View</a>' +
                  '<button class="btn btn-ghost btn-sm" data-unpublish="' + escapeHtml(listing.id) + '">Unpublish</button>'
                : '<button class="btn btn-primary btn-sm" data-publish="' + escapeHtml(listing.id) + '">Publish</button>'}
              ${!listingUnlocked(listing.id)
                ? '<button class="btn btn-dark btn-sm" data-unlock="' + escapeHtml(listing.id) + '">Unlock conversations</button>'
                : ""}
            </div>
          </div>
        `;
      })
      .join("") +
    "</div>";

  el.querySelectorAll("[data-publish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateListing(btn.dataset.publish, { status: "published" });
        toast("Listing published!", "success");
        await loadOwnerData();
        if (onRefresh) onRefresh();
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll("[data-unpublish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateListing(btn.dataset.unpublish, { status: "draft" });
        toast("Listing moved back to draft.");
        await loadOwnerData();
        if (onRefresh) onRefresh();
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  });
  el.querySelectorAll("[data-unlock]").forEach((btn) => {
    btn.addEventListener("click", () => startUnlock(btn.dataset.unlock, onRefresh));
  });
}

export async function startUnlock(listingId, onRefresh) {
  const plan = getState().unlockPlan;
  showAppLoader(
    plan
      ? "Taking you to secure checkout (" + formatAmount(plan.price_amount, plan.currency) + ")…"
      : "Taking you to secure checkout…"
  );
  try {
    const result = await startListingUnlockCheckout(listingId);
    if (result.alreadyUnlocked) {
      hideAppLoader();
      toast("Conversations are already unlocked for this listing.", "success");
      await loadOwnerData();
      if (onRefresh) onRefresh();
    }
    // Otherwise we are redirecting; keep the loader visible.
  } catch (err) {
    hideAppLoader();
    if (err.code === "setup_required") {
      toast("Payments are almost ready — checkout opens once payment setup is finished.", "error");
    } else {
      toast(err.message, "error");
    }
  }
}

function renderOwnerRequests(el, onRefresh) {
  const state = getState();
  if (state.ownerRequestsLoading) {
    el.innerHTML = inlineLoadingHtml("Loading requests…");
    return;
  }
  if (!state.ownerRequests.length) {
    el.innerHTML = emptyStateHtml({
      title: "No requests yet",
      body: "When renters request your robots, they show up here with their dates and a message.",
    });
    return;
  }

  el.innerHTML = state.ownerRequests
    .map((request) => {
      const customer = profileNames[request.customer_id] || "A renter";
      const statusPill =
        request.status === "pending"
          ? '<span class="status-pill status-warn">New request</span>'
          : request.status === "accepted"
            ? '<span class="status-pill status-ok">Accepted</span>'
            : request.status === "completed"
              ? '<span class="status-pill status-teal">Completed</span>'
              : '<span class="status-pill status-muted">' + escapeHtml(request.status) + "</span>";
      return `
        <div class="card request-card" data-request-id="${escapeHtml(request.id)}">
          <div class="card-title-row">
            <div>
              <h3 style="margin-bottom:4px">${escapeHtml(request.listings?.title || "Robot listing")}</h3>
              <div class="request-meta">
                <span>${escapeHtml(customer)}</span>
                <span>${formatDate(request.start_date)} – ${formatDate(request.end_date)}</span>
                <span>Received ${formatDateTime(request.created_at)}</span>
              </div>
            </div>
            ${statusPill}
          </div>
          ${request.message ? '<div class="request-message">' + escapeHtml(request.message) + "</div>" : ""}
          <div class="card-actions">
            ${request.status === "pending"
              ? '<button class="btn btn-primary btn-sm" data-accept>Accept</button>' +
                '<button class="btn btn-danger btn-sm" data-decline>Decline</button>'
              : ""}
            ${request.status === "accepted"
              ? '<button class="btn btn-ghost btn-sm" data-complete>Mark completed</button>'
              : ""}
            <button class="btn btn-ghost btn-sm" data-thread-toggle>Conversation</button>
          </div>
          <div data-thread hidden></div>
        </div>
      `;
    })
    .join("");

  el.querySelectorAll(".request-card").forEach((card) => {
    const requestId = card.dataset.requestId;
    const request = state.ownerRequests.find((r) => r.id === requestId);
    if (!request) return;

    const bindStatus = (selector, status, message) => {
      const btn = card.querySelector(selector);
      if (!btn) return;
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await updateRequestStatus(requestId, status);
          toast(message, "success");
          await loadOwnerData();
          if (onRefresh) onRefresh();
        } catch (err) {
          toast(err.message, "error");
          btn.disabled = false;
        }
      });
    };
    bindStatus("[data-accept]", "accepted", "Request accepted — agree on handover in the conversation.");
    bindStatus("[data-decline]", "declined", "Request declined.");
    bindStatus("[data-complete]", "completed", "Rental marked as completed.");

    const toggleBtn = card.querySelector("[data-thread-toggle]");
    const threadEl = card.querySelector("[data-thread]");
    toggleBtn.addEventListener("click", async () => {
      if (!threadEl.hidden) {
        threadEl.hidden = true;
        return;
      }
      threadEl.hidden = false;
      await renderThread(threadEl, request, onRefresh);
    });
  });
}

async function renderThread(threadEl, request, onRefresh) {
  threadEl.innerHTML = inlineLoadingHtml("Loading conversation…");
  let messages = [];
  try {
    messages = await fetchMessages(request.id);
  } catch (err) {
    renderErrorBox(threadEl, err.message, () => renderThread(threadEl, request, onRefresh));
    return;
  }

  const me = currentUserId();
  const unlocked = listingUnlocked(request.listing_id);
  const plan = getState().unlockPlan;

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
        : '<p class="detail-meta">No messages yet.</p>'}
    </div>
    ${unlocked
      ? `<form class="thread-composer" data-composer>
          <textarea name="body" maxlength="2000" placeholder="Reply to ${escapeHtml(profileNames[request.customer_id] || "the renter")}…" required></textarea>
          <button class="btn btn-primary" type="submit">Send</button>
        </form>`
      : `<div class="unlock-banner">
          <p><strong>Unlock conversations for this listing</strong><br>Reply to every renter for this robot with a one-time unlock${plan ? " — " + formatAmount(plan.price_amount, plan.currency) : ""}.</p>
          <button class="btn btn-dark" type="button" data-unlock-thread>Unlock now</button>
        </div>`}
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
        await renderThread(threadEl, request, onRefresh);
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  }
  const unlockBtn = threadEl.querySelector("[data-unlock-thread]");
  if (unlockBtn) {
    unlockBtn.addEventListener("click", () => startUnlock(request.listing_id, onRefresh));
  }
}
