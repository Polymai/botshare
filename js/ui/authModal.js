// Auth modal: sign in / create account tabs plus the app-level profile
// completion step (display name + primary role) for new BotShare members.

import { signIn, signUp, resetPassword, createProfile, loadProfile } from "../auth.js";
import { getState, setState } from "../state.js";
import { escapeHtml, toast } from "./feedback.js";

let modalEl = null;
let onDone = null;

export function openAuthModal(mode, doneCallback) {
  onDone = doneCallback || null;
  closeAuthModal();
  setState({ authModal: mode });
  modalEl = document.createElement("div");
  modalEl.className = "modal-backdrop";
  modalEl.addEventListener("click", (event) => {
    if (event.target === modalEl) closeAuthModal();
  });
  document.body.appendChild(modalEl);
  renderModal(mode);
}

export function closeAuthModal() {
  if (modalEl) {
    modalEl.remove();
    modalEl = null;
  }
  setState({ authModal: null });
}

function renderModal(mode) {
  if (!modalEl) return;
  if (mode === "profile") {
    renderProfileStep();
  } else {
    renderAuthStep(mode === "signup" ? "signup" : "signin");
  }
}

function renderAuthStep(tab) {
  const isSignup = tab === "signup";
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div class="modal-head">
        <h2 id="auth-modal-title">${isSignup ? "Create your account" : "Welcome back"}</h2>
        <button class="modal-close" type="button" aria-label="Close">×</button>
      </div>
      <div class="auth-tabs" role="tablist">
        <button role="tab" aria-selected="${!isSignup}" data-tab="signin">Sign in</button>
        <button role="tab" aria-selected="${isSignup}" data-tab="signup">Create account</button>
      </div>
      <form data-auth-form novalidate>
        <div class="form-error" data-error hidden></div>
        <div class="field">
          <label for="auth-email">Email</label>
          <input id="auth-email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="auth-password">Password</label>
          <input id="auth-password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="8" required>
          ${isSignup ? '<p class="hint">At least 8 characters.</p>' : ""}
        </div>
        <button class="btn btn-primary btn-block" type="submit" data-submit>
          ${isSignup ? "Create account" : "Sign in"}
        </button>
        ${isSignup ? "" : '<button class="btn btn-ghost btn-block" type="button" data-forgot style="margin-top:10px">Forgot password?</button>'}
      </form>
      <p class="trust-note">Sign-in is handled securely by Supabase. If you have used another service from the same provider, the same account may work here.</p>
    </div>
  `;

  modalEl.querySelector(".modal-close").addEventListener("click", closeAuthModal);
  modalEl.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => renderAuthStep(btn.dataset.tab));
  });

  const form = modalEl.querySelector("[data-auth-form]");
  const errorEl = modalEl.querySelector("[data-error]");
  const submitBtn = modalEl.querySelector("[data-submit]");

  const forgotBtn = modalEl.querySelector("[data-forgot]");
  if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
      const email = form.email.value.trim();
      if (!email) {
        showError(errorEl, "Enter your email above first, then press Forgot password.");
        return;
      }
      forgotBtn.disabled = true;
      try {
        await resetPassword(email);
        toast("If that email has an account, a reset link is on its way.", "success");
      } catch (err) {
        showError(errorEl, err.message);
      } finally {
        forgotBtn.disabled = false;
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || password.length < 8) {
      showError(errorEl, "Enter your email and a password of at least 8 characters.");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = isSignup ? "Creating account…" : "Signing in…";
    try {
      if (isSignup) {
        const hasSession = await signUp(email, password);
        if (!hasSession) {
          modalEl.querySelector(".modal").innerHTML =
            '<div class="modal-head"><h2>Check your email</h2>' +
            '<button class="modal-close" type="button" aria-label="Close">×</button></div>' +
            "<p>We sent a confirmation link to <strong>" + escapeHtml(email) + "</strong>. " +
            "Open it to activate your account, then come back and sign in.</p>" +
            '<p class="trust-note">Sign-in is handled securely by Supabase. If you have used another service from the same provider, the same account may work here.</p>';
          modalEl.querySelector(".modal-close").addEventListener("click", closeAuthModal);
          return;
        }
      } else {
        await signIn(email, password);
      }
      const profile = await loadProfile();
      if (!profile) {
        renderProfileStep();
      } else {
        closeAuthModal();
        toast("Welcome back, " + profile.display_name + "!", "success");
        if (onDone) onDone();
      }
    } catch (err) {
      showError(errorEl, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? "Create account" : "Sign in";
    }
  });
}

function renderProfileStep() {
  const email = getState().session?.user?.email || "";
  let role = "customer";
  modalEl.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div class="modal-head">
        <h2 id="profile-modal-title">Finish your BotShare profile</h2>
        <button class="modal-close" type="button" aria-label="Close">×</button>
      </div>
      <p>You're signed in${email ? " as <strong>" + escapeHtml(email) + "</strong>" : ""}. One quick step: tell the marketplace who you are.</p>
      <form data-profile-form novalidate>
        <div class="form-error" data-error hidden></div>
        <div class="field">
          <label for="profile-name">Display name</label>
          <input id="profile-name" name="displayName" type="text" maxlength="60" required placeholder="e.g. Adam S.">
          <p class="hint">Shown to renters and owners you talk to.</p>
        </div>
        <div class="field">
          <label>I'm mainly here to…</label>
          <div class="role-picker">
            <button type="button" class="role-option" data-role="customer" aria-pressed="true">
              <strong>Rent robots</strong>
              <span>Browse nearby robots and send rental requests.</span>
            </button>
            <button type="button" class="role-option" data-role="owner" aria-pressed="false">
              <strong>Rent out my robot</strong>
              <span>Publish listings and earn from idle robots.</span>
            </button>
          </div>
        </div>
        <button class="btn btn-primary btn-block" type="submit" data-submit>Save and continue</button>
      </form>
    </div>
  `;

  modalEl.querySelector(".modal-close").addEventListener("click", closeAuthModal);
  const errorEl = modalEl.querySelector("[data-error]");
  modalEl.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      role = btn.dataset.role;
      modalEl.querySelectorAll("[data-role]").forEach((other) => {
        other.setAttribute("aria-pressed", String(other === btn));
      });
    });
  });

  const form = modalEl.querySelector("[data-profile-form]");
  const submitBtn = modalEl.querySelector("[data-submit]");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = form.displayName.value.trim();
    if (!displayName) {
      showError(errorEl, "Pick a display name.");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";
    try {
      await createProfile(displayName, role);
      closeAuthModal();
      toast("Welcome to BotShare, " + displayName + "!", "success");
      if (onDone) onDone(role);
    } catch (err) {
      showError(errorEl, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = "Save and continue";
    }
  });
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}
