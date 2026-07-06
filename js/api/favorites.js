// Customer favorites CRUD.

import { sb } from "../supabaseClient.js";

function requireClient() {
  if (!sb) throw new Error("Favorites are unavailable in this preview.");
  return sb;
}

export async function fetchFavorites(customerId) {
  const client = requireClient();
  const { data, error } = await client
    .from("favorites")
    .select("id, listing_id, created_at, listings(id, title, summary, location_name, price_per_day, currency, status, listing_photos(storage_path, sort_order))")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your favorites.");
  return data || [];
}

export async function addFavorite(customerId, listingId) {
  const client = requireClient();
  const { data, error } = await client
    .from("favorites")
    .insert({ customer_id: customerId, listing_id: listingId })
    .select("id, listing_id, created_at")
    .single();
  if (error) throw new Error("Could not save this robot to your favorites.");
  return data;
}

export async function removeFavorite(favoriteId) {
  const client = requireClient();
  const { error } = await client.from("favorites").delete().eq("id", favoriteId);
  if (error) throw new Error("Could not remove the favorite.");
}
