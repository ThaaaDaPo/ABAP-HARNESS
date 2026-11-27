// Verwaltet die Läufe: starten (manuell, durch einen Agenten, nach Zeitplan, aus einem anderen
// Workflow), abbrechen, fortsetzen, Credit-Limit (E-69). Verbindet den Ablauf mit Chat und Postfach:
// - Freigaben und Rückfragen eines Laufs erledigt David im Chat, wenn ein Agent den Workflow dort
//   gestartet hat, sonst im Postfach (E-68). Gewartet wird über den Chat-Dienst – er kennt beide Wege.
// - Agenten bekommen die Tools workflow_starten und workflow_stand, KI-Schritte ergebnis_melden.
import type { ErgebnisFeld, LaufAusloeser, PostfachArt, WorkflowInfo } from "../../gemeinsam/typen.ts";
import type { ChatDienst, ChatErgaenzung } from "../chat/chat-dienst.ts";
import { meldeUebersicht } from "../chat/live-verteiler.ts";
import { holeAgent, holeAlleAgenten } from "../datenbank/agenten.ts";
import { holeAufgabe, holeAlleAufgaben, type AufgabeIntern } from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeEintraegeDesLaufs, offeneStatus, schliesseAb } from "../datenbank/postfach.ts";
import { credits, summeDesWorkflowLaufs } from "../datenbank/verbrauch.ts";
import * as laeufe from "../datenbank/workflow-laeufe.ts";
import { Fehler } from "../fehler.ts";
import type { McpAufrufer } from "../mcp/mcp-aufrufer.ts";
import type { NutzerEntscheidung } from "../postfach/entscheidungen.ts";
import type { PlattformTool } from "../postfach/plattform-tools.ts";
import { Ablauf } from "./ablauf.ts";
import { workflowWerkzeuge } from "./agenten-werkzeuge.ts";
import { erstelleErgebnisTool, type ErgebnisAblage } from "./ergebnis-melden.ts";
import { pruefeEingaben, warnungen } from "./pruefen.ts";
import type { AblaufUmgebung } from "./schritte/gemeinsam.ts";
import { listeWorkflows, leseWorkflow } from "./workflow-ordner.ts";
import type { ZeitsteuerungsQuelle } from "./zeitsteuerung.ts";

/** Wie tief Workflows einander aufrufen dürfen – gegen Endlosschleifen (A ruft B ruft A …) */
const maxTiefe = 5;

export interface StartAngaben {
  ausloeser: LaufAusloeser;
  /** Chat oder KI-Schritt, aus dem ein Agent den Workflow startet */
  aufruferAufgabeId?: string;
  /** Bei Schritt „Workflow“: der Lauf, zu dem dieser gehört */
  elternLauf?: laeufe.LaufIntern;
  /** Der Agent wartet nicht und bekommt im Chat eine Nachricht, wenn der Lauf fertig ist (E-71) */
  benachrichtigen?: boolean;
}

interface AktiverLauf {
  /** Gesetzt, sobald der Lauf abgebrochen werden soll */
  abbruch: string | null;
  ende: Promise<laeufe.LaufIntern>;
}

export class WorkflowDienst implements AblaufUmgebung, ChatErgaenzung {
  readonly db: Datenbank;
  readonly aufrufer: McpAufrufer;
  readonly chat: ChatDienst;
  private ordner: string;
  private aktiv = new Map<number, AktiverLauf>();
  /** KI-Schritt (Aufgabe) → Ablage für ergebnis_melden */
  private ablagen = new Map<string, ErgebnisAblage>();

  constructor(db: Datenbank, ordner: string, chat: ChatDienst, aufrufer: McpAufrufer) {
    this.db = db;
    this.ordner = ordner;
    this.chat = chat;
    this.aufrufer = aufrufer;
    chat.setzeErgaenzung(this);
  }

  /**
   * Nach dem Start der App: Was beim Beenden lief oder wartete, ist unterbrochen. Offene Freigaben
   * und Rückfragen dieser Läufe sind damit hinfällig; fortgesetzt wird über „Fortsetzen“.
   */
  raeumeNachNeustartAuf(): void {
    for (const lauf of laeufe.holeOffeneLaeufe(this.db)) {
      laeufe.brecheOffeneSchritteAb(this.db, lauf.nr, "Unterbrochen: Die App wurde beendet.");
      for (const eintrag of holeEintraegeDesLaufs(this.db, lauf.nr)) {
        if (eintrag.art !== "meldung" && offeneStatus.includes(eintrag.status)) {
          schliesseAb(this.db, eintrag.nr, { status: "verworfen", antwort: "Hinfällig: Der Lauf wurde unterbrochen, weil die App beendet wurde." });
        }
      }
      laeufe.beendeLauf(this.db, lauf.nr, "unterbrochen", null, "Die App wurde beendet, während der Lauf lief. „Fortsetzen“ macht beim unterbrochenen Schritt weiter.");
    }
  }

