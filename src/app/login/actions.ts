"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const MONTH = 60 * 60 * 24 * 30;

export async function loginAction(password: string) {
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return { ok: false, error: "Incorrect password." };
  }
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set("ciq_auth", process.env.AUTH_SECRET ?? "ok", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: MONTH });
  return { ok: true };
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete("ciq_auth");
  redirect("/login");
}
