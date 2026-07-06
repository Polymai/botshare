// Robot listing photo storage in the public app707_botshare_media bucket.
// Path convention: <owner auth uid>/<listing id>/<file name> — the first
// segment must be the uploader's uid to satisfy storage policies.

import { sb } from "../supabaseClient.js";
import { config } from "../config.js";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function requireClient() {
  if (!sb) throw new Error("Photo uploads are unavailable in this preview.");
  return sb;
}

export function photoPublicUrl(storagePath) {
  if (!storagePath) return "";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;
  if (!sb) return "";
  const { data } = sb.storage.from(config.mediaBucket).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

export async function uploadListingPhoto(ownerId, listingId, file) {
  const client = requireClient();
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Choose an image file (JPG, PNG, or WebP).");
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Photos must be smaller than 8 MB.");
  }
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").slice(-60);
  const path = ownerId + "/" + listingId + "/" + Date.now() + "-" + safeName;
  const { error } = await client.storage
    .from(config.mediaBucket)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw new Error("The photo could not be uploaded. Please try again.");
  return path;
}

export async function listListingPhotos(ownerId, listingId) {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(config.mediaBucket)
    .list(ownerId + "/" + listingId);
  if (error) return [];
  return data || [];
}

export async function removeListingPhoto(storagePath) {
  const client = requireClient();
  const { error } = await client.storage.from(config.mediaBucket).remove([storagePath]);
  if (error) throw new Error("Could not delete the photo file.");
}
