// Robot detail view: photo gallery, skills, pricing, availability, support
// level, favorite toggle, owner info, and rental request CTA.

import { getState, setState, isSignedIn, hasProfile, currentUserId, isFavorite, favoriteFor } from "../state.js";
import { fetchListingDetail } from "../api/listings.js";
import { createRentalRequest } from "../api/requests.js";
import { addFavorite, removeFavorite, fetchFavorites } from "../api/favorites.js";
import { photoPublicUrl } from "../api/storage.js";
import { renderDetailMap } from "../map.js";
import { openAuthModal } from "./authModal.js";
import { escapeHtml, formatDate, inlineLoadingHtml, renderErrorBox, toast, mediaVariant } from "./feedback.js";

const SUPPORT_COPY = {
  basic: { label: "Self-serve", body: "You pick up, set up, and operate the robot yourself with the owner's instructions." },
  guided: { label: "Guided setup", body: "The owner walks you through setup at handover and stays reachable during the rental." },
  full_service: { label: "Full service", body: "The owner delivers, sets up, and supports the robot throughout the rental." },
};

export async function loadListingDetail(id) {
  setState({ selectedListingLoading: true, selectedListingError: "", selectedListing: null });
  try {
    const listing = await fetchListingDetail(id);
    if (!listing) {
      setState({ selectedListingLoading: false, selectedListingError: "This robot is no longer listed." });
      return;
    }
    setState({ selectedListing: listing, selectedListingLoading: false });
  } catch (err) {
    setState({ selectedListingLoading: false, selectedListingError: err.message });
  }
}

