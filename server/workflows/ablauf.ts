// Führt einen Lauf aus: Schritt für Schritt, mit Protokoll je Schritt in der Datenbank.
//
// Fortsetzen nach einer Unterbrechung: Der Ablauf beginnt wieder vorne. Tool-, KI- und
// Workflow-Schritte, die schon fertig im Protokoll stehen, werden nicht wiederholt, sondern liefern ihr
// gespeichertes Ergebnis. Die übrigen Schritte haben keine Nebenwirkung und kommen deshalb zum selben
// Ergebnis. So geht es genau dort weiter, wo der Lauf stehen geblieben ist.
import type { WorkflowSchritt } from "../../gemeinsam/typen.ts";
import * as laeufe from "../datenbank/workflow-laeufe.ts";
import { AusdruckFehler, setzeEin, type Variablen } from "./ausdruecke.ts";
import { Beenden, LaufAbbruch, SchrittFehler, titelDes, type AblaufUmgebung, type SchrittAusfuehrung, type SchrittKontext } from "./schritte/gemeinsam.ts";
import { kiSchritt } from "./schritte/ki.ts";
import { beendenSchritt, fuerJedesSchritt, setzenSchritt, wennSchritt } from "./schritte/steuerung.ts";
import { toolSchritt } from "./schritte/tool.ts";
import { workflowSchritt } from "./schritte/workflow.ts";

const ausfuehrungen: { [A in WorkflowSchritt["art"]]: SchrittAusfuehrung<Extract<WorkflowSchritt, { art: A }>> } = {
  tool: toolSchritt,
  ki: kiSchritt,
  wenn: wennSchritt,
  fuer_jedes: fuerJedesSchritt,
  setzen: setzenSchritt,
  workflow: workflowSchritt,
  beenden: beendenSchritt,
};

/** Diese Arten ändern etwas außerhalb des Laufs oder kosten Credits – beim Fortsetzen nicht wiederholen. */
const mitNebenwirkung: WorkflowSchritt["art"][] = ["tool", "ki", "workflow"];

export interface LaufEnde {
  status: "erfolgreich" | "fehlgeschlagen" | "abgebrochen";
  ergebnis: unknown;
  fehler: string | null;
}

export class Ablauf {
  private lauf: laeufe.LaufIntern;
  private umgebung: AblaufUmgebung;
  private variablen: Variablen;

  constructor(lauf: laeufe.LaufIntern, umgebung: AblaufUmgebung) {
    this.lauf = lauf;
    this.umgebung = umgebung;
    this.variablen = { eingaben: lauf.eingaben };
  }

  async fuehreAus(): Promise<LaufEnde> {
    try {
      await this.schritte(this.lauf.definition.schritte, "", "", 0);
      const { ergebnis } = this.lauf.definition;
      return { status: "erfolgreich", ergebnis: ergebnis ? setzeEin(ergebnis, this.variablen) : null, fehler: null };
    } catch (fehler) {
      if (fehler instanceof Beenden) return { status: "erfolgreich", ergebnis: fehler.ergebnis, fehler: null };
      if (fehler instanceof LaufAbbruch) return { status: "abgebrochen", ergebnis: null, fehler: fehler.message };
      return { status: "fehlgeschlagen", ergebnis: null, fehler: (fehler as Error).message };
    }
  }

  private async schritte(liste: WorkflowSchritt[], praefix: string, durchlauf: string, tiefe: number): Promise<void> {
    for (const schritt of liste) await this.schritt(schritt, praefix, durchlauf, tiefe);
  }

  private async schritt(schritt: WorkflowSchritt, praefix: string, durchlauf: string, tiefe: number): Promise<void> {
    const grund = this.umgebung.abbruchGrund(this.lauf.nr);
    if (grund) throw new LaufAbbruch(grund);

    const { db } = this.umgebung;
    const nr = this.lauf.nr;
    const schluessel = `${praefix}${schritt.id}`;
    const vorher = laeufe.holeSchritt(db, nr, schluessel);
    if (mitNebenwirkung.includes(schritt.art) && vorher?.status === "fertig") {
      this.merke(schritt, vorher.ergebnis);
      return;
    }

    const titel = titelDes(schritt);
    laeufe.beginneSchritt(db, nr, schluessel, { id: schritt.id, art: schritt.art, titel }, durchlauf, tiefe);
    laeufe.setzeAktuellenSchritt(db, nr, durchlauf ? `${titel} (${durchlauf})` : titel);
    this.umgebung.geaendert();

    const kontext: SchrittKontext = {
      lauf: this.lauf,
      umgebung: this.umgebung,
      variablen: this.variablen,
      setze: (name, wert) => (this.variablen[name] = wert),
      schluessel,
      vorher,
      vermerke: (angaben) => {
        laeufe.vermerkeImSchritt(db, nr, schluessel, angaben);
        this.umgebung.geaendert();
      },
      fuehreAus: (unter, unterPraefix, unterDurchlauf) => this.schritte(unter, `${praefix}${unterPraefix}`, unterDurchlauf || durchlauf, tiefe + 1),
      wartet: (ja) => {
        laeufe.vermerkeImSchritt(db, nr, schluessel, { status: ja ? "wartet" : "laeuft" });
        laeufe.setzeStatus(db, nr, ja ? "wartet" : "laeuft");
        this.umgebung.geaendert();
      },
    };

    try {
      const ausfuehrung = ausfuehrungen[schritt.art] as SchrittAusfuehrung;
      const wert = await ausfuehrung(schritt, kontext);
      laeufe.beendeSchritt(db, nr, schluessel, "fertig", wert, null);
      this.merke(schritt, wert);
    } catch (fehler) {
      if (fehler instanceof Beenden) laeufe.beendeSchritt(db, nr, schluessel, "fertig", fehler.ergebnis, null);
      else if (fehler instanceof LaufAbbruch) laeufe.beendeSchritt(db, nr, schluessel, "abgebrochen", undefined, fehler.message);
      else {
        // Ungültiger Platzhalter u. Ä. ist auch ein Fehler des Schritts – mit seiner Meldung.
        const meldung = fehler instanceof SchrittFehler || fehler instanceof AusdruckFehler ? fehler.message : `Unerwarteter Fehler: ${(fehler as Error).message}`;
        // Unterschritte haben ihren eigenen Fehler schon vermerkt; Bedingung und Schleife nennen ihn nur.
        laeufe.beendeSchritt(db, nr, schluessel, "fehler", undefined, meldung);
        this.umgebung.geaendert();
        throw fehler instanceof SchrittFehler ? fehler : new SchrittFehler(meldung);
      }
      this.umgebung.geaendert();
      throw fehler;
    } finally {
      this.umgebung.geaendert();
    }
  }

  /** Das Ergebnis in die Variable des Schritts legen, falls er eine hat. */
  private merke(schritt: WorkflowSchritt, wert: unknown): void {
    if ("ergebnis" in schritt && schritt.art !== "beenden" && schritt.ergebnis) this.variablen[schritt.ergebnis] = wert;
  }
}