  // -------------------------------------------------------------------------------------------
  // Workflows und Läufe
  // -------------------------------------------------------------------------------------------

  liste(): WorkflowInfo[] {
    const gelesen = listeWorkflows(this.ordner);
    const ids = gelesen.map((w) => w.id);
    const agenten = holeAlleAgenten(this.db);
    return gelesen.map(({ id, definition, fehler }) => {
      const letzter = laeufe.holeLaeufe(this.db, id, 1)[0];
      return {
        id,
        definition,
        fehler,
        warnungen: definition ? warnungen(definition, this.db, ids) : [],
        agenten: agenten.filter((a) => a.workflows.includes(id)).map((a) => a.name),
        letzterLauf: letzter ? { nr: letzter.nr, status: letzter.status, gestartetAm: letzter.gestartetAm } : null,
      };
    });
  }

  /** Startet einen Lauf und kehrt sofort zurück; er läuft im Hintergrund. */
  starteLauf(workflowId: string, roheEingaben: Record<string, unknown>, angaben: StartAngaben): laeufe.LaufIntern {
    const definition = leseWorkflow(this.ordner, workflowId);
    const { ausloeser, elternLauf } = angaben;
    if (ausloeser === "manuell" && !definition.start.manuell) throw new Fehler(409, `${definition.name} ist nicht für den manuellen Start freigegeben.`);
    if (ausloeser === "agent" && !definition.start.durchAgent) throw new Fehler(409, `${definition.name} darf nicht durch einen Agenten gestartet werden.`);
    if (ausloeser === "zeitplan" && !definition.start.zeitplan) throw new Fehler(409, `${definition.name} hat keinen Zeitplan.`);
    if (elternLauf && this.tiefe(elternLauf) >= maxTiefe) throw new Fehler(409, `Workflows dürfen höchstens ${maxTiefe} Ebenen tief einander aufrufen.`);

    const chatAufgabeId = elternLauf ? elternLauf.chatAufgabeId : this.chatDes(angaben.aufruferAufgabeId);
    const lauf = laeufe.legeLaufAn(this.db, {
      workflowId,
      definition,
      ausloeser,
      eingaben: pruefeEingaben(definition, roheEingaben),
      aufruferAufgabeId: angaben.aufruferAufgabeId ?? null,
      chatAufgabeId,
      elternLauf: elternLauf?.nr ?? null,
      benachrichtigen: angaben.benachrichtigen === true,
    });
    // Direkt aus dem Chat gestartet: Dort erscheint eine Karte mit dem Stand des Laufs.
    if (chatAufgabeId && angaben.aufruferAufgabeId === chatAufgabeId) {
      this.chat.melde(chatAufgabeId, { art: "workflow_lauf", laufNr: lauf.nr, workflowName: definition.name });
    }
    this.lasseLaufen(lauf);
    return lauf;
  }

  /** Wartet, bis der Lauf fertig (oder abgebrochen) ist. */
  async warteAufEnde(nr: number): Promise<laeufe.LaufIntern> {
    const aktiv = this.aktiv.get(nr);
    if (aktiv) return aktiv.ende;
    const lauf = laeufe.holeLauf(this.db, nr);
    if (!lauf) throw new Fehler(404, `Lauf #${nr} gibt es nicht.`);
    return lauf;
  }

  laeuft(nr: number): boolean {
    return this.aktiv.has(nr);
  }

  /** Hält den Lauf an: wartende Freigaben gelten als verworfen, laufende KI-Schritte werden abgebrochen. */
  abbrechen(nr: number, grund = "Von dir abgebrochen."): void {
    const aktiv = this.aktiv.get(nr);
    if (!aktiv) throw new Fehler(409, `Lauf #${nr} läuft nicht.`);
    if (aktiv.abbruch) return;
    aktiv.abbruch = grund;
    for (const eintrag of holeEintraegeDesLaufs(this.db, nr)) {
      if (eintrag.art === "meldung" || !offeneStatus.includes(eintrag.status)) continue;
      if (!this.chat.entscheide(eintrag.nr, { art: "verworfen" })) schliesseAb(this.db, eintrag.nr, { status: "verworfen" });
    }
    for (const aufgabe of holeAlleAufgaben(this.db)) {
      if (aufgabe.workflowLauf === nr && this.chat.istBeschaeftigt(aufgabe.id)) void this.chat.brecheAb(aufgabe.id);
    }
    for (const unter of this.aktiv.keys()) {
      if (laeufe.holeLauf(this.db, unter)?.elternLauf === nr) this.abbrechen(unter, grund);
    }
    meldeUebersicht({ bereich: "postfach" });
    this.geaendert();
  }

