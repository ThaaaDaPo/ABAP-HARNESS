// Verbindet die Seite „Sprechen“ mit Modellen, Agent und Laufzeit. Gespräche liegen nur im Speicher:
// Sie sind zum Ausprobieren da und erscheinen nicht in der Chat-Liste. Der Verbrauch wird trotzdem
// gespeichert (Seite „Verbrauch“, Agent „Sprachassistent“).
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Ereignis, Pruefung, SprachEreignis, SprachStatus } from "../../gemeinsam/typen.ts";
import { aendereAgent, holeAgent } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { speichereVerbrauch } from "../datenbank/verbrauch.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";
import { ToolGateway } from "../gateway/gateway.ts";
import { instructionsText } from "../instructions/instructions-ordner.ts";
import type { AgentenLaufzeit, AgentenSitzung, SitzungsEinstellungen } from "../laufzeit/laufzeit.ts";
import { ladeBausteine, type Bausteine } from "./bausteine.ts";
import { Gespraech } from "./gespraech.ts";
import { ModellLader } from "./modelle.ts";
import { schnellesModell, sprachAgentId } from "./sprach-agent.ts";

/** Merker in app_einstellungen: Das schnelle Modell wurde einmal vorgeschlagen, danach entscheidet David. */
const modellVorgeschlagen = "sprache.modellVorgeschlagen";

interface GespraechsEintrag {
  gespraech: Gespraech;
  sitzung: AgentenSitzung | null;
  /** Woraus die Sitzung gebaut wurde – ändert es sich, wird sie mit den neuen Einstellungen fortgesetzt */
  stand: string;
  /** Die Sitzung meldet an diese Stelle; jede Runde setzt ihren eigenen Empfänger */
  empfaenger: (ereignis: Ereignis) => void;
  /** Sitzungen werden nacheinander aufgebaut, nie zwei gleichzeitig */
  bau: Promise<unknown>;
  /** Offene Browser-Fenster (Server-Sent Events) */
  abonnenten: Set<(ereignis: SprachEreignis) => void>;
}

export class SprachDienst {
  private db: Datenbank;
  private laufzeit: AgentenLaufzeit;
  private einstellungen: Einstellungen;
  private lader: ModellLader;
  private modellOrdner: string;
  private bausteine: Promise<Bausteine> | null = null;
  private ladeFehler: string | null = null;
  private gespraeche = new Map<string, GespraechsEintrag>();

  constructor(db: Datenbank, laufzeit: AgentenLaufzeit, einstellungen: Einstellungen) {
    this.db = db;
    this.laufzeit = laufzeit;
    this.einstellungen = einstellungen;
    this.modellOrdner = path.join(einstellungen.datenOrdner, "modelle");
    this.lader = new ModellLader(this.modellOrdner);
  }

  /** Beim Start: Fehlende Modelle im Hintergrund laden. Klappt es nicht, steht der Grund auf der Seite. */
  ladeModelleImHintergrund(): void {
    if (this.lader.alleVorhanden()) return;
    console.log(`Sprechen: lade fehlende Modelle nach ${this.modellOrdner} …`);
    void this.lader.ladeFehlende().then(() => {
      const fehler = this.lader.staende().filter((m) => m.fehler);
      if (fehler.length === 0) console.log("Sprechen: Modelle sind da.");
      else for (const m of fehler) console.log(`Sprechen: ${m.titel} – ${m.fehler}`);
    });
  }

  ladeModelle(): void {
    this.ladeFehler = null;
    void this.lader.ladeFehlende();
  }

  status(): SprachStatus {
    const modelle = this.lader.staende();
    return {
      modelle,
      bereit: modelle.every((m) => m.zustand === "vorhanden") && !this.ladeFehler,
      fehler: this.ladeFehler,
      modellOrdner: this.modellOrdner,
      agent: holeAgent(this.db, sprachAgentId)!,
    };
  }

  /** Für die Einrichtungsseite */
  pruefung(): Pruefung {
    const status = this.status();
    const fehlend = status.modelle.filter((m) => m.zustand !== "vorhanden");
    if (status.fehler) return { titel: "Sprechen", ok: false, text: status.fehler, hinweis: "Details auf der Seite „Sprechen“." };
    if (fehlend.length === 0) return { titel: "Sprechen", ok: true, text: `Modelle für Erkennung und Stimme liegen in ${status.modellOrdner}.` };
    const laedt = fehlend.some((m) => m.zustand === "laedt" || m.zustand === "entpackt");
    return {
      titel: "Sprechen",
      ok: laedt ? null : false,
      text: `${laedt ? "Wird geladen" : "Es fehlen"}: ${fehlend.map((m) => m.titel).join(", ")}.`,
      hinweis: "Auf der Seite „Sprechen“ lässt sich das Laden neu starten; dort steht auch, wie es von Hand geht.",
    };
  }

  /** Neues Gespräch: lädt beim ersten Mal die Modelle in den Speicher (ein paar Sekunden). */
  async neuesGespraech(): Promise<string> {
    if (!this.lader.alleVorhanden()) throw new Fehler(409, "Die Modelle für Erkennung und Stimme fehlen noch.");
    const bausteine = await this.holeBausteine();
    await this.schlageModellVor();

    const id = randomUUID();
    const eintrag: GespraechsEintrag = {
      gespraech: undefined!,
      sitzung: null,
      stand: "",
      empfaenger: () => {},
      bau: Promise.resolve(),
      abonnenten: new Set(),
    };
    eintrag.gespraech = new Gespraech(id, {
      erkenner: bausteine.erkenner,
      sprecher: bausteine.sprecher,
      sprachende: bausteine.erstelleSprachende(),
      sitzung: (empfaenger) => this.sitzungFuer(id, eintrag, empfaenger),
      melde: (ereignis) => {
        for (const abonnent of eintrag.abonnenten) abonnent(ereignis);
      },
      verbrauch: (ereignis, runde) => {
        const { art: _art, ...werte } = ereignis;
        speichereVerbrauch(this.db, { ...werte, aufgabeId: `sprache-${id}`, agentId: sprachAgentId, lauf: `sprache-${id}-${runde}` });
      },
    });
    this.gespraeche.set(id, eintrag);
    // Sitzung gleich aufbauen, damit die erste Antwort nicht darauf warten muss. Ein Fehler
    // (z. B. Copilot nicht angemeldet) zeigt sich bei der ersten Runde.
    this.sitzungFuer(id, eintrag, () => {}).catch(() => {});
    return id;
  }

