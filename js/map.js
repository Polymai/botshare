// BotShare maps: browsable listing map and owner pin placement.
// Uses Leaflet + OpenStreetMap tiles (no private credentials). Every map
// gracefully falls back to a text panel when Leaflet is unavailable.

const SWEDEN_CENTER = [59.334, 18.063];
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap contributors";

function leafletAvailable() {
  return typeof window !== "undefined" && Boolean(window.L);
}

function renderFallback(el, message) {
  el.innerHTML =
    '<div class="map-fallback"><p><strong>Map unavailable</strong></p><p>' +
    message +
    "</p></div>";
}

function createBaseMap(el, center, zoom) {
  const map = window.L.map(el, { scrollWheelZoom: false }).setView(center, zoom);
  window.L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
  return map;
}

// Browse map: one pin per listing with a small popup linking to the detail page.
export function renderListingMap(el, listings, { onOpenListing } = {}) {
  if (!leafletAvailable()) {
    renderFallback(el, "Listings are shown in the list below with their locations.");
    return null;
  }
  const located = listings.filter(
    (l) => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng))
  );
  const map = createBaseMap(el, SWEDEN_CENTER, 5);
  if (!located.length) return map;

  const bounds = [];
  for (const listing of located) {
    const marker = window.L
      .marker([Number(listing.lat), Number(listing.lng)], {
        alt: listing.title,
        title: listing.title,
      })
      .addTo(map);
    bounds.push([Number(listing.lat), Number(listing.lng)]);
    const popup = document.createElement("div");
    const title = document.createElement("div");
    title.className = "map-popup-title";
    title.textContent = listing.title;
    const meta = document.createElement("div");
    meta.textContent = listing.location_name || "";
    const link = document.createElement("a");
    link.href = "#/listing/" + listing.id;
    link.textContent = "View robot →";
    popup.append(title, meta, link);
    marker.bindPopup(popup);
    if (onOpenListing) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        onOpenListing(listing.id);
      });
    }
  }
  if (bounds.length === 1) {
    map.setView(bounds[0], 11);
  } else {
    map.fitBounds(bounds, { padding: [36, 36] });
  }
  return map;
}

// Single-listing mini map for the detail page.
export function renderDetailMap(el, listing) {
  if (!leafletAvailable()) {
    renderFallback(el, listing.location_name || "Location shared after the owner confirms.");
    return null;
  }
  if (!Number.isFinite(Number(listing.lat)) || !Number.isFinite(Number(listing.lng))) {
    renderFallback(el, "The owner has not placed a map pin for this robot yet.");
    return null;
  }
  const center = [Number(listing.lat), Number(listing.lng)];
  const map = createBaseMap(el, center, 12);
  window.L
    .marker(center, { alt: "Pickup area for " + (listing.title || "this robot"), title: listing.location_name || "Pickup area" })
    .addTo(map);
  return map;
}

// Owner pin placement: click to set the pickup point; returns a controller
// with getPosition(). Coordinates are read back on save.
export function renderPinPicker(el, { lat, lng, onChange } = {}) {
  if (!leafletAvailable()) {
    renderFallback(el, "You can still publish — add a clear pickup area in the location field.");
    return { getPosition: () => ({ lat: lat ?? null, lng: lng ?? null }) };
  }
  const hasPin = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const center = hasPin ? [Number(lat), Number(lng)] : SWEDEN_CENTER;
  const map = createBaseMap(el, center, hasPin ? 12 : 5);
  const pinOptions = { draggable: true, alt: "Pickup pin", title: "Pickup pin — drag to adjust" };
  let marker = hasPin ? window.L.marker(center, pinOptions).addTo(map) : null;
  let position = hasPin ? { lat: Number(lat), lng: Number(lng) } : { lat: null, lng: null };

  function setPosition(nextLat, nextLng) {
    position = { lat: nextLat, lng: nextLng };
    if (!marker) {
      marker = window.L.marker([nextLat, nextLng], pinOptions).addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLatLng();
        setPosition(point.lat, point.lng);
      });
    } else {
      marker.setLatLng([nextLat, nextLng]);
    }
    if (onChange) onChange(position);
  }

  map.on("click", (event) => {
    setPosition(event.latlng.lat, event.latlng.lng);
  });
  if (marker) {
    marker.on("dragend", () => {
      const point = marker.getLatLng();
      setPosition(point.lat, point.lng);
    });
  }

  return {
    getPosition: () => position,
    map,
  };
}
