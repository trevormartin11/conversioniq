const { chromium } = require("playwright");
const COOKIES = [
  { name: "ciq_auth", value: process.env.AUTH_SECRET || "", domain: "localhost", path: "/" },
  { name: "ciq_user", value: "u_trevor", domain: "localhost", path: "/" },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await ctx.addCookies(COOKIES);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/copy", { waitUntil: "networkidle", timeout: 60000 });
  await p.getByRole("button", { name: /Suggest verticals/i }).click();
  await p.waitForTimeout(15000);
  const ideasCard = p.locator("div.card", { hasText: "Where to point the fleet" }).first();
  await ideasCard.scrollIntoViewIfNeeded();
  await ideasCard.screenshot({ path: "/tmp/strat-ideas.png" });
  console.log("ideas shot");
  const draftBtn = p.getByText(/Draft copy for this/i).first();
  await draftBtn.click();
  await p.waitForTimeout(16000);
  const draftCard = p.locator("div.card", { hasText: "Draft the sequence" }).first();
  await draftCard.scrollIntoViewIfNeeded();
  await draftCard.screenshot({ path: "/tmp/strat-draft.png" });
  console.log("draft shot");
  await b.close();
})();
