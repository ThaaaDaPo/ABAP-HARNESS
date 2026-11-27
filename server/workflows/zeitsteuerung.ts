// Startet Workflows nach ihrem Zeitplan. Läuft nur, solange die App läuft (E-07).
// Verpasste Zeitpunkte werden verworfen, nicht nachgeholt (E-70): War der Rechner aus oder im
// Ruhezustand, startet der Workflow erst zum nächsten regulären Zeitpunkt – das spart Credits.
import type { Zeitplan } from "../../gemeinsam/typen.ts";

/** So oft wird nachgesehen */
const takt = 30_000;
/** Liegt ein Zeitpunkt länger zurück (Ruhezustand), gilt er als verpasst */
export const toleranz = 5 * 60_000;

/**
 * Uhrzeit-Plan: Liegt ein geplanter Zeitpunkt zwischen der letzten Prüfung (ausschließlich) und jetzt
 * (einschließlich) – und höchstens `toleranz` zurück?
 */
export function uhrzeitFaellig(plan: Extract<Zeitplan, { art: "uhrzeit" }>, letztePruefung: Date, jetzt: Date): boolean {
  const [stunde, minute] = plan.uhrzeit.split(":").map(Number);
  // Der Zeitpunkt kann am Tag der letzten Prüfung oder heute liegen (Prüfung kurz vor Mitternacht)
  for (const tag of [letztePruefung, jetzt]) {
    const zeitpunkt = new Date(tag);
    zeitpunkt.setHours(stunde, minute, 0, 0);
    const imFenster = zeitpunkt > letztePruefung && zeitpunkt <= jetzt;
    if (imFenster && plan.wochentage.includes(zeitpunkt.getDay()) && jetzt.getTime() - zeitpunkt.getTime() <= toleranz) return true;
  }
  return false;
}

export interface ZeitsteuerungsQuelle {
  /** Workflows mit Zeitplan */
  geplante(): { id: string; zeitplan: Zeitplan }[];
  /** Läuft von diesem Workflow noch ein zeitgesteuerter Lauf? Dann wird nicht noch einer gestartet. */
  laeuftNoch(id: string): boolean;
  starte(id: string): void;
  /** Für Meldungen in der Konsole (z. B. Start abgelehnt) */
  protokolliere(text: string): void;
}

export class Zeitsteuerung {
  private quelle: ZeitsteuerungsQuelle;
  private letztePruefung: Date;
  /** Je Workflow mit Intervall: wann er das nächste Mal dran ist */
  private naechsterIntervall = new Map<string, number>();
  private uhr: NodeJS.Timeout | null = null;

  constructor(quelle: ZeitsteuerungsQuelle, jetzt = new Date()) {
    this.quelle = quelle;
    // Alles vor dem Start der App ist verpasst.
    this.letztePruefung = jetzt;
  }

  starte(): void {
    this.uhr = setInterval(() => this.pruefe(), takt);
    this.uhr.unref();
  }

  beende(): void {
    if (this.uhr) clearInterval(this.uhr);
  }

  /** Ein Takt. Öffentlich, damit Tests eine Uhrzeit vorgeben können. */
  pruefe(jetzt = new Date()): void {
    const geplant = this.quelle.geplante();
    for (const { id, zeitplan } of geplant) {
      if (this.istFaellig(id, zeitplan, jetzt)) this.starteWennFrei(id);
    }
    // Gelöschte oder umgestellte Workflows vergessen
    for (const id of this.naechsterIntervall.keys()) {
      if (!geplant.some((g) => g.id === id && g.zeitplan.art === "intervall")) this.naechsterIntervall.delete(id);
    }
    this.letztePruefung = jetzt;
  }

  private istFaellig(id: string, zeitplan: Zeitplan, jetzt: Date): boolean {
    if (zeitplan.art === "uhrzeit") return uhrzeitFaellig(zeitplan, this.letztePruefung, jetzt);

    const abstand = zeitplan.minuten * 60_000;
    const naechster = this.naechsterIntervall.get(id);
    // Neu (App gestartet oder Zeitplan gerade eingetragen): das erste Mal nach einem vollen Intervall
    if (naechster === undefined) {
      this.naechsterIntervall.set(id, jetzt.getTime() + abstand);
      return false;
    }
    if (jetzt.getTime() < naechster) return false;
    this.naechsterIntervall.set(id, jetzt.getTime() + abstand);
    return jetzt.getTime() - naechster <= toleranz;
  }

  private starteWennFrei(id: string): void {
    if (this.quelle.laeuftNoch(id)) {
      this.quelle.protokolliere(`Zeitplan: ${id} läuft noch vom letzten Mal, dieser Start entfällt.`);
      return;
    }
    try {
      this.quelle.starte(id);
    } catch (fehler) {
      this.quelle.protokolliere(`Zeitplan: ${id} ließ sich nicht starten: ${(fehler as Error).message}`);
    }
  }
}
