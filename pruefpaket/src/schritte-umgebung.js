// U-Schritte: Umgebung und Abhaengigkeiten (T0, T5).
import { execFileSync } from "node:child_process";

function versionMindestens(ist, soll) {
  const a = ist.replace(/^v/, "").split(".").map(Number);
  const b = soll.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return true;
}

export async function pruefeUmgebung(bericht) {
  await bericht.schritt("U1", "Node-Version", async () => {
    if (!versionMindestens(process.version, "22.15.0"))
      throw new Error(`${process.version} ist zu alt, noetig ist mindestens 22.15.0`);
    return `${process.version} ${process.platform}-${process.arch}`;
  });

  await bericht.schritt("U2", "npm-Registry", async () => {
    try {
      const befehl = process.platform === "win32" ? "npm.cmd" : "npm";
      const registry = execFileSync(befehl, ["config", "get", "registry"], {
        encoding: "utf8",
        shell: process.platform === "win32",
        timeout: 20000,
      }).trim();
      return new URL(registry).host;
    } catch (e) {
      return { kurz: "nicht ermittelbar", lang: String(e?.message ?? e), warnung: true };
    }
  });

  const pakete = ["@github/copilot-sdk", "abap-adt-api", "playwright-core", "qrcode"];
  let alle = true;
  for (let i = 0; i < pakete.length; i++) {
    const ok = await bericht.schritt(`U${i + 3}`, `Paket ${pakete[i]}`, async () => {
      await import(pakete[i]);
      return "ladbar";
    });
    alle = alle && ok;
  }

  await bericht.schritt("U7", "Copilot-Laufzeit fuer diese Plattform", async () => {
    const name = `@github/copilot-sdk-${process.platform}-${process.arch}`;
    try {
      const { createRequire } = await import("node:module");
      createRequire(import.meta.url).resolve(`${name}/package.json`);
      return name;
    } catch {
      if (process.env.COPILOT_CLI_PATH) return `fehlt, aber COPILOT_CLI_PATH ist gesetzt`;
      throw new Error(`${name} ist nicht installiert (in Nexus vorhanden?)`);
    }
  });

  return alle;
}
