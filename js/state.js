// App state for BotShare: session, profile, filters, listings, requests,
// favorites, payments, and loading/error flags. State only — no data access.

const state = {
  // Auth/identity
  session: null,
  profile: null, // app-local profile row; null means app signup not completed
  authReady: false,

  // Marketplace
  listings: [],
  listingsLoading: false,
  listingsError: "",
  filters: {
    search: "",
    maxPrice: "",
    supportLevel: "",
  },

  // Detail view
  selectedListing: null,
  selectedListingLoading: false,
  selectedListingError: "",

  // Customer data
  favorites: [], // favorite rows { id, listing_id, listing }
  favoritesLoading: false,
  customerRequests: [],
  customerRequestsLoading: false,

  // Owner data
  ownerListings: [],
  ownerListingsLoading: false,
  ownerRequests: [],
  ownerRequestsLoading: false,
  ownerPayments: [],
  unlockPlan: null,

  // Conversations: requestId -> messages[]
  messagesByRequest: {},

  // UI
  authModal: null, // null | 'signin' | 'signup' | 'profile'
  pendingRoute: null,
};

const subscribers = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of subscribers) fn(state);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

// ---- Selectors ----

export function isSignedIn() {
  return Boolean(state.session && state.session.user);
}

export function currentUserId() {
  return state.session?.user?.id || null;
}

export function hasProfile() {
  return Boolean(state.profile);
}

export function isFavorite(listingId) {
  return state.favorites.some((f) => f.listing_id === listingId);
}

export function favoriteFor(listingId) {
  return state.favorites.find((f) => f.listing_id === listingId) || null;
}

export function listingUnlocked(listingId) {
  return state.ownerPayments.some(
    (p) => p.listing_id === listingId && p.status === "paid"
  );
}

export function listingUnlockPending(listingId) {
  return (
    !listingUnlocked(listingId) &&
    state.ownerPayments.some(
      (p) => p.listing_id === listingId && p.status === "pending"
    )
  );
}
