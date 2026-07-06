// Listing editor: create/edit flow with photos, map pin, skills, tasks,
// pricing, availability windows, AI draft assist, and publish controls.

import { getState, isSignedIn, hasProfile, currentUserId } from "../state.js";
import {
  fetchListingDetail,
  createListing,
  updateListing,
  deleteListing,
  addPhotoRecord,
  removePhotoRecord,
  addAvailability,
  removeAvailability,
} from "../api/listings.js";
import { uploadListingPhoto, removeListingPhoto, photoPublicUrl } from "../api/storage.js";
import { callAppApi } from "../supabaseClient.js";
import { renderPinPicker } from "../map.js";
import { navigate } from "../router.js";
import { openAuthModal } from "./authModal.js";
import {
  escapeHtml,
  formatDate,
  inlineLoadingHtml,
  renderErrorBox,
  toast,
  showAppLoader,
  hideAppLoader,
} from "./feedback.js";

function parseListText(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function renderListingEditorView(rootEl, listingId, { onSaved } = {}) {
  if (!isSignedIn() || !hasProfile()) {
    rootEl.innerHTML = `
      <div class="container">
        <div class="gate-panel view-enter">
          <div class="card">
            <h2>List your robot</h2>
            <p>Sign in and finish your profile to create a listing.</p>
            <button class="btn btn-primary" type="button" data-gate-signin>${isSignedIn() ? "Finish your profile" : "Sign in to continue"}</button>
          </div>
        </div>
      </div>
    `;
    rootEl.querySelector("[data-gate-signin]").addEventListener("click", () => {
      openAuthModal(isSignedIn() ? "profile" : "signin", onSaved);
    });
    return;
  }

  let listing = null;
  if (listingId) {
    rootEl.innerHTML = '<div class="container">' + inlineLoadingHtml("Loading your listing…") + "</div>";
    try {
      listing = await fetchListingDetail(listingId);
    } catch (err) {
      renderErrorBox(rootEl.querySelector(".container"), err.message, () =>
        renderListingEditorView(rootEl, listingId, { onSaved })
      );
      return;
    }
    if (!listing || listing.owner_id !== currentUserId()) {
      rootEl.innerHTML = '<div class="container" style="padding-top:32px"></div>';
      renderErrorBox(rootEl.querySelector(".container"), "This listing was not found in your account.");
      return;
    }
  }

  const isEdit = Boolean(listing);
  rootEl.innerHTML = `
    <div class="container view-enter">
      <a class="back-link" href="#/owner">← Back to owner dashboard</a>
      <div class="dash-head" style="margin-top:8px">
        <div>
          <h1 style="font-size:clamp(1.6rem,3vw,2.2rem)">${isEdit ? "Edit listing" : "New robot listing"}</h1>
          <p>${isEdit ? "Update details, photos, and availability." : "Save it as a draft first — photos and availability come right after."}</p>
        </div>
        ${isEdit && listing.status === "published" ? '<span class="status-pill status-ok">Published</span>' : isEdit ? '<span class="status-pill status-warn">Draft</span>' : ""}
      </div>

      <div class="editor-layout">
        <form class="card" data-editor-form novalidate>
          <div class="form-error" data-error hidden></div>
          <div class="field">
            <label for="ed-title">Listing title</label>
            <input id="ed-title" name="title" type="text" maxlength="90" required placeholder="e.g. Astra Home Assistant" value="${escapeHtml(listing?.title || "")}">
          </div>
          <div class="form-row">
            <div class="field">
              <label for="ed-model">Robot model</label>
              <input id="ed-model" name="robotModel" type="text" maxlength="90" placeholder="e.g. Astra A2 (2025)" value="${escapeHtml(listing?.robot_model || "")}">
            </div>
            <div class="field">
              <label for="ed-price">Price per day (kr)</label>
              <input id="ed-price" name="pricePerDay" type="number" min="0" step="10" required value="${escapeHtml(String(listing?.price_per_day ?? ""))}">
            </div>
          </div>
          <div class="ai-draft-row">
            <button class="btn btn-ghost btn-sm" type="button" data-ai-draft>✨ Draft copy for me</button>
            <span class="hint" style="color:var(--muted);font-size:0.83rem">Writes a summary, description, and skill suggestions from the fields above.</span>
          </div>
          <div class="field">
            <label for="ed-summary">Short summary</label>
            <input id="ed-summary" name="summary" type="text" maxlength="180" placeholder="One sentence renters see on the card" value="${escapeHtml(listing?.summary || "")}">
          </div>
          <div class="field">
            <label for="ed-description">Description</label>
            <textarea id="ed-description" name="description" maxlength="4000" placeholder="What does the robot do well? What should renters know about handover?">${escapeHtml(listing?.description || "")}</textarea>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="ed-skills">Skills (comma-separated)</label>
              <input id="ed-skills" name="skills" type="text" placeholder="Mowing, Edge trimming" value="${escapeHtml((listing?.skills || []).join(", "))}">
            </div>
            <div class="field">
              <label for="ed-tasks">Great for (comma-separated)</label>
              <input id="ed-tasks" name="tasks" type="text" placeholder="Weekly lawn care, Spring cleanup" value="${escapeHtml((listing?.tasks || []).join(", "))}">
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label for="ed-support">Support level</label>
              <select id="ed-support" name="supportLevel">
                <option value="basic" ${(listing?.support_level || "basic") === "basic" ? "selected" : ""}>Self-serve</option>
                <option value="guided" ${listing?.support_level === "guided" ? "selected" : ""}>Guided setup</option>
                <option value="full_service" ${listing?.support_level === "full_service" ? "selected" : ""}>Full service</option>
              </select>
            </div>
            <div class="field">
              <label for="ed-location">Pickup area</label>
              <input id="ed-location" name="locationName" type="text" maxlength="120" placeholder="e.g. Södermalm, Stockholm" value="${escapeHtml(listing?.location_name || "")}">
            </div>
          </div>
          <div class="field">
            <label>Pickup pin</label>
            <div class="map-panel editor-map" data-pin-map></div>
            <p class="map-hint">Click the map to drop the pickup pin. Drag to fine-tune.</p>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit" data-save>${isEdit ? "Save changes" : "Save draft"}</button>
            ${isEdit
              ? listing.status === "published"
                ? '<button class="btn btn-ghost" type="button" data-unpublish>Unpublish</button>'
                : '<button class="btn btn-dark" type="button" data-publish>Save &amp; publish</button>'
              : ""}
            ${isEdit ? '<button class="btn btn-danger" type="button" data-delete>Delete listing</button>' : ""}
          </div>
        </form>

        <div>
          ${isEdit
            ? `
          <div class="card">
            <h3>Photos</h3>
            <p class="hint" style="color:var(--muted);font-size:0.88rem">The first photo becomes the cover.</p>
            <div class="photo-manager" data-photo-manager></div>
          </div>
          <div class="card">
            <h3>Availability windows</h3>
            <div data-availability-list></div>
            <form data-availability-form style="margin-top:12px">
              <div class="form-row">
                <div class="field"><label for="av-start">From</label><input id="av-start" name="startDate" type="date" required></div>
                <div class="field"><label for="av-end">To</label><input id="av-end" name="endDate" type="date" required></div>
              </div>
              <div class="field"><label for="av-note">Note (optional)</label><input id="av-note" name="note" type="text" maxlength="90" placeholder="e.g. Pickup evenings only"></div>
              <button class="btn btn-ghost btn-sm" type="submit">Add window</button>
            </form>
          </div>`
            : `
          <div class="card">
            <h3>What happens next?</h3>
            <p style="color:var(--muted)">Save the draft, then add photos and availability windows. Publish when it looks good — renters browse instantly.</p>
            <p style="color:var(--muted)">When requests arrive, a one-time fee per listing unlocks renter conversations.</p>
          </div>`}
        </div>
      </div>
    </div>
  `;

  const form = rootEl.querySelector("[data-editor-form]");
  const errorEl = form.querySelector("[data-error]");
  const pinPicker = renderPinPicker(rootEl.querySelector("[data-pin-map]"), {
    lat: listing?.lat,
    lng: listing?.lng,
  });

  function collectFields() {
    const price = Number(form.pricePerDay.value);
    const position = pinPicker.getPosition();
    return {
      title: form.title.value.trim(),
      robot_model: form.robotModel.value.trim(),
      summary: form.summary.value.trim(),
      description: form.description.value.trim(),
      skills: parseListText(form.skills.value),
      tasks: parseListText(form.tasks.value),
      price_per_day: Number.isFinite(price) && price >= 0 ? Math.round(price) : 0,
      support_level: form.supportLevel.value,
      location_name: form.locationName.value.trim(),
      lat: position.lat,
      lng: position.lng,
    };
  }

  function validate(fields) {
    if (!fields.title) return "Give the listing a title.";
    if (!Number.isFinite(Number(form.pricePerDay.value)) || Number(form.pricePerDay.value) <= 0) {
      return "Set a daily price above 0 kr.";
    }
    return "";
  }

  async function save(statusOverride) {
    const fields = collectFields();
    const problem = validate(fields);
    if (problem) {
      errorEl.textContent = problem;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    const saveBtn = form.querySelector("[data-save]");
    saveBtn.disabled = true;
    try {
      if (isEdit) {
        const payload = statusOverride ? { ...fields, status: statusOverride } : fields;
        await updateListing(listing.id, payload);
        toast(statusOverride === "published" ? "Listing published!" : "Changes saved.", "success");
        if (onSaved) onSaved();
        navigate("/owner");
      } else {
        const created = await createListing(currentUserId(), { ...fields, status: "draft" });
        toast("Draft saved — now add photos and availability.", "success");
        if (onSaved) onSaved();
        navigate("/owner/edit/" + created.id);
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      saveBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    save();
  });
  const publishBtn = form.querySelector("[data-publish]");
  if (publishBtn) publishBtn.addEventListener("click", () => save("published"));
  const unpublishBtn = form.querySelector("[data-unpublish]");
  if (unpublishBtn) unpublishBtn.addEventListener("click", () => save("draft"));

  const deleteBtn = form.querySelector("[data-delete]");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!window.confirm("Delete this listing? Requests and photos attached to it are removed too.")) return;
      deleteBtn.disabled = true;
      try {
        await deleteListing(listing.id);
        toast("Listing deleted.");
        if (onSaved) onSaved();
        navigate("/owner");
      } catch (err) {
        toast(err.message, "error");
        deleteBtn.disabled = false;
      }
    });
  }

  // AI draft assist (server-side; never exposes provider details).
  rootEl.querySelector("[data-ai-draft]").addEventListener("click", async () => {
    showAppLoader("Drafting your listing copy…");
    try {
      const draft = await callAppApi("ai-listing-draft", {
        title: form.title.value.trim(),
        robot_model: form.robotModel.value.trim(),
        skills: parseListText(form.skills.value),
        location_name: form.locationName.value.trim(),
      });
      if (draft.summary && !form.summary.value.trim()) form.summary.value = draft.summary;
      else if (draft.summary) form.summary.value = draft.summary;
      if (draft.description) form.description.value = draft.description;
      if (Array.isArray(draft.skills) && draft.skills.length && !form.skills.value.trim()) {
        form.skills.value = draft.skills.join(", ");
      }
      toast("Draft ready — tweak it to sound like you.", "success");
    } catch (err) {
      if (err.code === "setup_required") {
        toast("The writing assistant isn't set up yet — write your own copy for now.", "error");
      } else {
        toast(err.message, "error");
      }
    } finally {
      hideAppLoader();
    }
  });

  if (isEdit) {
    renderPhotoManager(rootEl.querySelector("[data-photo-manager]"), listing);
    renderAvailabilityEditor(rootEl, listing);
  }
}