export function renderListingDetailView(rootEl, { onRefresh } = {}) {
  const state = getState();

  if (state.selectedListingLoading) {
    rootEl.innerHTML = '<div class="container">' + inlineLoadingHtml("Loading robot…") + "</div>";
    return;
  }
  if (state.selectedListingError || !state.selectedListing) {
    rootEl.innerHTML = '<div class="container" style="padding-top:32px"></div>';
    renderErrorBox(
      rootEl.querySelector(".container"),
      state.selectedListingError || "This robot is no longer listed.",
      onRefresh
    );
    return;
  }

  const listing = state.selectedListing;
  const photos = listing.photos || [];
  const support = SUPPORT_COPY[listing.support_level] || SUPPORT_COPY.basic;
  const favorite = isFavorite(listing.id);

  rootEl.innerHTML = `
    <div class="container view-enter">
      <a class="back-link" href="#/">← Back to all robots</a>
      <div class="detail-layout">
        <div>
          <div class="photo-gallery" data-gallery>
            <div class="gallery-main${photos.length ? "" : " media-ph media-ph-" + mediaVariant(listing.id)}" data-gallery-main${photos.length ? "" : ' role="img" aria-label="No photos added yet for ' + escapeHtml(listing.title) + '"'}>
              ${photos.length
                ? '<img src="' + escapeHtml(photoPublicUrl(photos[0].storage_path)) + '" alt="' + escapeHtml(listing.title) + '">'
                : ""}
            </div>
            ${photos.length > 1
              ? '<div class="gallery-thumbs">' +
                photos
                  .map(
                    (photo, index) =>
                      '<button type="button" data-photo-index="' + index + '" class="' + (index === 0 ? "is-active" : "") + '">' +
                      '<img src="' + escapeHtml(photoPublicUrl(photo.storage_path)) + '" alt="Photo ' + (index + 1) + " of " + escapeHtml(listing.title) + '"></button>'
                  )
                  .join("") +
                "</div>"
              : ""}
          </div>

          <div class="detail-title-row">
            <div>
              <h1 style="font-size:clamp(1.5rem,3vw,2.1rem)">${escapeHtml(listing.title)}</h1>
              <p class="detail-meta">${escapeHtml(listing.robot_model || "")}${listing.robot_model ? " · " : ""}${escapeHtml(listing.location_name || "")}</p>
            </div>
            <button class="icon-btn ${favorite ? "is-active" : ""}" type="button" data-favorite aria-pressed="${favorite}" aria-label="${favorite ? "Remove from favorites" : "Save to favorites"}">${favorite ? "♥" : "♡"}</button>
          </div>

          <div class="chip-row">
            <span class="chip">${escapeHtml(support.label)}</span>
            ${(listing.skills || []).map((skill) => '<span class="chip chip-plain">' + escapeHtml(skill) + "</span>").join("")}
          </div>

          <section class="detail-section">
            <h2>About this robot</h2>
            <p style="white-space:pre-line">${escapeHtml(listing.description || listing.summary || "The owner has not written a description yet.")}</p>
          </section>

          ${(listing.tasks || []).length
            ? '<section class="detail-section"><h2>Great for</h2><div class="chip-row">' +
              listing.tasks.map((task) => '<span class="chip chip-amber">' + escapeHtml(task) + "</span>").join("") +
              "</div></section>"
            : ""}

          <section class="detail-section">
            <h2>Support level</h2>
            <p>${escapeHtml(support.body)}</p>
          </section>

          <section class="detail-section">
            <h2>Pickup area</h2>
            <div class="map-panel" style="min-height:280px" data-detail-map></div>
          </section>
        </div>

        <div>
          <div class="card booking-card">
            <div class="price-line">
              <strong>${Number(listing.price_per_day).toLocaleString("sv-SE")} kr</strong>
              <span>per day</span>
            </div>
            <h3>Availability</h3>
            <div data-availability>
              ${(listing.availability || []).length
                ? '<ul class="availability-list">' +
                  listing.availability
                    .map(
                      (win) =>
                        "<li><span>" + formatDate(win.start_date) + " – " + formatDate(win.end_date) + "</span>" +
                        (win.note ? '<span class="note">' + escapeHtml(win.note) + "</span>" : "") +
                        "</li>"
                    )
                    .join("") +
                  "</ul>"
                : '<p class="detail-meta">The owner has not published availability windows yet — send a request with your dates.</p>'}
            </div>
            <div data-request-area style="margin-top:16px"></div>
            <div class="owner-line">
              <span>Listed by <strong>${escapeHtml(listing.ownerName)}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Gallery thumbs
  const mainEl = rootEl.querySelector("[data-gallery-main]");
  rootEl.querySelectorAll("[data-photo-index]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const photo = photos[Number(btn.dataset.photoIndex)];
      if (!photo) return;
      mainEl.innerHTML =
        '<img src="' + escapeHtml(photoPublicUrl(photo.storage_path)) + '" alt="' + escapeHtml(listing.title) + '">';
      rootEl.querySelectorAll("[data-photo-index]").forEach((other) => {
        other.classList.toggle("is-active", other === btn);
      });
    });
  });

  renderDetailMap(rootEl.querySelector("[data-detail-map]"), listing);
  renderRequestArea(rootEl.querySelector("[data-request-area]"), listing, onRefresh);
  wireFavorite(rootEl, listing, onRefresh);
}

function wireFavorite(rootEl, listing, onRefresh) {
  const btn = rootEl.querySelector("[data-favorite]");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!isSignedIn() || !hasProfile()) {
      openAuthModal(isSignedIn() ? "profile" : "signin", onRefresh);
      return;
    }
    btn.disabled = true;
    try {
      const existing = favoriteFor(listing.id);
      if (existing) {
        await removeFavorite(existing.id);
        toast("Removed from favorites.");
      } else {
        await addFavorite(currentUserId(), listing.id);
        toast("Saved to favorites.", "success");
      }
      const favorites = await fetchFavorites(currentUserId());
      setState({ favorites });
      if (onRefresh) onRefresh();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function renderRequestArea(el, listing, onRefresh) {
  if (!el) return;
  const state = getState();
  const ownListing = currentUserId() === listing.owner_id;

  if (ownListing) {
    el.innerHTML = '<a class="btn btn-ghost btn-block" href="#/owner/edit/' + escapeHtml(listing.id) + '">Edit your listing</a>';
    return;
  }

  const alreadyRequested = state.customerRequests.some(
    (req) => req.listing_id === listing.id && ["pending", "accepted"].includes(req.status)
  );
  if (alreadyRequested) {
    el.innerHTML =
      '<div class="status-pill status-teal">Request sent</div>' +
      '<p class="detail-meta" style="margin-top:10px">Track it under <a href="#/account">My rentals</a>.</p>';
    return;
  }

  el.innerHTML = '<button class="btn btn-primary btn-block" type="button" data-request-cta>Request this robot</button>';
  el.querySelector("[data-request-cta]").addEventListener("click", () => {
    if (!isSignedIn() || !hasProfile()) {
      openAuthModal(isSignedIn() ? "profile" : "signin", onRefresh);
      return;
    }
    renderRequestForm(el, listing, onRefresh);
  });
}

function renderRequestForm(el, listing, onRefresh) {
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = `
    <form data-request-form>
      <div class="form-error" data-error hidden></div>
      <div class="form-row">
        <div class="field">
          <label for="req-start">From</label>
          <input id="req-start" name="startDate" type="date" min="${today}" required>
        </div>
        <div class="field">
          <label for="req-end">To</label>
          <input id="req-end" name="endDate" type="date" min="${today}" required>
        </div>
      </div>
      <div class="field">
        <label for="req-message">Message to the owner</label>
        <textarea id="req-message" name="message" maxlength="1000" placeholder="What do you want the robot to do? Where and when can you meet?"></textarea>
      </div>
      <button class="btn btn-primary btn-block" type="submit" data-submit>Send rental request</button>
    </form>
  `;
  const form = el.querySelector("[data-request-form]");
  const errorEl = el.querySelector("[data-error]");
  const submitBtn = el.querySelector("[data-submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const startDate = form.startDate.value;
    const endDate = form.endDate.value;
    if (!startDate || !endDate || endDate < startDate) {
      errorEl.textContent = "Pick a valid date range (end date after start date).";
      errorEl.hidden = false;
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      await createRentalRequest({
        listingId: listing.id,
        ownerId: listing.owner_id,
        customerId: currentUserId(),
        startDate,
        endDate,
        message: form.message.value.trim(),
      });
      toast("Rental request sent!", "success");
      if (onRefresh) onRefresh();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Send rental request";
    }
  });
}
