// Hash-based SPA router for BotShare.
// Routes: marketplace, listing detail, owner dashboard, listing editor,
// customer dashboard, and checkout return.

const routes = [
  { name: "marketplace", pattern: /^\/?$/ },
  { name: "listing", pattern: /^\/listing\/([A-Za-z0-9-]+)$/ },
  { name: "owner", pattern: /^\/owner$/ },
  { name: "listing-new", pattern: /^\/owner\/new$/ },
  { name: "listing-edit", pattern: /^\/owner\/edit\/([A-Za-z0-9-]+)$/ },
  { name: "account", pattern: /^\/account$/ },
  { name: "checkout-return", pattern: /^\/checkout\/return$/ },
];

let routeChangeHandler = null;

export function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "") || "/";
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      return { name: route.name, params: match.slice(1), hash };
    }
  }
  return { name: "marketplace", params: [], hash };
}

export function navigate(path) {
  const target = "#" + path;
  if (window.location.hash === target) {
    if (routeChangeHandler) routeChangeHandler(parseRoute());
  } else {
    window.location.hash = target;
  }
}

export function onRouteChange(fn) {
  routeChangeHandler = fn;
  window.addEventListener("hashchange", () => {
    if (routeChangeHandler) routeChangeHandler(parseRoute());
  });
}

export function listingPath(id) {
  return "/listing/" + id;
}
