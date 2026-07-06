// Public marketplace view: hero, filters, listing map, cards, offer strip,
// and FAQ. Data loading is triggered by the orchestrator/actions, not here.

import { getState, setState } from "../state.js";
import { fetchPublishedListings } from "../api/listings.js";
import { renderListingMap } from "../map.js";
import { photoPublicUrl } from "../api/storage.js";
import { navigate, listingPath } from "../router.js";
import { escapeHtml, inlineLoadingHtml, emptyStateHtml, renderErrorBox, mediaVariant } from "./feedback.js";

let marketMap = null;

const SUPPORT_LABELS = {
  basic: "Self-serve",
  guided: "Guided setup",
  full_service: "Full service",
};

export function listingCardHtml(listing) {
  const photo = listing.photos && listing.photos[0];
  const photoUrl = photo ? photoPublicUrl(photo.storage_path) : "";
  const mediaClass = photoUrl
    ? "listing-card-media"
    : "listing-card-media media-ph media-ph-" + mediaVariant(listing.id);
  const media = photoUrl
    ? '<img src="' + escapeHtml(photoUrl) + '" alt="' + escapeHtml(listing.title) + '" loading="lazy">'
    : "";
  const skills = (listing.skills || [])
    .slice(0, 3)
    .map((skill) => '<span class="chip chip-plain">' + escapeHtml(skill) + "</span>")
    .join("");
  return `
    <article class="listing-card" data-listing-id="${escapeHtml(listing.id)}" tabindex="0" role="link" aria-label="${escapeHtml(listing.title)}">
      <div class="${mediaClass}">${media}</div>
      <div class="listing-card-body">
        <div class="listing-card-title">
          <h3>${escapeHtml(listing.title)}</h3>
          <span class="price">${Number(listing.price_per_day).toLocaleString("sv-SE")} kr<small>/day</small></span>
        </div>
        <span class="location">${escapeHtml(listing.location_name || "Location on request")}</span>
        ${listing.summary ? '<p class="summary">' + escapeHtml(listing.summary) + "</p>" : ""}
        <div class="chip-row">
          <span class="chip">${escapeHtml(SUPPORT_LABELS[listing.support_level] || "Self-serve")}</span>
          ${skills}
        </div>
      </div>
    </article>
  `;
}