  abonniere(id: string, abonnent: (ereignis: SprachEreignis) => void): () => void {
    const eintrag = this.gespraeche.get(id);
    if (!eintrag) throw new Fehler(404, "Gespräch nicht gefunden");
    eintrag.abonnenten.add(abonnent);
    return () => eintrag.abonnenten.delete(abonnent);
  }

  gespraech(id: string): Gespraech {
    const eintrag = this.gespraeche.get(id);
    if (!eintrag) throw new Fehler(404, "Gespräch nicht gefunden – bitte neu starten.");
    return eintrag.gespraech;
  }

  /** Beendet das Gespräch und löscht seine Sitzung: Gespräche werden nicht aufgehoben. */
  async beende(id: string): Promise<void> {
    const eintrag = this.gespraeche.get(id);
    if (!eintrag) return;
    this.gespraeche.delete(id);
    await eintrag.gespraech.beende();
    if (eintrag.sitzung) {
      await eintrag.sitzung.trennen().catch(() => {});
      await this.laufzeit.loescheSitzung(eintrag.sitzung.id).catch(() => {});
    }
  }

  async beendeAlle(): Promise<void> {
    for (const id of [...this.gespraeche.keys()]) await this.beende(id);
  }

  private holeBausteine(): Promise<Bausteine> {
    if (!this.bausteine) {
      this.bausteine = ladeBausteine(this.modellOrdner).catch((fehler: Error) => {
        this.bausteine = null;
        this.ladeFehler = `Erkennung oder Stimme ließen sich nicht laden: ${fehler.message}`;
        throw new Fehler(500, this.ladeFehler);
      });
    }
    return this.bausteine;
  }

  /** Beim ersten Gespräch: schnelles Modell eintragen, wenn der Agent noch auf „automatisch“ steht. */
  private async schlageModellVor(): Promise<void> {
    const bekannt = this.db.prepare(`SELECT 1 FROM app_einstellungen WHERE schluessel = ?`).get(modellVorgeschlagen);
    if (bekannt) return;
    const agent = holeAgent(this.db, sprachAgentId)!;
    const wahl = agent.modellWahl.modell ? null : schnellesModell(await this.laufzeit.modelle().catch(() => []));
    if (wahl) aendereAgent(this.db, agent.id, { ...agent, modellWahl: wahl });
    this.db.prepare(`INSERT INTO app_einstellungen (schluessel, wert) VALUES (?, 'true')`).run(modellVorgeschlagen);
  }

  /**
   * Die Sitzung des Gesprächs. Hat David Modell oder Auftrag geändert, wird sie mit den neuen
   * Einstellungen fortgesetzt – wie im Chat bleibt der Gesprächsverlauf dabei erhalten.
   */
  private sitzungFuer(id: string, eintrag: GespraechsEintrag, empfaenger: (ereignis: Ereignis) => void): Promise<AgentenSitzung> {
    eintrag.empfaenger = empfaenger;
    const sitzung = eintrag.bau.then(() => this.baueSitzung(id, eintrag));
    eintrag.bau = sitzung.catch(() => {});
    return sitzung;
  }

  private async baueSitzung(id: string, eintrag: GespraechsEintrag): Promise<AgentenSitzung> {
    const einstellungen = this.sitzungsEinstellungen(id);
    const stand = JSON.stringify([einstellungen.auftrag, einstellungen.modell, einstellungen.denkaufwand, einstellungen.kontext]);
    if (eintrag.sitzung && eintrag.stand === stand) return eintrag.sitzung;

    const weiterleiten = (ereignis: Ereignis) => eintrag.empfaenger(ereignis);
    const alte = eintrag.sitzung;
    eintrag.sitzung = null;
    if (alte) await alte.trennen().catch(() => {});
    eintrag.sitzung = alte
      ? await this.laufzeit.setzeFort(alte.id, einstellungen, weiterleiten)
      : await this.laufzeit.starte(einstellungen, weiterleiten);
    eintrag.stand = stand;
    return eintrag.sitzung;
  }

  private sitzungsEinstellungen(id: string): SitzungsEinstellungen {
    const agent = holeAgent(this.db, sprachAgentId)!;
    const wahl = agent.modellWahl;
    const kontext = { db: this.db, agentId: agent.id, aufgabeId: `sprache-${id}`, melde: () => {} };
    return {
      agentName: agent.name,
      auftrag: [agent.auftrag, instructionsText(this.einstellungen.instructionsOrdner, agent.instructions)].filter(Boolean).join("\n\n"),
      modell: wahl.modell,
      denkaufwand: wahl.modell ? wahl.denkaufwand : "",
      kontext: wahl.modell ? wahl.kontext : "standard",
      workspaceOrdner: this.einstellungen.workspaceOrdner,
      mcpServer: [],
      gateway: new ToolGateway(kontext),
      plattformTools: [],
      skillOrdner: [],
      abgeschalteteSkills: [],
      wartetImAufruf: true,
      nurGespraech: true,
    };
  }
}
