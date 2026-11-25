// SSO-Anmeldung am SAP-System – die einzige Art der Anmeldung (E-63), kein Benutzer, kein Passwort.
// Wie beim SAP-MCP-Proxy (E-38) und im Prüfpaket: Edge sichtbar öffnen, SAP-Adresse aufrufen, warten,
// bis das Anmelde-Cookie da ist. David muss dort ggf. ein Zertifikat anklicken.
//
// Die App macht das genau einmal für alle ADT-MCP-Prozesse (je Copilot-Sitzung einer) und hält das
// Cookie nur im Speicher. Nach einem Neustart der App oder wenn SAP es nicht mehr annimmt, wird neu
// angemeldet – der wartende Tool-Aufruf läuft danach weiter (V-16).
import fs from "node:fs";
import type { AdtAnmeldung, AdtKonfiguration } from "../../gemeinsam/typen.ts";
import { meldeUebersicht } from "../chat/live-verteiler.ts";
import { Fehler } from "../fehler.ts";

const edgeOrte = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

/** Wie lange Edge auf die Anmeldung wartet. Großzügig, weil ggf. ein Zertifikat zu wählen ist. */
const wartezeitMs = 180_000;

export function findeEdge(eingetragen: string): string | null {
  return [eingetragen, ...edgeOrte].filter(Boolean).find((pfad) => fs.existsSync(pfad)) ?? null;
}

/** "SAP_SESSIONID_*" passt auf SAP_SESSIONID_B1E_010 usw. */
export function passtName(name: string, muster: string[]): boolean {
  return muster.some((m) => (m.endsWith("*") ? name.startsWith(m.slice(0, -1)) : name === m));
}

interface Cookie {
  name: string;
  value: string;
}

/**
 * Was der ADT-MCP bekommt. Gibt es ein SSO-Ticket (MYSAPSSO2), reicht das; Sitzungs-Cookies bleiben
 * dann weg, weil mehrere ADT-MCP-Prozesse sonst dieselbe SAP-Sitzung benutzen würden (Sperren!).
 * Ohne Ticket geht es nur mit den Sitzungs-Cookies (Annahme, am Firmenrechner zu prüfen).
 */
export function cookieZeileFuerAdt(cookies: Cookie[]): string {
  const ticket = cookies.some((c) => c.name === "MYSAPSSO2");
  return cookies
    .filter((c) => !ticket || !c.name.startsWith("SAP_SESSIONID_"))
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export class SsoAnmeldung {
  private konfiguration: () => AdtKonfiguration;
  private cookieZeile: string | null = null;
  private laufend: Promise<void> | null = null;
  private stand: AdtAnmeldung = { zustand: "abgemeldet", text: "Noch nicht angemeldet. Das passiert beim ersten Zugriff auf SAP oder per Knopf.", seit: null };

  constructor(konfiguration: () => AdtKonfiguration) {
    this.konfiguration = konfiguration;
  }

  anmeldung(): AdtAnmeldung {
    if (this.konfiguration().gegenstelle === "simulation") {
      return { zustand: "angemeldet", text: "Übungssystem – keine Anmeldung nötig.", seit: null };
    }
    return this.stand;
  }

  /**
   * Das Cookie für den ADT-MCP. `abgelaufen`: damit hat SAP gerade abgewiesen – dann neu anmelden,
   * außer ein anderer Prozess hat das inzwischen schon getan (dann gibt es schon ein neues).
   */
  async cookie(abgelaufen: string | null): Promise<string> {
    if (this.konfiguration().gegenstelle === "simulation") throw new Fehler(409, "Das Übungssystem braucht keine Anmeldung.");
    if (this.cookieZeile && this.cookieZeile !== abgelaufen) return this.cookieZeile;
    await this.anmelden();
    return this.cookieZeile!;
  }

  /** Öffnet Edge zur Anmeldung. Läuft schon eine, wird auf sie gewartet statt ein zweites Fenster zu öffnen. */
  anmelden(): Promise<void> {
    this.laufend ??= this.mitEdge().finally(() => (this.laufend = null));
    return this.laufend;
  }

  /** Cookie vergessen, z. B. nach einer Änderung der Adresse */
  abmelden(text = "Abgemeldet."): void {
    this.cookieZeile = null;
    this.setze({ zustand: "abgemeldet", text, seit: null });
  }

  /** Nach erfolgreichem Verbindungstest: wer angemeldet ist */
  bestaetige(text: string): void {
    if (this.stand.zustand === "angemeldet") this.setze({ ...this.stand, text });
  }

  private setze(stand: AdtAnmeldung): void {
    this.stand = stand;
    meldeUebersicht({ bereich: "adt" });
  }

  private async mitEdge(): Promise<void> {
    const konfiguration = this.konfiguration();
    if (!konfiguration.url) throw new Fehler(409, "Keine SAP-Adresse eingetragen (MCP-Server → ADT).");
    const edge = findeEdge(konfiguration.edgePfad);
    if (!edge) {
      this.setze({ zustand: "fehler", text: "Edge nicht gefunden. Pfad unter MCP-Server → ADT eintragen.", seit: null });
      throw new Fehler(409, "Edge nicht gefunden. Bitte den Pfad zu msedge.exe in der App eintragen (MCP-Server → ADT).");
    }

    this.setze({ zustand: "laeuft", text: "Edge ist offen – bitte dort anmelden (ggf. Zertifikat wählen).", seit: null });
    // playwright-core erst hier laden: wird nur für die Anmeldung gebraucht
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ executablePath: edge, headless: false });
    try {
      const kontext = await browser.newContext();
      const seite = await kontext.newPage();
      await seite.goto(konfiguration.url);
      // Nur Cookies, die das Ziel auch bekommt – nicht die des Anmeldedienstes
      const adtAdresse = `${new URL(konfiguration.url).origin}/sap/bc/adt/`;
      const ende = Date.now() + wartezeitMs;
      while (Date.now() < ende) {
        const cookies = await kontext.cookies(adtAdresse);
        if (cookies.some((c) => passtName(c.name, konfiguration.cookieNamen))) {
          this.cookieZeile = cookieZeileFuerAdt(cookies);
          this.setze({ zustand: "angemeldet", text: "Angemeldet per SSO.", seit: new Date().toISOString() });
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      const vorhanden = (await kontext.cookies(adtAdresse)).map((c) => c.name).join(", ") || "keine";
      throw new Fehler(
        504,
        `Keine Anmeldung nach ${wartezeitMs / 1000} s. Erwartet: ${konfiguration.cookieNamen.join(" oder ")}; vorhanden: ${vorhanden}.`,
      );
    } catch (fehler) {
      this.cookieZeile = null;
      this.setze({ zustand: "fehler", text: (fehler as Error).message, seit: null });
      throw fehler;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