function renderPhotoManager(el, listing) {
  const photos = listing.photos || [];
  el.innerHTML =
    photos
      .map(
        (photo) => `
        <div class="photo-tile">
          <img src="${escapeHtml(photoPublicUrl(photo.storage_path))}" alt="Listing photo">
          <button class="photo-remove" type="button" data-remove-photo="${escapeHtml(photo.id)}" data-path="${escapeHtml(photo.storage_path)}" aria-label="Remove photo">×</button>
        </div>`
      )
      .join("") +
    `<label class="photo-upload-tile">
      <input type="file" accept="image/*" class="visually-hidden" data-photo-input>
      <span aria-hidden="true" style="font-size:1.4rem">+</span><span>Add photo</span>
    </label>`;

  el.querySelector("[data-photo-input]").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    showAppLoader("Uploading photo…");
    try {
      const path = await uploadListingPhoto(currentUserId(), listing.id, file);
      const record = await addPhotoRecord(listing.id, path, (listing.photos || []).length);
      listing.photos = [...(listing.photos || []), record];
      renderPhotoManager(el, listing);
      toast("Photo added.", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      hideAppLoader();
    }
  });

  el.querySelectorAll("[data-remove-photo]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await removePhotoRecord(btn.dataset.removePhoto);
        await removeListingPhoto(btn.dataset.path).catch(() => {});
        listing.photos = (listing.photos || []).filter((p) => p.id !== btn.dataset.removePhoto);
        renderPhotoManager(el, listing);
        toast("Photo removed.");
      } catch (err) {
        toast(err.message, "error");
        btn.disabled = false;
      }
    });
  });
}

