const { chromium } = require("playwright");
const COOKIES = [
  { name: "ciq_auth", value: process.env.AUTH_SECRET || "", domain: "localhost", path: "/" },
  { name: "ciq_user", value: "u_trevor", domain: "localhost", path: "/" },
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 900, height: 1500 }, deviceScaleFactor: 2 });
  await ctx.addCookies(COOKIES);
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000/leads", { waitUntil: "networkidle", timeout: 60000 });

  const section = p.locator("section", { hasText: "Source new leads" }).first();

  // 1) hyperlocal -> Maps lane
  await p.getByPlaceholder(/Med spas, HVAC/i).fill("Med spas");
  await p.getByRole("button", { name: /Plan the run/i }).click();
  await p.waitForTimeout(2500);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: "/tmp/src-maps.png" });
  console.log("maps shot");

  // 2) enterprise -> B2B database lane
  await p.getByPlaceholder(/Med spas, HVAC/i).fill("Logistics firms");
  await p.locator("select").selectOption("enterprise");
  await p.getByRole("button", { name: /Plan the run/i }).click();
  await p.waitForTimeout(2500);
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: "/tmp/src-b2b.png" });
  console.log("b2b shot");
  await b.close();
})();
