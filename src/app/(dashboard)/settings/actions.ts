"use server";

import { checkConnections } from "@/lib/integrations/healthcheck";

/** Operator-initiated live connection test. Gated by the app login (page route). */
export async function testConnectionsAction() {
  return checkConnections();
}