  /** Nach Unterbrechung oder Fehler: beim betroffenen Schritt weitermachen, Fertiges nicht wiederholen. */
  fortsetzen(nr: number): laeufe.LaufIntern {
    const lauf = laeufe.holeLauf(this.db, nr);
    if (!lauf) throw new Fehler(404, `Lauf #${nr} gibt es nicht.`);
    if (this.aktiv.has(nr)) throw new Fehler(409, `Lauf #${nr} läuft schon.`);
    if (lauf.status !== "unterbrochen" && lauf.status !== "fehlgeschlagen") {
      throw new Fehler(409, `Lauf #${nr} ist ${lauf.status} – fortsetzen geht nur nach einer Unterbrechung oder einem Fehler.`);
    }
    laeufe.nimmLaufWiederAuf(this.db, nr);
    const wieder = laeufe.holeLauf(this.db, nr)!;
    this.lasseLaufen(wieder);
    return wieder;
  }

  private lasseLaufen(lauf: laeufe.LaufIntern): void {
    const aktiv: AktiverLauf = { abbruch: null, ende: Promise.resolve(lauf) };
    this.aktiv.set(lauf.nr, aktiv);
    aktiv.ende = new Ablauf(lauf, this)
      .fuehreAus()
      .then((ende) => {
        laeufe.beendeLauf(this.db, lauf.nr, ende.status, ende.ergebnis, ende.fehler);
        return laeufe.holeLauf(this.db, lauf.nr)!;
      })
      .finally(() => this.aktiv.delete(lauf.nr))
      .then((fertig) => {
        this.geaendert();
        this.benachrichtige(fertig);
        return fertig;
      });
    // Der Ablauf fängt seine Fehler selbst; scheitert trotzdem etwas (z. B. die Datenbank), soll das
    // nicht als unbehandelter Fehler die ganze App beenden.
    aktiv.ende.catch((fehler) => console.error(`Workflow-Lauf #${lauf.nr}:`, fehler));
    this.geaendert();
  }

  /** Hat der Agent nicht gewartet, erfährt er im Chat, dass der Lauf fertig ist (E-71). */
  private benachrichtige(lauf: laeufe.LaufIntern): void {
    if (!lauf.benachrichtigen || !lauf.aufruferAufgabeId || !holeAufgabe(this.db, lauf.aufruferAufgabeId)) return;
    this.chat.setzeFortAusPostfach(lauf.aufruferAufgabeId, `[Hinweis der App: ${beschreibeLauf(lauf)}]`);
  }

  private tiefe(lauf: laeufe.LaufIntern): number {
    let tiefe = 1;
    for (let eltern = lauf.elternLauf; eltern !== null; tiefe++) eltern = laeufe.holeLauf(this.db, eltern)?.elternLauf ?? null;
    return tiefe;
  }

  /** Der Chat, in dem Freigaben des Laufs erscheinen: der aufrufende Chat bzw. der Chat des aufrufenden Laufs. */
  private chatDes(aufruferAufgabeId: string | undefined): string | null {
    const aufrufer = aufruferAufgabeId ? holeAufgabe(this.db, aufruferAufgabeId) : null;
    if (!aufrufer) return null;
    if (aufrufer.herkunft === "chat") return aufrufer.id;
    return aufrufer.workflowLauf ? laeufe.chatDesLaufs(this.db, aufrufer.workflowLauf) : null;
  }

  // -------------------------------------------------------------------------------------------
  // Für den Ablauf (AblaufUmgebung)
  // -------------------------------------------------------------------------------------------

  warteAufEntscheidung(lauf: laeufe.LaufIntern, nr: number): Promise<NutzerEntscheidung> {
    return this.chat.warteAufEntscheidung(lauf.aufgabeId, nr);
  }

  meldePostfach(lauf: laeufe.LaufIntern, nr: number, art: PostfachArt, toolName: string): void {
    // Der Chat-Dienst zeigt den Eintrag auch im aufrufenden Chat und meldet das Postfach.
    this.chat.melde(lauf.aufgabeId, { art: "postfach", postfachNr: nr, eintragsArt: art, toolName });
  }

  bereiteErgebnisVor(aufgabeId: string, felder: ErgebnisFeld[]): ErgebnisAblage {
    const ablage: ErgebnisAblage = { felder };
    if (felder.length > 0) this.ablagen.set(aufgabeId, ablage);
    return ablage;
  }

  async raeumeAuf(aufgabeId: string): Promise<void> {
    this.ablagen.delete(aufgabeId);
    await this.chat.gibSitzungFrei(aufgabeId);
  }

