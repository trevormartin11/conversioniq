import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingTemplate } from "@/components/landing/landing-template";
import { ensureData, getLandingByHost } from "@/lib/data/store";
import { normalizeHost } from "@/lib/landing/publish";

/**
 * PUBLIC landing-page renderer. Prospects land here via the middleware Host rewrite
 * (go.<sending-domain> → /lp/<host>); only PUBLISHED pages resolve — drafts 404.
 * Operators can also preview any published page at /lp/<host> inside the app.
 */
export const dynamic = "force-dynamic";

async function pageFor(rawHost: string) {
  await ensureData();
  return getLandingByHost(normalizeHost(decodeURIComponent(rawHost)));
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }): Promise<Metadata> {
  const { host } = await params;
  const page = await pageFor(host);
  if (!page) return { title: "Not found" };
  return {
    title: page.content.seoTitle,
    description: page.content.seoDescription,
    robots: { index: true, follow: true },
  };
}

export default async function PublicLandingPage({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const page = await pageFor(host);
  if (!page) notFound();
  return <LandingTemplate content={page.content} schedulerUrl={page.schedulerUrl} videoUrl={page.videoUrl} />;
}
