// Ein Gespräch mit dem Voice Agent. Ablauf einer Runde:
//   Mikrofon → Sprechpausen-Erkennung → Äußerung fertig → Erkennung → Text an den Agenten →
//   gestreamte Antwort in Sätze zerlegen → jeden Satz sofort sprechen → Audio an den Browser.
// Spricht David dazwischen oder sagt etwas Neues, wird die laufende Runde abgebrochen: Die neue
// Äußerung gilt. Jede Runde hat eine Nummer; was zu einer alten Runde gehört, wird verworfen.
import type { Ereignis, GespraechsZustand, SprachEreignis } from "../../gemeinsam/typen.ts";
import type { AgentenSitzung } from "../laufzeit/laufzeit.ts";
import type { Erkenner, Sprachende, Sprecher } from "./bausteine.ts";
import { fuerSprache, SatzSammler } from "./saetze.ts";
import { alsWav } from "./wav.ts";

export interface GespraechsUmgebung {
  erkenner: Erkenner;
  sprecher: Sprecher;
  sprachende: Sprachende;
  /** Liefert die Sitzung beim Agenten – neu aufgebaut, wenn sich Modell oder Auftrag geändert haben */
  sitzung: (empfaenger: (ereignis: Ereignis) => void) => Promise<AgentenSitzung>;
  melde: (ereignis: SprachEreignis) => void;
  /** Verbrauch eines Modellaufrufs, mit der Runde, zu der er gehört */
  verbrauch: (ereignis: Extract<Ereignis, { art: "verbrauch" }>, runde: number) => void;
}

/** Wie lange beim Unterbrechen höchstens auf das Ende der alten Runde gewartet wird */
const abbruchWartezeitMs = 3000;

export class Gespraech {
  readonly id: string;
  /** Sprechtempo der Stimme: 1 = normal, größer = schneller */
  tempo = 1;
  private umgebung: GespraechsUmgebung;
  private runde = 0;
  private laufendeRunde: Promise<void> | null = null;
  private sitzungAktiv: AgentenSitzung | null = null;
  private hoerteSprache = false;
  /** Zur laufenden Runde: Sätze sammeln, Sprechen der Reihe nach, Messwerte */
  private satzSammler = new SatzSammler();
  private sprechKette: Promise<void> = Promise.resolve();
  private satzNr = 0;
  private aeusserungEnde = 0;
  private ersterText: number | null = null;
  private ersterTon: number | null = null;

  constructor(id: string, umgebung: GespraechsUmgebung) {
    this.id = id;
    this.umgebung = umgebung;
  }

  /** Audio vom Mikrofon (16 kHz, mono) */
  nimmAudio(samples: Float32Array): void {
    const aeusserungen = this.umgebung.sprachende.nimm(samples);
    const hoertSprache = this.umgebung.sprachende.hoertSprache();
    // Sprache beginnt: Wiedergabe im Browser stoppen und die alte Runde abbrechen.
    if (hoertSprache && !this.hoerteSprache) {
      this.umgebung.melde({ art: "nutzer_spricht" });
      void this.unterbreche();
    }
    this.hoerteSprache = hoertSprache;
    for (const aeusserung of aeusserungen) void this.neueRunde({ audio: aeusserung });
  }

  /** Getippter Text statt Sprache – zum Ausprobieren ohne Mikrofon */
  nimmText(text: string): void {
    void this.neueRunde({ text });
  }

  /** Mikrofon stumm: angefangene Äußerung vergessen */
  stumm(): void {
    this.umgebung.sprachende.zuruecksetzen();
    this.hoerteSprache = false;
  }

  /** Bricht die laufende Runde ab (Knopf „Unterbrechen“ oder neue Äußerung). */
  async unterbreche(): Promise<void> {
    if (!this.laufendeRunde) return;
    const alte = this.runde;
    this.runde++;
    this.umgebung.melde({ art: "unterbrochen", runde: alte });
    await this.sitzungAktiv?.abbrechen().catch(() => {});
    const laufend = this.laufendeRunde;
    await Promise.race([laufend, new Promise((weiter) => setTimeout(weiter, abbruchWartezeitMs))]);
    this.setzeZustand("hoert");
  }

  async beende(): Promise<void> {
    await this.unterbreche();
    this.runde++;
  }

