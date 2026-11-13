// Sammelt Ergebnisse und gibt sie fotografierbar (Konsole) und als Bericht (Text, HTML mit QR-Codes) aus.
import fs from "node:fs";
import path from "node:path";

export class Uebersprungen extends Error {}

/** Kurzform eines Fehlers fuer die Ergebniszeile. Niemals Cookie-Werte ausgeben. */
export function fehlerKurz(e) {
  const name = e?.name && e.name !== "Error" ? `${e.name}: ` : "";
  const status = e?.status ?? e?.response?.status ?? e?.code;
  const text = String(e?.message ?? e).replace(/\s+/g, " ").trim();
  return `${name}${status ? `[${status}] ` : ""}${text}`.slice(0, 220);
}

function fehlerLang(e) {
  const zeilen = [];
  let aktuell = e;
  for (let tiefe = 0; aktuell && tiefe < 4; tiefe++) {
    const stack = String(aktuell?.stack ?? aktuell).split("\n").slice(0, 6).join("\n");
    zeilen.push(tiefe === 0 ? stack : `Ursache: ${stack}`);
    aktuell = aktuell?.cause;
  }
  return zeilen.join("\n");
}

export class Bericht {
  constructor() {
    this.eintraege = [];
    this.start = new Date();
  }

  /**
   * Fuehrt einen Pruefschritt aus. `fn` liefert einen kurzen Detailtext oder
   * { kurz, lang }. Wirft sie, ist der Schritt fehlgeschlagen.
   * Rueckgabe: true bei Erfolg.
   */
  async schritt(id, titel, fn, { voraussetzung = true } = {}) {
    const eintrag = { id, titel, status: "OK", kurz: "", lang: "" };
    this.eintraege.push(eintrag);
    if (!voraussetzung) {
      eintrag.status = "AUSGELASSEN";
      eintrag.kurz = "Voraussetzung fehlgeschlagen";
    } else {
      try {
        const ergebnis = await fn();
        if (typeof ergebnis === "string") eintrag.kurz = ergebnis;
        else if (ergebnis) {
          eintrag.kurz = ergebnis.kurz ?? "";
          eintrag.lang = ergebnis.lang ?? "";
          if (ergebnis.warnung) eintrag.status = "WARNUNG";
        }
      } catch (e) {
        if (e instanceof Uebersprungen) {
          eintrag.status = "AUSGELASSEN";
          eintrag.kurz = e.message;
        } else {
          eintrag.status = "FEHLER";
          eintrag.kurz = fehlerKurz(e);
          eintrag.lang = fehlerLang(e);
        }
      }
    }
    console.log(this.zeile(eintrag));
    return eintrag.status === "OK" || eintrag.status === "WARNUNG";
  }

  zeile(e) {
    const status = e.status.padEnd(11);
    return `${e.id.padEnd(4)} ${status} ${e.titel}${e.kurz ? ` | ${e.kurz}` : ""}`;
  }

  zusammenfassung() {
    const zaehle = (s) => this.eintraege.filter((e) => e.status === s).length;
    return `OK ${zaehle("OK")}  WARNUNG ${zaehle("WARNUNG")}  FEHLER ${zaehle("FEHLER")}  AUSGELASSEN ${zaehle("AUSGELASSEN")}`;
  }

  text() {
    const kopf = [
      `ABAP-HARNESS Pruefpaket 0.1.0  ${this.start.toISOString()}`,
      `node ${process.version}  ${process.platform}-${process.arch}`,
      this.zusammenfassung(),
      "",
    ];
    const zeilen = this.eintraege.map((e) => this.zeile(e));
    const details = this.eintraege
      .filter((e) => e.lang)
      .map((e) => `\n--- ${e.id} ${e.titel}\n${e.lang}`);
    return [...kopf, ...zeilen, ...details].join("\n");
  }

  /** Schreibt bericht.txt und bericht.html (mit QR-Codes) und gibt die Pfade zurueck. */
  async schreibe(ordner) {
    fs.mkdirSync(ordner, { recursive: true });
    const text = this.text();
    const txtPfad = path.join(ordner, "bericht.txt");
    fs.writeFileSync(txtPfad, text, "utf8");

    let htmlPfad = null;
    try {
      const QR = (await import("qrcode")).default;
      const teile = [];
      const groesse = 700;
      for (let i = 0; i < text.length; i += groesse) teile.push(text.slice(i, i + groesse));
      const bilder = [];
      for (let i = 0; i < teile.length; i++) {
        const kopf = `[${i + 1}/${teile.length}]\n`;
        const svg = await QR.toString(kopf + teile[i], { type: "svg", errorCorrectionLevel: "L", margin: 2 });
        bilder.push(`<figure><figcaption>Teil ${i + 1} von ${teile.length}</figcaption>${svg}</figure>`);
      }
      const maskiert = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Pruefbericht</title>
<style>body{font-family:Segoe UI,sans-serif;margin:24px;background:#fff;color:#111}
pre{background:#f3f3f3;padding:12px;white-space:pre-wrap;font-size:13px}
figure{display:inline-block;width:420px;margin:12px;text-align:center}figure svg{width:100%;height:auto}</style></head>
<body><h1>Pruefbericht ABAP-HARNESS</h1><p>${this.zusammenfassung()}</p>
<p>Die QR-Codes enthalten denselben Text wie unten. Der Reihe nach scannen, einen nach dem anderen.</p>
${bilder.join("\n")}<h2>Text</h2><pre>${maskiert}</pre></body></html>`;
      htmlPfad = path.join(ordner, "bericht.html");
      fs.writeFileSync(htmlPfad, html, "utf8");
    } catch (e) {
      console.log(`(QR-Bericht nicht erzeugt: ${fehlerKurz(e)})`);
    }
    return { txtPfad, htmlPfad };
  }
}