  async fuehreUnterlaufAus(
    lauf: laeufe.LaufIntern,
    workflowId: string,
    eingaben: Record<string, unknown>,
    vorherigerLauf: number | null,
    beimStart: (nr: number) => void,
  ): Promise<laeufe.LaufIntern> {
    const vorher = vorherigerLauf !== null ? laeufe.holeLauf(this.db, vorherigerLauf) : null;
    if (vorher?.status === "erfolgreich") return vorher;
    const unter =
      vorher && (vorher.status === "unterbrochen" || vorher.status === "fehlgeschlagen")
        ? this.fortsetzen(vorher.nr)
        : this.starteLauf(workflowId, eingaben, { ausloeser: "workflow", elternLauf: lauf });
    beimStart(unter.nr);
    return this.warteAufEnde(unter.nr);
  }

  abbruchGrund(laufNr: number): string | null {
    return this.aktiv.get(laufNr)?.abbruch ?? null;
  }

  geaendert(): void {
    meldeUebersicht({ bereich: "workflows" });
  }

  // -------------------------------------------------------------------------------------------
  // Für den Chat-Dienst (ChatErgaenzung)
  // -------------------------------------------------------------------------------------------

  /** Zusätzliche Tools einer Sitzung: ergebnis_melden im KI-Schritt, Workflows für zugeordnete Agenten. */
  zusatzWerkzeuge(aufgabe: AufgabeIntern): PlattformTool[] {
    const werkzeuge: PlattformTool[] = [];
    const ablage = this.ablagen.get(aufgabe.id);
    if (ablage) werkzeuge.push(erstelleErgebnisTool(ablage));
    const agent = holeAgent(this.db, aufgabe.agentId);
    const erlaubt = listeWorkflows(this.ordner).filter((w) => w.definition?.start.durchAgent && agent?.workflows.includes(w.id));
    if (erlaubt.length > 0) werkzeuge.push(...workflowWerkzeuge(this, aufgabe, erlaubt.map((w) => ({ id: w.id, definition: w.definition! }))));
    return werkzeuge;
  }

  /** Nach jedem Modellaufruf eines KI-Schritts: Ist das Credit-Limit des Laufs überschritten (E-69)? */
  verbrauchGemeldet(aufgabeId: string): void {
    const laufNr = holeAufgabe(this.db, aufgabeId)?.workflowLauf;
    if (!laufNr || !this.aktiv.has(laufNr)) return;
    const lauf = laeufe.holeLauf(this.db, laufNr)!;
    const verbraucht = credits(summeDesWorkflowLaufs(this.db, laufNr));
    if (verbraucht > lauf.creditLimit) {
      this.abbrechen(laufNr, `Credit-Limit erreicht: ${verbraucht.toFixed(2)} von ${lauf.creditLimit} AI-Credits verbraucht.`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Für die Zeitsteuerung
  // -------------------------------------------------------------------------------------------

  zeitplanQuelle(): ZeitsteuerungsQuelle {
    return {
      geplante: () =>
        listeWorkflows(this.ordner).flatMap((w) => (w.definition?.start.zeitplan ? [{ id: w.id, zeitplan: w.definition.start.zeitplan }] : [])),
      laeuftNoch: (id) =>
        [...this.aktiv.keys()].some((nr) => {
          const lauf = laeufe.holeLauf(this.db, nr);
          return lauf?.workflowId === id && lauf.ausloeser === "zeitplan";
        }),
      starte: (id) => void this.starteLauf(id, {}, { ausloeser: "zeitplan" }),
      protokolliere: (text) => console.log(text),
    };
  }
}

/** Kurzer Text zum Stand eines Laufs – für den Agenten (Tool-Ergebnis, Nachricht im Chat). */
export function beschreibeLauf(lauf: laeufe.LaufIntern): string {
  const kopf = `Lauf #${lauf.nr} von Workflow „${lauf.workflowName}“`;
  const ergebnis = lauf.ergebnis === null || lauf.ergebnis === undefined ? "" : `\nErgebnis:\n${typeof lauf.ergebnis === "string" ? lauf.ergebnis : JSON.stringify(lauf.ergebnis, null, 2)}`;
  switch (lauf.status) {
    case "laeuft":
      return `${kopf} läuft gerade${lauf.aktuellerSchritt ? ` – Schritt: ${lauf.aktuellerSchritt}` : ""}.`;
    case "wartet":
      return `${kopf} wartet auf eine Entscheidung des Nutzers${lauf.aktuellerSchritt ? ` – Schritt: ${lauf.aktuellerSchritt}` : ""}.`;
    case "erfolgreich":
      return `${kopf} ist erfolgreich fertig.${ergebnis}`;
    case "fehlgeschlagen":
      return `${kopf} ist fehlgeschlagen: ${lauf.fehler ?? "ohne Angabe"}`;
    case "abgebrochen":
      return `${kopf} wurde abgebrochen: ${lauf.fehler ?? "ohne Angabe"}`;
    case "unterbrochen":
      return `${kopf} ist unterbrochen (App beendet). Der Nutzer kann ihn fortsetzen.`;
  }
}