  private async neueRunde(eingabe: { audio: Float32Array } | { text: string }): Promise<void> {
    await this.unterbreche();
    const runde = ++this.runde;
    const aktuell = () => runde === this.runde;
    const ablauf = this.fuehreRundeAus(runde, eingabe, aktuell).catch((fehler: Error) => {
      if (aktuell()) this.umgebung.melde({ art: "fehler", meldung: fehler.message });
    });
    this.laufendeRunde = ablauf;
    await ablauf;
    if (this.laufendeRunde === ablauf) {
      this.laufendeRunde = null;
      if (aktuell()) this.setzeZustand("hoert");
    }
  }

  private async fuehreRundeAus(runde: number, eingabe: { audio: Float32Array } | { text: string }, aktuell: () => boolean): Promise<void> {
    this.aeusserungEnde = Date.now();
    let text: string;
    if ("audio" in eingabe) {
      this.setzeZustand("erkennt");
      text = await this.umgebung.erkenner.erkenne(eingabe.audio);
      if (!aktuell()) return;
      this.umgebung.melde({ art: "erkannt", runde, text, dauerMs: Date.now() - this.aeusserungEnde });
      // Nichts verstanden (Räuspern, Tür): einfach weiter zuhören.
      if (!text) return;
    } else {
      text = eingabe.text.trim();
      this.umgebung.melde({ art: "erkannt", runde, text, dauerMs: 0 });
      if (!text) return;
    }

    this.setzeZustand("denkt");
    this.satzSammler = new SatzSammler();
    this.sprechKette = Promise.resolve();
    this.satzNr = 0;
    this.ersterText = null;
    this.ersterTon = null;
    let antwort = "";

    const sitzung = await this.umgebung.sitzung((ereignis) => {
      if (!aktuell()) return;
      if (ereignis.art === "agent_schreibt") {
        antwort += ereignis.textTeil;
        this.ersterText ??= Date.now();
        this.umgebung.melde({ art: "antwort_teil", runde, textTeil: ereignis.textTeil });
        for (const satz of this.satzSammler.nimm(ereignis.textTeil)) this.sprichSpaeter(runde, satz, aktuell);
      } else if (ereignis.art === "verbrauch") {
        this.umgebung.verbrauch(ereignis, runde);
      } else if (ereignis.art === "modell") {
        this.umgebung.melde(ereignis);
      } else if (ereignis.art === "fehler") {
        this.umgebung.melde({ art: "fehler", meldung: ereignis.meldung });
      }
    });
    this.sitzungAktiv = sitzung;
    if (!aktuell()) return;

    await sitzung.sende(text);
    if (!aktuell()) return;
    const rest = this.satzSammler.rest();
    if (rest) this.sprichSpaeter(runde, rest, aktuell);
    await this.sprechKette;
    if (!aktuell()) return;
    this.umgebung.melde({ art: "antwort_fertig", runde, text: antwort.trim() });
    this.umgebung.melde({ art: "zeiten", runde, ersterTextMs: this.abstand(this.ersterText), ersterTonMs: this.abstand(this.ersterTon) });
  }

  /** Sätze werden der Reihe nach gesprochen; der nächste wartet, bis der vorige fertig ist. */
  private sprichSpaeter(runde: number, satz: string, aktuell: () => boolean): void {
    const vorlesbar = fuerSprache(satz);
    if (!/[\p{L}\d]/u.test(vorlesbar)) return;
    const nr = ++this.satzNr;
    this.sprechKette = this.sprechKette.then(async () => {
      if (!aktuell()) return;
      try {
        const { samples, sampleRate } = await this.umgebung.sprecher.sprich(vorlesbar, this.tempo);
        if (!aktuell()) return;
        this.ersterTon ??= Date.now();
        this.umgebung.melde({ art: "audio", runde, nr, text: vorlesbar, wav: alsWav(samples, sampleRate).toString("base64") });
      } catch (fehler) {
        this.umgebung.melde({ art: "fehler", meldung: `Sprechen fehlgeschlagen: ${(fehler as Error).message}` });
      }
    });
  }

  private abstand(zeitpunkt: number | null): number | null {
    return zeitpunkt === null ? null : zeitpunkt - this.aeusserungEnde;
  }

  private setzeZustand(zustand: GespraechsZustand): void {
    this.umgebung.melde({ art: "zustand", zustand });
  }
}
