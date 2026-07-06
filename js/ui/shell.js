// BotShare app shell: header with text-only wordmark, navigation, account
// controls, mobile drawer, route container, and footer.

import { getState, isSignedIn } from "../state.js";
import { escapeHtml } from "./feedback.js";

const NAV_ITEMS = [
  { route: "marketplace", hash: "#/", label: "Browse robots" },
  { route: "owner", hash: "#/owner", label: "Owner dashboard", authed: true },
  { route: "account", hash: "#/account", label: "My rentals", authed: true },
];

let handlers = {};

export function renderShell(rootEl, shellHandlers) {
  handlers = shellHandlers || {};
  rootEl.innerHTML = `
    <header class="app-header" data-app-header>
      <div class="container">
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-drawer" aria-label="Open menu">
          <span class="menu-bars" aria-hidden="true"></span>
        </button>
        <nav class="main-nav" aria-label="Main">
          <span data-nav-links></span>
        </nav>
        <div class="brand-scoop" aria-hidden="true"></div>
        <a class="brand-wordmark" href="#/"><span class="wordmark-line">Bot</span><span class="wordmark-line wordmark-accent">Share</span></a>
        <div class="header-actions">
          <span data-account-controls></span>
        </div>
      </div>
    </header>
    <div class="drawer-backdrop" data-drawer-backdrop hidden></div>
    <aside class="mobile-drawer" id="mobile-drawer" aria-label="Menu">
      <div class="drawer-head">
        <span class="brand-wordmark"><span class="wordmark-line">Bot</span><span class="wordmark-line wordmark-accent">Share</span></span>
        <button class="drawer-close" type="button" aria-label="Close menu">×</button>
      </div>
      <nav data-drawer-links aria-label="Mobile"></nav>
      <div class="drawer-meta" data-drawer-meta></div>
    </aside>
    <main id="route-root" class="app-main" tabindex="-1"></main>
    <footer class="app-footer">
      <div class="container">
        <span class="brand-wordmark"><span class="wordmark-line">Bot</span><span class="wordmark-line wordmark-accent">Share</span></span>
        <span>Peer-to-peer robot rentals. Rent a robot near you — or put yours to work.</span>
      </div>
    </footer>
  `;

  const toggle = rootEl.querySelector(".menu-toggle");
  const backdrop = rootEl.querySelector("[data-drawer-backdrop]");
  const closeBtn = rootEl.querySelector(".drawer-close");

  function setDrawer(open) {
    document.body.classList.toggle("drawer-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    backdrop.hidden = !open;
  }

  toggle.addEventListener("click", () => {
    setDrawer(!document.body.classList.contains("drawer-open"));
  });
  backdrop.addEventListener("click", () => setDrawer(false));
  closeBtn.addEventListener("click", () => setDrawer(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setDrawer(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) setDrawer(false);
  });
  window.addEventListener("hashchange", () => setDrawer(false));

  // Header shrink on scroll: toggle is-compact with hysteresis (engage past
  // 48px, release under 12px) so it never flickers around the threshold.
  // The 320ms easing lives in CSS and respects prefers-reduced-motion.
  const headerEl = rootEl.querySelector("[data-app-header]");
  let scrollTick = false;
  function syncHeaderState() {
    const y = window.scrollY;
    const compact = headerEl.classList.contains("is-compact");
    if (!compact && y > 48) headerEl.classList.add("is-compact");
    else if (compact && y < 12) headerEl.classList.remove("is-compact");
    scrollTick = false;
  }
  window.addEventListener(
    "scroll",
    () => {
      if (!scrollTick) {
        scrollTick = true;
        window.requestAnimationFrame(syncHeaderState);
      }
    },
    { passive: true }
  );
  syncHeaderState();

  updateShellNav("marketplace");
  return rootEl.querySelector("#route-root");
}

function navLinkHtml(item, activeRoute) {
  const current = item.route === activeRoute ? ' aria-current="page"' : "";
  return '<a class="nav-link" href="' + item.hash + '"' + current + ">" + escapeHtml(item.label) + "</a>";
}

export function updateShellNav(activeRoute) {
  const state = getState();
  const signedIn = isSignedIn();
  const items = NAV_ITEMS.filter((item) => !item.authed || signedIn);

  const desktop = document.querySelector("[data-nav-links]");
  const drawer = document.querySelector("[data-drawer-links]");
  const account = document.querySelector("[data-account-controls]");
  const drawerMeta = document.querySelector("[data-drawer-meta]");
  if (!desktop || !drawer || !account) return;

  const linksHtml = items.map((item) => navLinkHtml(item, activeRoute)).join("");
  desktop.innerHTML = linksHtml;

  if (signedIn) {
    account.innerHTML = '<button class="btn btn-ghost btn-sm" data-signout>Sign out</button>';
    account.querySelector("[data-signout]").addEventListener("click", () => {
      if (handlers.onSignOut) handlers.onSignOut();
    });
  } else {
    account.innerHTML = '<button class="btn btn-dark btn-sm" data-signin>Sign in</button>';
    account.querySelector("[data-signin]").addEventListener("click", () => {
      if (handlers.onSignIn) handlers.onSignIn();
    });
  }

  const name = state.profile?.display_name;
  drawer.innerHTML =
    linksHtml +
    (signedIn
      ? '<button class="btn btn-ghost btn-block" style="margin-top:12px" data-drawer-signout>Sign out</button>'
      : '<button class="btn btn-dark btn-block" style="margin-top:12px" data-drawer-signin>Sign in</button>');
  const drawerSignout = drawer.querySelector("[data-drawer-signout]");
  if (drawerSignout) {
    drawerSignout.addEventListener("click", () => {
      if (handlers.onSignOut) handlers.onSignOut();
    });
  }
  const drawerSignin = drawer.querySelector("[data-drawer-signin]");
  if (drawerSignin) {
    drawerSignin.addEventListener("click", () => {
      if (handlers.onSignIn) handlers.onSignIn();
    });
  }
  if (drawerMeta) {
    drawerMeta.textContent = signedIn
      ? "Signed in" + (name ? " as " + name : "")
      : "Browse freely — sign in to request rentals or list a robot.";
  }
}
