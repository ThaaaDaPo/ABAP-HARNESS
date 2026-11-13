// Verbindet Aufgaben, Agenten-Laufzeit, Datenbank und Live-Anzeige.
// Hier steht der Ablauf "Nachricht schicken → Agent arbeitet → Ereignisse speichern und anzeigen".
import type { Ereignis } from "../../gemeinsam/typen.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { sollGespeichertWerden, speichereEreignis } from "../datenbank/ereignisse.ts";
import type { Einstellungen } from "../einstellungen.ts";
import type { AgentenLaufzeit, AgentenSitzung, SitzungsEinstellungen } from "../laufzeit/laufzeit.ts";
import { verteile } from "./live-verteiler.ts";

const neuerTitel = "Neuer Chat";

export class ChatDienst {
  private db: Datenbank;
  private laufzeit: AgentenLaufzeit;
  private einstellungen: Einstellungen;
  /** Offene Sitzungen im Speicher, je Aufgabe. */
  private sitzungen = new Map<string, AgentenSitzung>();

  constructor(db: Datenbank, laufzeit: AgentenLaufzeit, einstellungen: Einstellungen) {
    this.db = db;
    this.laufzeit = laufzeit;
    this.einstellungen = einstellungen;
  }

  neueAufgabe(): aufgaben.AufgabeIntern {
    return aufgaben.legeAufgabeAn(this.db, neuerTitel);
  }

  /**
   * Nimmt die Nachricht an und lässt den Agenten im Hintergrund arbeiten.
   * Kehrt sofort zurück; was der Agent tut, kommt über die Live-Anzeige.
   */
  nimmNachrichtAn(aufgabeId: string, text: string): void {
    const aufgabe = aufgaben.holeAufgabe(this.db, aufgabeId);
    if (!aufgabe) throw new Fehler(404, "Aufgabe nicht gefunden");
    if (aufgabe.status === "arbeitet") throw new Fehler(409, "Der Agent arbeitet noch. Bitte warten oder abbrechen.");

    if (aufgabe.titel === neuerTitel) {
      aufgaben.setzeTitel(this.db, aufgabeId, text.replace(/\s+/g, " ").trim().slice(0, 60));
    }
    this.melde(aufgabeId, { art: "nutzer_nachricht", text });
    this.setzeStatus(aufgabeId, "arbeitet");

    this.lasseAgentArbeiten(aufgabe, text)
      .catch((fehler) => this.melde(aufgabeId, { art: "fehler", meldung: String(fehler?.message ?? fehler) }))
      .finally(() => this.setzeStatus(aufgabeId, "bereit"));
  }

  async brecheAb(aufgabeId: string): Promise<void> {
    await this.sitzungen.get(aufgabeId)?.abbrechen();
  }

  async beenden(): Promise<void> {
    for (const sitzung of this.sitzungen.values()) await sitzung.trennen().catch(() => {});
    await this.laufzeit.beenden();
  }

  private async lasseAgentArbeiten(aufgabe: aufgaben.AufgabeIntern, text: string): Promise<void> {
    const sitzung = await this.holeSitzung(aufgabe);
    await sitzung.sende(text);
  }

  /** Nimmt die offene Sitzung, setzt eine gespeicherte fort oder startet eine neue. */
  private async holeSitzung(aufgabe: aufgaben.AufgabeIntern): Promise<AgentenSitzung> {
    const offen = this.sitzungen.get(aufgabe.id);
    if (offen) return offen;

    const empfaenger = (ereignis: Ereignis) => this.melde(aufgabe.id, ereignis);
    const sitzung = aufgabe.sitzungId
      ? await this.laufzeit.setzeFort(aufgabe.sitzungId, this.sitzungsEinstellungen(), empfaenger)
      : await this.laufzeit.starte(this.sitzungsEinstellungen(), empfaenger);

    aufgaben.setzeSitzungId(this.db, aufgabe.id, sitzung.id);
    this.sitzungen.set(aufgabe.id, sitzung);
    return sitzung;
  }

  private sitzungsEinstellungen(): SitzungsEinstellungen {
    return {
      auftrag: this.einstellungen.agent.auftrag,
      modell: this.einstellungen.modell,
      workspaceOrdner: this.einstellungen.workspaceOrdner,
    };
  }

  private setzeStatus(aufgabeId: string, status: "bereit" | "arbeitet"): void {
    aufgaben.setzeStatus(this.db, aufgabeId, status);
    this.melde(aufgabeId, { art: "status", status });
  }

  /** Speichert das Ereignis (wenn nötig) und zeigt es live an. */
  private melde(aufgabeId: string, ereignis: Ereignis): void {
    if (sollGespeichertWerden(ereignis)) speichereEreignis(this.db, aufgabeId, ereignis);
    verteile(aufgabeId, ereignis);
  }
}

/** Fehler mit HTTP-Statuscode, damit die Routen die passende Antwort schicken können. */
export class Fehler extends Error {
  status: number;
  constructor(status: number, meldung: string) {
    super(meldung);
    this.status = status;
  }
}
