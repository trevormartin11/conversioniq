const { chromium } = require("playwright");

// Reads the auth secret from env so no secret is committed:
//   set -a; . ./.env.local; set +a; node scripts/shoot.cjs
const COOKIES = [
  { name: "ciq_auth", value: process.env.AUTH_SECRET || "", domain: "localhost", path: "/" },
  { name: "ciq_user", value: "u_trevor", domain: "localhost", path: "/" },
];
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();

  // Desktop
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addCookies(COOKIES);
  const page = await ctx.newPage();
  const pages = [["/", "home"], ["/replies", "replies"], ["/campaigns", "campaigns"], ["/copy", "copy"], ["/deliverability", "deliverability"]];
  for (const [url, name] of pages) {
    await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `/tmp/shot-${name}.png` });
    console.log("shot", name);
  }

  // Login (no auth)
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const lp = await anon.newPage();
  await lp.goto(BASE + "/login", { waitUntil: "networkidle" }).catch(() => {});
  await lp.waitForTimeout(800);
  await lp.screenshot({ path: "/tmp/shot-login.png" });
  console.log("shot login");

  // Mobile home
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await m.addCookies(COOKIES);
  const mp = await m.newPage();
  await mp.goto(BASE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await mp.waitForTimeout(1200);
  await mp.screenshot({ path: "/tmp/shot-mobile.png" });
  console.log("shot mobile");

  await browser.close();
})();
