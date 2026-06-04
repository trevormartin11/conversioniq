"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCost, deleteCost, ensureData } from "@/lib/data/store";
import type { CostCadence, CostCategory } from "@/lib/data/types";

export async function createCostAction(input: {
  category: CostCategory;
  vendor: string;
  description: string;
  amount: number;
  cadence: CostCadence;
  note: string;
}) {
  await ensureData();
  const user = await getCurrentUser();
  if (!input.vendor.trim()) return { ok: false, error: "Vendor is required." };
  const amt = Number(input.amount);
  if (!Number.isFinite(amt) || amt < 0) return { ok: false, error: "Enter a valid amount." };
  await addCost(
    {
      category: input.category,
      vendor: input.vendor.trim(),
      description: input.description.trim(),
      amount: Number(input.amount),
      cadence: input.cadence,
      status: "active",
      nextChargeAt: null,
      note: input.note.trim() || null,
    },
    user.name,
  );
  revalidatePath("/costs");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteCostAction(id: string) {
  await ensureData();
  const user = await getCurrentUser();
  await deleteCost(id, user.name);
  revalidatePath("/costs");
  return { ok: true };
}