export function wireListingCards(rootEl) {
  rootEl.querySelectorAll("[data-listing-id]").forEach((card) => {
    const open = () => navigate(listingPath(card.dataset.listingId));
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
}

export async function loadListings() {
  setState({ listingsLoading: true, listingsError: "" });
  try {
    const listings = await fetchPublishedListings(getState().filters);
    setState({ listings, listingsLoading: false });
  } catch (err) {
    setState({ listingsLoading: false, listingsError: err.message });
  }
}

export function renderMarketplaceView(rootEl, { onBrowseIntent } = {}) {
  const state = getState();
  rootEl.innerHTML = `
    <div class="view-enter">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-media" aria-hidden="true"></div>
        <div class="container">
          <div class="hero-inner">
            <span class="hero-kicker">Peer-to-peer robot rentals</span>
            <h1 id="hero-title">Rent robots from people <span class="accent">near you</span></h1>
            <p class="hero-lede">Household helpers, garden robots, and heavy lifters — listed by real owners with daily prices. Request the dates you need, or put your own robot to work.</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#browse-robots" data-browse-cta>Browse robots</a>
              <a class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,0.45)" href="#/owner">List your robot</a>
            </div>
            <div class="hero-stats" data-hero-stats>
              <div><strong data-stat-count>—</strong>robots listed</div>
              <div><strong>Per-day</strong>owner pricing</div>
              <div><strong>Direct</strong>owner-to-renter chat</div>
            </div>
          </div>
        </div>
      </section>

      <div class="container">
        <section class="marketplace-section" id="browse-robots" aria-labelledby="browse-title">
          <div class="section-head">
            <div>
              <h2 id="browse-title">Robots available now</h2>
              <p>Filter by task budget and support level, or explore the map.</p>
            </div>
          </div>
          <form class="filter-bar" data-filter-form>
            <div class="filter-field grow-2">
              <label for="filter-search">Search</label>
              <input id="filter-search" name="search" type="search" aria-label="Search robots by task or city" placeholder="Mowing, cleaning, lifting… or a city" value="${escapeHtml(state.filters.search)}">
            </div>
            <div class="filter-field">
              <label for="filter-price">Max kr/day</label>
              <input id="filter-price" name="maxPrice" type="number" min="0" step="50" aria-label="Maximum price per day in kronor" placeholder="Any" value="${escapeHtml(state.filters.maxPrice)}">
            </div>
            <div class="filter-field">
              <label for="filter-support">Support level</label>
              <select id="filter-support" name="supportLevel">
                <option value="">Any</option>
                <option value="basic" ${state.filters.supportLevel === "basic" ? "selected" : ""}>Self-serve</option>
                <option value="guided" ${state.filters.supportLevel === "guided" ? "selected" : ""}>Guided setup</option>
                <option value="full_service" ${state.filters.supportLevel === "full_service" ? "selected" : ""}>Full service</option>
              </select>
            </div>
            <div class="filter-field" style="flex:none;min-width:auto">
              <button class="btn btn-dark" type="submit">Apply</button>
            </div>
          </form>

          <div class="market-layout">
            <div data-listing-results></div>
            <div class="map-panel" data-market-map aria-label="Map of robot locations"></div>
          </div>
        </section>

        <section class="offer-strip" aria-label="How BotShare works">
          <div class="offer-card">
            <span class="step-num">Step 1</span>
            <h3>Find the right robot</h3>
            <p>Browse published robots by skill, price per day, and location — every listing shows photos, tasks, and availability windows.</p>
          </div>
          <div class="offer-card">
            <span class="step-num">Step 2</span>
            <h3>Request your dates</h3>
            <p>Send a rental request with your dates and a short note. The owner replies directly in your BotShare conversation.</p>
          </div>
          <div class="offer-card">
            <span class="step-num">Step 3</span>
            <h3>Meet and rent</h3>
            <p>Agree on handover with the owner. Owners unlock renter conversations with a one-time fee per listing — renting is free.</p>
          </div>
        </section>

        <section class="faq-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Frequently asked questions</h2>
          <details>
            <summary>What kinds of robots are on BotShare?</summary>
            <p>Household assistants, lawn and garden robots, snow clearers, window cleaners, lifting helpers, and cooking robots — all listed by private owners with per-day prices.</p>
          </details>
          <details>
            <summary>How much does renting cost?</summary>
            <p>Each listing shows the owner's price per day. You agree on duration and handover directly with the owner — BotShare doesn't add renter fees.</p>
          </details>
          <details>
            <summary>How do I list my own robot?</summary>
            <p>Create a free account, add photos, skills, availability, and a pickup pin on the map, then publish. A one-time fee per listing unlocks renter conversations.</p>
          </details>
          <details>
            <summary>Is my robot safe with a renter?</summary>
            <p>You stay in control: review every request, chat with the renter first, and only hand over when you're comfortable. Support-level labels tell renters how much guidance you provide.</p>
          </details>
        </section>
      </div>
    </div>
  `;

  const form = rootEl.querySelector("[data-filter-form]");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setState({
      filters: {
        search: form.search.value.trim(),
        maxPrice: form.maxPrice.value,
        supportLevel: form.supportLevel.value,
      },
    });
    if (onBrowseIntent) onBrowseIntent();
  });

  renderListingResults(rootEl, { onBrowseIntent });
}

export function renderListingResults(rootEl, { onBrowseIntent } = {}) {
  const state = getState();
  const resultsEl = rootEl.querySelector("[data-listing-results]");
  const mapEl = rootEl.querySelector("[data-market-map]");
  const statEl = rootEl.querySelector("[data-stat-count]");
  if (!resultsEl || !mapEl) return;

  if (statEl) {
    statEl.textContent =
      state.listingsLoading || state.listingsError ? "—" : String(state.listings.length);
  }

  if (state.listingsLoading) {
    resultsEl.innerHTML = inlineLoadingHtml("Finding robots near you…");
    return;
  }
  if (state.listingsError) {
    renderErrorBox(resultsEl, state.listingsError, () => {
      if (onBrowseIntent) onBrowseIntent();
    });
    return;
  }
  if (!state.listings.length) {
    resultsEl.innerHTML = emptyStateHtml({
      title: "No robots match those filters",
      body: "Try widening your search — clear the search text or raise the daily budget.",
      actionLabel: "Clear filters",
      actionAttr: "data-clear-filters",
    });
    const clearBtn = resultsEl.querySelector("[data-clear-filters]");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        setState({ filters: { search: "", maxPrice: "", supportLevel: "" } });
        if (onBrowseIntent) onBrowseIntent();
      });
    }
  } else {
    resultsEl.innerHTML =
      '<div class="listing-grid">' + state.listings.map(listingCardHtml).join("") + "</div>";
    wireListingCards(resultsEl);
  }

  // Leaflet marks containers as initialized; replace the node before re-render.
  if (marketMap) {
    marketMap.remove();
    marketMap = null;
  }
  const freshMapEl = mapEl.cloneNode(false);
  mapEl.replaceWith(freshMapEl);
  marketMap = renderListingMap(freshMapEl, state.listings, {
    onOpenListing: (id) => navigate(listingPath(id)),
  });
}
