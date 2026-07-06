// Rental request and conversation data access, backed by RLS:
// participants read their requests; customers always write messages on their
// own requests; owners can reply only after a paid listing unlock.

import { sb, callAppApi } from "../supabaseClient.js";

function requireClient() {
  if (!sb) throw new Error("Rental requests are unavailable in this preview.");
  return sb;
}

// Display names for conversation participants (profiles are public reads).
export async function fetchProfilesMap(userIds) {
  if (!userIds || !userIds.length) return {};
  const client = requireClient();
  const { data, error } = await client
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  if (error) return {};
  const map = {};
  for (const row of data || []) map[row.user_id] = row.display_name;
  return map;
}

export async function createRentalRequest({ listingId, ownerId, customerId, startDate, endDate, message }) {
  const client = requireClient();
  const { data, error } = await client
    .from("rental_requests")
    .insert({
      listing_id: listingId,
      owner_id: ownerId,
      customer_id: customerId,
      start_date: startDate || null,
      end_date: endDate || null,
      message: message || "",
    })
    .select("*")
    .single();
  if (error) throw new Error("Could not send the rental request. Please try again.");

  if (message) {
    await client
      .from("request_messages")
      .insert({ request_id: data.id, sender_id: customerId, body: message });
  }

  // Lead notification email; non-fatal if email is not configured yet.
  callAppApi("notify-request", { request_id: data.id }).catch(() => {});
  return data;
}

export async function fetchCustomerRequests(customerId) {
  const client = requireClient();
  const { data, error } = await client
    .from("rental_requests")
    .select("*, listings(id, title, location_name, price_per_day, currency, status)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load your rental requests.");
  return data || [];
}

export async function fetchOwnerRequests(ownerId) {
  const client = requireClient();
  const { data, error } = await client
    .from("rental_requests")
    .select("*, listings(id, title, location_name)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Could not load incoming requests.");
  return data || [];
}

export async function updateRequestStatus(requestId, status) {
  const client = requireClient();
  const { data, error } = await client
    .from("rental_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("*")
    .single();
  if (error) throw new Error("Could not update the request.");
  return data;
}

export async function fetchMessages(requestId) {
  const client = requireClient();
  const { data, error } = await client
    .from("request_messages")
    .select("id, request_id, sender_id, body, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load the conversation.");
  return data || [];
}

export async function sendMessage(requestId, senderId, body) {
  const client = requireClient();
  const { data, error } = await client
    .from("request_messages")
    .insert({ request_id: requestId, sender_id: senderId, body })
    .select("id, request_id, sender_id, body, created_at")
    .single();
  if (error) {
    throw new Error(
      "The message could not be sent. Owners need an active conversation unlock for this listing to reply."
    );
  }
  return data;
}
