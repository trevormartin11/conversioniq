/**
 * Session — who is acting. The hub is gated by a single shared team password
 * (no individual logins), so every action is attributed to one operator identity.
 * If per-user identity is ever needed, replace getCurrentUser() with a real
 * session lookup; the rest of the app calls this one function and won't change.
 */
import { ensureData, getUsers } from "@/lib/data/store";
import type { User } from "@/lib/data/types";

export async function getCurrentUser(): Promise<User> {
  await ensureData();
  return getUsers()[0]; // single shared-password gate → the primary operator
}

export function listPartners(): User[] {
  return getUsers();
}
