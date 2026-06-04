/**
 * Session — who is acting. In MOCK mode this resolves to a seeded partner
 * (all three have equal powers). When Supabase Auth is wired, replace
 * getCurrentUser() with the real session lookup; the rest of the app calls
 * this one function and won't change.
 */
import { cookies } from "next/headers";
import { getUsers } from "@/lib/data/store";
import type { User } from "@/lib/data/types";

export async function getCurrentUser(): Promise<User> {
  const users = getUsers();
  try {
    const jar = await cookies();
    const id = jar.get("ciq_user")?.value;
    const found = users.find((u) => u.id === id);
    if (found) return found;
  } catch {
    // cookies() unavailable in some contexts — fall through to default
  }
  return users[0];
}

export function listPartners(): User[] {
  return getUsers();
}
