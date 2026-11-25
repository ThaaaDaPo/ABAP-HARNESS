// Der ADT-MCP holt Konfiguration und SSO-Cookie bei der App. Er läuft als eigener Prozess (Copilot
// startet ihn je Sitzung), die Anmeldung aber gibt es nur einmal: Die App öffnet Edge, hält das
// Cookie im Speicher und gibt es den ADT-MCP-Prozessen auf Anfrage. So geht Edge nicht für jeden
// Chat neu auf, und ein Passwort gibt es nirgends (nur SSO, E-63).
//
// Wo die App erreichbar ist, steht in der Zugangsdatei, die die App bei jedem Start schreibt; ihr
// Pfad kommt als Argument: --zugang <pfad>.
import fs from "node:fs";
import type { AdtLaufzeitKonfiguration } from "../../gemeinsam/typen.ts";

interface Zugang {
  adresse: string;
  schluessel: string;
}

/** Name des Kopfes, der den Schlüssel trägt – die App prüft ihn bei jeder internen Anfrage. */
export const schluesselKopf = "x-harness-schluessel";

export class AppZugang {
  private datei: string;

  constructor(datei: string) {
    this.datei = datei;
  }

  static ausArgumenten(argumente = process.argv): AppZugang {
    const stelle = argumente.indexOf("--zugang");
    const datei = stelle >= 0 ? argumente[stelle + 1] : undefined;
    if (!datei) throw new Error("Der ADT-MCP braucht --zugang <datei>. Er wird von der App eingetragen und gestartet.");
    return new AppZugang(datei);
  }

  async konfiguration(): Promise<AdtLaufzeitKonfiguration> {
    return this.anfrage("GET", "/api/adt/intern/konfiguration");
  }

  /**
   * Das SSO-Cookie. `abgelaufen`: das Cookie, mit dem SAP gerade abgewiesen hat – dann meldet die
   * App neu an (Edge geht auf), außer ein anderer Prozess hat das inzwischen schon getan.
   */
  async cookie(abgelaufen?: string): Promise<string> {
    const { cookie } = await this.anfrage<{ cookie: string }>("POST", "/api/adt/intern/cookie", { abgelaufen: abgelaufen ?? null });
    return cookie;
  }

  private async anfrage<T>(methode: string, pfad: string, inhalt?: unknown): Promise<T> {
    let zugang: Zugang;
    try {
      zugang = JSON.parse(fs.readFileSync(this.datei, "utf8"));
    } catch {
      throw new Error("Die App ist nicht erreichbar (Zugangsdatei fehlt). Läuft ABAP-HARNESS?");
    }
    let antwort: Response;
    try {
      antwort = await fetch(`${zugang.adresse}${pfad}`, {
        method: methode,
        headers: { "Content-Type": "application/json", [schluesselKopf]: zugang.schluessel },
        ...(inhalt === undefined ? {} : { body: JSON.stringify(inhalt) }),
      });
    } catch {
      throw new Error(`Die App ist unter ${zugang.adresse} nicht erreichbar. Läuft ABAP-HARNESS?`);
    }
    const daten = await antwort.json().catch(() => ({}));
    if (!antwort.ok) throw new Error(daten.meldung ?? `Fehler ${antwort.status} von der App`);
    return daten as T;
  }
}
