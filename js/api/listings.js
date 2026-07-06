// Listing data access: marketplace reads, listing detail, and owner CRUD for
// listings, photos, and availability via the schema-scoped Supabase client.

import { sb } from "../supabaseClient.js";

function requireClient() {
  if (!sb) throw new Error("Listings are unavailable in this preview.");
  return sb;
}

function normalizeListing(row) {
  return {
    ...row,
    skills: Array.isArray(row.skills) ? row.skills : [],
    tasks: Array.isArray(row.tasks) ? row.tasks : [],
    photos: (row.listing_photos || [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  };
}

export async function fetchPublishedListings(filters = {}) {
  const client = requireClient();
  let query = client
    .from("listings")
    .select("*, listing_photos(id, storage_path, sort_order)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (filters.search) {
    const term = "%" + filters.search.replace(/[%_]/g, "") + "%";
    query = query.or(
      "title.ilike." + term + ",summary.ilike." + term + ",location_name.ilike." + term
    );
  }
  const maxPrice = Number(filters.maxPrice);
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    query = query.lte("price_per_day", maxPrice);
  }
  if (filters.supportLevel) {
    query = query.eq("support_level", filters.supportLevel);
  }

  const { data, error } = await query;
  if (error) throw new Error("Could not load robots right now.");
  return (data || []).map(normalizeListing);
}

export async function fetchListingDetail(id) {
  const client = requireClient();
  const { data, error } = await client
    .from("listings")
    .select("*, listing_photos(id, storage_path, sort_order), listing_availability(id, start_date, end_date, note)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load this robot right now.");
  if (!data) return null;

  const listing = normalizeListing(data);
  listing.availability = (data.listing_availability || [])
    .slice()
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  const { data: ownerProfile } = await client
    .from("profiles")
    .select("display_name")
    .eq("user_id", data.owner_id)
    .maybeSingle();
  listing.ownerName = ownerProfile?.display_name || "BotShare owner";
  return listing;
}

export async function fetchOwnerListings(ownerId) {
  const client = requireClient();
  const { data, error } = await client
    .from("listings")
    .select("*, listing_photos(id, storage_path, sort_order)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your listings.");
  return (data || []).map(normalizeListing);
}

export async function createListing(ownerId, fields) {
  const client = requireClient();
  const { data, error } = await client
    .from("listings")
    .insert({ owner_id: ownerId, ...fields })
    .select("*")
    .single();
  if (error) throw new Error("Could not create the listing. Please try again.");
  return data;
}

export async function updateListing(id, fields) {
  const client = requireClient();
  const { data, error } = await client
    .from("listings")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error("Could not save the listing. Please try again.");
  return data;
}

export async function deleteListing(id) {
  const client = requireClient();
  const { error } = await client.from("listings").delete().eq("id", id);
  if (error) throw new Error("Could not delete the listing.");
}

// ---- Photos (records; binary upload lives in api/storage.js) ----

export async function addPhotoRecord(listingId, storagePath, sortOrder) {
  const client = requireClient();
  const { data, error } = await client
    .from("listing_photos")
    .insert({ listing_id: listingId, storage_path: storagePath, sort_order: sortOrder ?? 0 })
    .select("id, storage_path, sort_order")
    .single();
  if (error) throw new Error("The photo uploaded but could not be attached. Try again.");
  return data;
}

export async function removePhotoRecord(photoId) {
  const client = requireClient();
  const { error } = await client.from("listing_photos").delete().eq("id", photoId);
  if (error) throw new Error("Could not remove the photo.");
}

// ---- Availability ----

export async function fetchAvailability(listingId) {
  const client = requireClient();
  const { data, error } = await client
    .from("listing_availability")
    .select("id, start_date, end_date, note")
    .eq("listing_id", listingId)
    .order("start_date", { ascending: true });
  if (error) throw new Error("Could not load availability.");
  return data || [];
}

export async function addAvailability(listingId, startDate, endDate, note) {
  const client = requireClient();
  const { data, error } = await client
    .from("listing_availability")
    .insert({ listing_id: listingId, start_date: startDate, end_date: endDate, note: note || "" })
    .select("id, start_date, end_date, note")
    .single();
  if (error) throw new Error("Could not add that availability window.");
  return data;
}

export async function removeAvailability(availabilityId) {
  const client = requireClient();
  const { error } = await client
    .from("listing_availability")
    .delete()
    .eq("id", availabilityId);
  if (error) throw new Error("Could not remove that availability window.");
}
