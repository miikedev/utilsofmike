import { supabase } from "./supabase";

/**
 * Ensures there's an authenticated (anonymous) session and returns the
 * current session's user. Does NOT create a profile row — that happens
 * once the user confirms their generated username (see finalizeProfile).
 */
export async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

/** Fetches the caller's profile row, or null if not created yet. */
export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Creates the profile row for the current session using the chosen username. */
export async function finalizeProfile(username) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No active session");

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: user.id, username })
    .select()
    .single();

  if (error) throw error;
  return data;
}
