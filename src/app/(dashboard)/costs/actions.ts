"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { addCost, deleteCost, ensureData } from "@/lib/data/store";
import { aiSpendSummary, type AiSpendSummary } from "@/lib/ai/usage";
import type { CostCadence, CostCategory } from "@/lib/data/types";

/** Live Claude API spend — polled by the meter on the Costs page. Always resolves (never throws). */
export async function getAiSpendAction(): Promise<AiSpendSummary> {
  try {
    return await aiSpendSummary();
  } catch {
    return {
      source: "live",
      available: false,
      monthToDateUsd: 0,
      last24hUsd: 0,
      last7dUsd: 0,
      mtdCalls: 0,
      byPurpose: [],
      byModel: [],
      recent: [],
      lastCallAt: null,
      capped: false,
      asOf: new Date().toISOString(),
    };
  }
}

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
