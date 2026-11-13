// Holt das SAP-Anmelde-Cookie ueber den installierten Edge-Browser.
// Gleiches Vorgehen wie get-cookie.js im bestehenden SAP-MCP-Proxy:
// Edge sichtbar starten, SAP-URL aufrufen, auf das SSO-Cookie warten, Cookie-Zeile zurueckgeben.
import fs from "node:fs";

const EDGE_KANDIDATEN = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

export function findeEdge(konfiguriert) {
  const kandidaten = [konfiguriert, ...EDGE_KANDIDATEN].filter(Boolean);
  const gefunden = kandidaten.find((p) => fs.existsSync(p));
  if (!gefunden) throw new Error(`Edge nicht gefunden (geprueft: ${kandidaten.join("; ")})`);
  return gefunden;
}

/**
 * @returns {Promise<{ cookieZeile: string, namen: string[] }>} cookieZeile ist geheim und darf nie ausgegeben werden.
 */
export async function holeCookie({ url, cookieNamen, edgePfad, wartezeitMs = 60000 }) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ executablePath: findeEdge(edgePfad), headless: false });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    const start = Date.now();
    while (Date.now() - start < wartezeitMs) {
      const cookies = await context.cookies();
      if (cookies.some((c) => cookieNamen.includes(c.name))) {
        return {
          cookieZeile: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
          namen: cookies.map((c) => c.name),
        };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    const vorhanden = (await context.cookies()).map((c) => c.name).join(", ") || "keine";
    throw new Error(`Kein Anmelde-Cookie nach ${wartezeitMs / 1000}s (erwartet: ${cookieNamen.join(" oder ")}; vorhanden: ${vorhanden})`);
  } finally {
    await browser.close();
  }
}
