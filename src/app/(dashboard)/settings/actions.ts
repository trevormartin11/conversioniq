"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/** Dev/demo convenience — switch the acting partner. Replaced by Supabase Auth. */
export async function switchUserAction(id: string) {
  const jar = await cookies();
  jar.set("ciq_user", id, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true };
}
