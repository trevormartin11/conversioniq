import type { LandingContent } from "@/lib/data/types";

/** Extract a YouTube embed URL from a watch / youtu.be / embed link. */
function youTubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

/**
 * Fixed, on-brand renderer for a vertical's landing page (mirrors conversioniq.ai:
 * dark #0a0f1f, cyan #15c1ff, crimson #f0264f). Pure server component fed by the generated
 * LandingContent — the same component previews in the hub and (Phase 2) serves the live site.
 */
export function LandingTemplate({
  content,
  schedulerUrl,
  videoUrl,
}: {
  content: LandingContent;
  schedulerUrl?: string | null;
  videoUrl?: string | null;
}) {
  const embed = youTubeEmbed(videoUrl);
  return (
    <div className="min-h-screen bg-[#0a0f1f] text-slate-200 [font-family:Inter,system-ui,sans-serif]">
      {/* nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-white">Conversion<span className="text-[#15c1ff]">IQ</span></span>
        {schedulerUrl && (
          <a href={schedulerUrl} className="rounded-lg bg-[#15c1ff] px-4 py-2 text-sm font-semibold text-[#0a0f1f] transition-opacity hover:opacity-90">{content.hero.primaryCta}</a>
        )}
      </header>

      {/* hero */}
      <section className="mx-auto max-w-4xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#15c1ff]">{content.hero.eyebrow}</p>
        <h1 className="mx-auto mt-4 max-w-3xl bg-gradient-to-br from-white via-white to-[#7dd3fc] bg-clip-text text-4xl font-bold leading-[1.1] text-transparent sm:text-5xl">{content.hero.headline}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">{content.hero.subhead}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {schedulerUrl && <a href={schedulerUrl} className="rounded-lg bg-gradient-to-r from-[#15c1ff] to-[#373299] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#15c1ff]/20 transition-opacity hover:opacity-90">{content.hero.primaryCta}</a>}
          <a href="#video" className="rounded-lg border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-[#15c1ff]/50">{content.hero.secondaryCta}</a>
        </div>
      </section>

      {/* problem */}
      <section className="border-t border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{content.problem.heading}</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-slate-400">{content.problem.body}</p>
          <ul className="mt-6 space-y-3">
            {content.problem.bullets.map((b, i) => (
              <li key={i} className="flex gap-3 text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0264f]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-5 sm:grid-cols-2">
          {content.features.map((f, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <div className="mb-3 h-9 w-9 rounded-lg bg-gradient-to-br from-[#15c1ff] to-[#373299]" />
              <h3 className="text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* video */}
      <section id="video" className="border-y border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto max-w-4xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{content.videoHeading}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">{content.videoCaption}</p>
          <div className="mt-8 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
            {embed ? (
              <iframe src={embed} title="ConversionIQ" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Video coming soon</div>
            )}
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{content.trust.heading}</h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {content.trust.points.map((p, i) => (
            <span key={i} className="text-sm font-medium text-slate-300">{p}</span>
          ))}
        </div>
      </section>

      {/* CTA + scheduler + capture form */}
      <section className="border-t border-white/[0.06] bg-gradient-to-b from-[#0a0f1f] to-[#0d1430]">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-white">{content.cta.heading}</h2>
            <p className="mt-4 leading-relaxed text-slate-400">{content.cta.body}</p>
            {schedulerUrl && (
              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white">
                <iframe src={schedulerUrl} title="Book a demo" className="h-[640px] w-full" />
              </div>
            )}
          </div>
          {/* capture form (submission wired in Phase 2 → hub + Zoho + consent ledger) */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <p className="text-sm text-slate-400">{content.formIntro}</p>
            <form className="mt-4 space-y-3">
              {[
                { label: "Name", type: "text", ph: "Your name" },
                { label: "Email", type: "email", ph: "you@business.com" },
                { label: "Phone", type: "tel", ph: "(555) 555-5555" },
                { label: "Business", type: "text", ph: "Business name" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-xs font-medium text-slate-400">{f.label}</label>
                  <input type={f.type} placeholder={f.ph} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-[#0a0f1f] px-3 text-sm text-slate-200 outline-none focus:border-[#15c1ff]" />
                </div>
              ))}
              <label className="flex items-start gap-2 pt-1 text-[12px] leading-snug text-slate-400">
                <input type="checkbox" className="mt-0.5" />
                <span>I agree to receive texts from ConversionIQ at the number provided about my inquiry. Msg &amp; data rates may apply; reply STOP to opt out.</span>
              </label>
              <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-[#f0264f] to-[#c91e40] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90">{content.cta.bookCta}</button>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} ConversionIQ · AI sales agents for SMS &amp; social
      </footer>
    </div>
  );
}
