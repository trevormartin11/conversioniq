/**
 * Session — who is acting. The hub is gated by a single shared team password
 * (no individual logins), so every action is attributed to one operator identity.
 * If per-user identity is ever needed, replace getCurrentUser() with a real
 * session lookup; the rest of the app calls this one function and won't change.
 */
import { ensureData, getUsers } from "@/lib/data/store";
import type { User } from "@/lib/data/types";

// Fallback identity so a fresh LIVE deploy with an empty `users` table doesn't crash every action
// (getUsers()[0] would be undefined → `user.name` throws across ~15 call sites). Attribution falls
// back to a generic operator until a real users row exists.
const FALLBACK_OPERATOR: User = { id: "u_operator", name: "Operator", email: "", role: "owner", avatarColor: "#6366f1" };

export async function getCurrentUser(): Promise<User> {
  await ensureData();
  return getUsers()[0] ?? FALLBACK_OPERATOR; // single shared-password gate → the primary operator
}

export function listPartners(): User[] {
  return getUsers();
}
