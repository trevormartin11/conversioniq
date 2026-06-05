const { chromium } = require("playwright");
const COOKIES = [
  { name: "ciq_auth", value: process.env.AUTH_SECRET || "", domain: "localhost", path: "/" },
  { name: "ciq_user", value: "u_trevor", domain: "localhost", path: "/" },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 900, height: 1300 }, deviceScaleFactor: 2 });
  await ctx.addCookies(COOKIES);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/copy", { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForTimeout(13000); // let streamed next-moves resolve
  const moves = p.locator("section", { hasText: "Recommended next moves" }).first();
  await moves.scrollIntoViewIfNeeded();
  await moves.screenshot({ path: "/tmp/moves.png" });
  console.log("moves shot");

  await p.getByRole("button", { name: /Suggest verticals/i }).click();
  await p.waitForTimeout(15000);
  await p.getByText(/Draft copy for this/i).first().click();
  await p.waitForTimeout(16000);
  const launch = p.locator("div.card", { hasText: "Launch setup" }).first();
  await launch.scrollIntoViewIfNeeded();
  await launch.screenshot({ path: "/tmp/launch.png" });
  console.log("launch shot");
  await b.close();
})();