function renderAvailabilityEditor(rootEl, listing) {
  const listEl = rootEl.querySelector("[data-availability-list]");
  const formEl = rootEl.querySelector("[data-availability-form]");

  function renderList() {
    const windows = listing.availability || [];
    listEl.innerHTML = windows.length
      ? '<ul class="availability-list">' +
        windows
          .map(
            (win) =>
              "<li><span>" + formatDate(win.start_date) + " – " + formatDate(win.end_date) +
              (win.note ? ' <span class="note">(' + escapeHtml(win.note) + ")</span>" : "") +
              '</span><button class="btn btn-ghost btn-sm" type="button" data-remove-window="' + escapeHtml(win.id) + '">Remove</button></li>'
          )
          .join("") +
        "</ul>"
      : '<p style="color:var(--muted);font-size:0.9rem;margin:0">No windows yet — renters see "send a request with your dates".</p>';

    listEl.querySelectorAll("[data-remove-window]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await removeAvailability(btn.dataset.removeWindow);
          listing.availability = (listing.availability || []).filter((w) => w.id !== btn.dataset.removeWindow);
          renderList();
        } catch (err) {
          toast(err.message, "error");
          btn.disabled = false;
        }
      });
    });
  }

  renderList();

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const startDate = formEl.startDate.value;
    const endDate = formEl.endDate.value;
    if (!startDate || !endDate || endDate < startDate) {
      toast("Pick a valid window (end date after start date).", "error");
      return;
    }
    const btn = formEl.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const window_ = await addAvailability(listing.id, startDate, endDate, formEl.note.value.trim());
      listing.availability = [...(listing.availability || []), window_].sort((a, b) =>
        String(a.start_date).localeCompare(String(b.start_date))
      );
      formEl.reset();
      renderList();
      toast("Availability window added.", "success");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });
}
