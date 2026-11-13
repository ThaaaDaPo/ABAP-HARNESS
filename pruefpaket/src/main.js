// Einstieg: node src/main.js [alle|umgebung|copilot|sap]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Bericht } from "./bericht.js";
import { pruefeUmgebung } from "./schritte-umgebung.js";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bereich = (process.argv[2] ?? "alle").toLowerCase();
const erlaubt = ["alle", "umgebung", "copilot", "sap"];

if (!erlaubt.includes(bereich)) {
  console.error(`Unbekannter Bereich "${bereich}". Erlaubt: ${erlaubt.join(", ")}`);
  process.exit(2);
}

function ladeConfig() {
  const pfad = path.join(wurzel, "config.json");
  if (!fs.existsSync(pfad)) return { fehlt: true };
  return JSON.parse(fs.readFileSync(pfad, "utf8"));
}

const bericht = new Bericht();
console.log(`ABAP-HARNESS Pruefpaket - Bereich: ${bereich}\n`);

await pruefeUmgebung(bericht);

let config = {};
if (bereich !== "umgebung") {
  await bericht.schritt("K1", "config.json lesen", async () => {
    config = ladeConfig();
    if (config.fehlt) {
      config = {};
      if (bereich === "copilot") return { kurz: "fehlt, fuer Copilot nicht noetig", warnung: true };
      throw new Error("config.json fehlt - config.beispiel.json kopieren und ausfuellen");
    }
    return "gelesen";
  });
}

// Die Module werden erst hier geladen, damit ein fehlendes Paket nur seinen Bereich betrifft.
if (bereich === "alle" || bereich === "copilot") {
  const { pruefeCopilot } = await import("./schritte-copilot.js");
  await pruefeCopilot(bericht, config).catch((e) => bericht.schritt("C0", "Copilot-Pruefung", () => Promise.reject(e)));
}
if (bereich === "alle" || bereich === "sap") {
  const { pruefeSap } = await import("./schritte-sap.js");
  await pruefeSap(bericht, config).catch((e) => bericht.schritt("S0", "SAP-Pruefung", () => Promise.reject(e)));
}

console.log(`\n${bericht.zusammenfassung()}`);
const { txtPfad, htmlPfad } = await bericht.schreibe(path.join(wurzel, "bericht"));
console.log(`Bericht: ${txtPfad}`);
if (htmlPfad) console.log(`Mit QR-Codes: ${htmlPfad} (im Browser oeffnen)`);
process.exit(bericht.eintraege.some((e) => e.status === "FEHLER") ? 1 : 0);
