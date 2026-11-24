// Was Davids Aktionen an Vorschlägen und Rückfragen bewirken – egal ob er sie im Chat erledigt
// (Aufgaben aus dem Chat) oder im Postfach (Aufgaben aus Workflows, E-52).
//
// Im Chat wartet der Agent mitten im Tool-Aufruf auf David (E-54): Dann geht die Entscheidung
// direkt an den wartenden Aufruf (ChatDienst.entscheide). Alles Folgende gilt, wenn niemand wartet –
// bei Workflows immer, im Chat nur, wenn die App inzwischen neu gestartet wurde.
//
// Freigabe zum Abschluss (E-44): Die Aufgabe ist fertig, es fehlt nur noch der Aufruf.
//   freigeben         → die Plattform führt ihn aus, ohne KI; die Aufgabe ist erledigt
//   verwerfen         → nicht ausgeführt, die Aufgabe ist abgebrochen, ohne KI
//   antworten         → Änderungswunsch: der Agent überarbeitet, mit dem Kontext der Aufgabe
// Freigabe zum Weitermachen (E-45): Der Agent hat die Aufgabe pausiert, bis er das Ergebnis hat.
//   freigeben         → ausführen, dann reiht sich die Aufgabe mit dem Ergebnis in die Warteschlange ein
//   verwerfen, antworten wie oben
// Rückfrage (E-47): antworten setzt den Agenten fort, verwerfen bricht die Aufgabe ab.
// Meldung: zur Kenntnis nehmen; antworten setzt den Agenten mit der Rückmeldung fort.
import type { PostfachEintrag } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { meldeUebersicht } from "../chat/live-verteiler.ts";
import { holeAufgabe } from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import * as postfach from "../datenbank/postfach.ts";
import { Fehler } from "../fehler.ts";
import { laufzeitName, standardAgentId, ToolGateway } from "../gateway/gateway.ts";
import type { McpAufrufer } from "../mcp/mcp-aufrufer.ts";

export class PostfachDienst {
  private db: Datenbank;
  private chat: ChatDienst;
  private aufrufer: McpAufrufer;
  /** Freigaben, die gerade ausgeführt werden – damit ein Doppelklick nicht zweimal ausführt. */
  private inAusfuehrung = new Set<number>();

  constructor(db: Datenbank, chat: ChatDienst, aufrufer: McpAufrufer) {
    this.db = db;
    this.chat = chat;
    this.aufrufer = aufrufer;
  }

  alle(): PostfachEintrag[] {
    return postfach.holeAlleEintraege(this.db);
  }

  /** Was ins Postfach gehört: Einträge aus Workflows, die ohne David laufen. */
  fuerWorkflows(): PostfachEintrag[] {
    return postfach.holeWorkflowEintraege(this.db);
  }

  /** Was im Chat angezeigt und dort freigegeben wird. */
  fuerAufgabe(aufgabeId: string): PostfachEintrag[] {
    return postfach.holeEintraegeDerAufgabe(this.db, aufgabeId);
  }

  anzahlOffen(): number {
    return postfach.zaehleOffene(this.db);
  }

  /** Führt den gespeicherten Aufruf aus – genau so, wie David ihn im Postfach gesehen hat (V-05). */
  async freigeben(nr: number): Promise<void> {
    const eintrag = this.holeOffenen(nr, ["freigabe"]);
    if (this.inAusfuehrung.has(nr)) throw new Fehler(409, `Vorschlag #${nr} wird schon ausgeführt.`);

    const server = holeServer(this.db, eintrag.server);
    if (!server) throw new Fehler(409, `Der Server ${eintrag.server} ist nicht mehr eingetragen.`);
    // Hat David das Tool inzwischen verboten, gilt das auch für alte Vorschläge.
    const gateway = new ToolGateway({ db: this.db, agentId: standardAgentId, aufgabeId: eintrag.aufgabeId, melde: () => {} });
    if (gateway.regel(eintrag) === "verbieten") {
      throw new Fehler(409, `Das Tool ${laufzeitName(eintrag)} ist inzwischen verboten. Bitte verwerfen oder die Regel ändern.`);
    }

    // Der Agent wartet im Chat: Das Tool läuft dort ganz normal weiter.
    if (this.chat.entscheide(nr, { art: "freigegeben" })) return;

    this.inAusfuehrung.add(nr);
    let text: string;
    let fehlgeschlagen: boolean;
    try {
      const antwort = await this.aufrufer.rufeAuf(server, eintrag.tool, eintrag.argumente);
      text = antwort.text;
      fehlgeschlagen = antwort.fehler;
    } catch (fehler) {
      text = (fehler as Error).message;
      fehlgeschlagen = true;
    } finally {
      this.inAusfuehrung.delete(nr);
    }

    if (fehlgeschlagen) {
      // Ohne KI: David entscheidet, ob er es noch einmal versucht, Änderungen anfordert oder verwirft.
      postfach.schliesseAb(this.db, nr, { status: "fehlgeschlagen", ergebnis: text });
      this.hinweis(eintrag, `Vorschlag #${nr} freigegeben, aber die Ausführung ist fehlgeschlagen.`, text);
      this.chat.aktualisiereStatus(eintrag.aufgabeId);
      return;
    }

    postfach.schliesseAb(this.db, nr, { status: "freigegeben", ergebnis: text });
    // Aus einem Chat (nach einem Neustart): Der Agent hat auf das Ergebnis gewartet, also weiter.
    const ausChat = holeAufgabe(this.db, eintrag.aufgabeId)?.herkunft === "chat";
    if (eintrag.weiterNachFreigabe || ausChat) {
      this.hinweis(eintrag, `Vorschlag #${nr} freigegeben und ausgeführt. Der Agent macht weiter, sobald er frei ist.`, text);
      this.chat.setzeFortAusPostfach(
        eintrag.aufgabeId,
        `Vorschlag #${nr} (${laufzeitName(eintrag)}) wurde freigegeben und ausgeführt. Ergebnis:\n${text}\n\nMach mit der Aufgabe weiter.`,
      );
    } else {
      this.hinweis(eintrag, `Vorschlag #${nr} freigegeben und ausgeführt. Aufgabe erledigt.`, text);
      this.chat.aktualisiereStatus(eintrag.aufgabeId, "erledigt");
    }
  }

  /** Nicht ausführen und die Aufgabe abbrechen – ohne KI. */
  verwerfen(nr: number): void {
    const eintrag = this.holeOffenen(nr, ["freigabe", "rueckfrage"]);
    if (this.chat.entscheide(nr, { art: "verworfen" })) return;
    postfach.schliesseAb(this.db, nr, { status: "verworfen" });
    const was = eintrag.art === "freigabe" ? "Vorschlag" : "Rückfrage";
    this.hinweis(eintrag, `${was} #${nr} verworfen. Aufgabe abgebrochen.`);
    this.chat.aktualisiereStatus(eintrag.aufgabeId, "abgebrochen");
  }

  zurKenntnis(nr: number): void {
    this.holeOffenen(nr, ["meldung"]);
    postfach.schliesseAb(this.db, nr, { status: "zur_kenntnis" });
    meldeUebersicht({ bereich: "postfach" });
  }

  /**
   * Davids Antwort geht an den Agenten, mit dem Kontext der Aufgabe (E-46).
   * Bei einem offenen Vorschlag ist das ein Änderungswunsch: Der Vorschlag wird nicht ausgeführt.
   * Antworten geht bei jedem Eintrag, auch bei erledigten.
   */
  antworten(nr: number, text: string): void {
    const eintrag = postfach.holeEintrag(this.db, nr);
    if (!eintrag) throw new Fehler(404, `Eintrag #${nr} nicht gefunden.`);
    if (this.inAusfuehrung.has(nr)) throw new Fehler(409, `Vorschlag #${nr} wird gerade ausgeführt.`);
    const offen = postfach.offeneStatus.includes(eintrag.status);
    if (offen && this.chat.entscheide(nr, { art: "antwort", text })) return;
    const name = eintrag.art === "rueckfrage" ? "" : ` (${laufzeitName(eintrag)})`;

    let anAgent: string;
    if (eintrag.art === "freigabe" && offen) {
      postfach.schliesseAb(this.db, nr, { status: "aenderung_angefordert", antwort: text });
      this.hinweis(eintrag, `Änderungswunsch zu Vorschlag #${nr}:`, text);
      anAgent =
        `Änderungswunsch zu Vorschlag #${nr}${name}. Der Vorschlag wurde NICHT ausgeführt. Der Nutzer schreibt:\n${text}\n\n` +
        `Überarbeite ihn und lege ihn neu vor.`;
    } else if (eintrag.art === "rueckfrage" && offen) {
      postfach.schliesseAb(this.db, nr, { status: "beantwortet", antwort: text });
      this.hinweis(eintrag, `Antwort auf Rückfrage #${nr}:`, text);
      anAgent = `Antwort auf deine Rückfrage #${nr}:\n${text}`;
    } else {
      // Offene Meldung: damit erledigt. Erledigter Eintrag: Status bleibt, nur die Antwort wird vermerkt.
      if (offen) postfach.schliesseAb(this.db, nr, { status: "beantwortet", antwort: text });
      else postfach.setzeAntwort(this.db, nr, text);
      this.hinweis(eintrag, `Rückmeldung zu Eintrag #${nr}:`, text);
      anAgent = `Rückmeldung des Nutzers zu Postfach-Eintrag #${nr}${name}:\n${text}`;
    }
    this.chat.setzeFortAusPostfach(eintrag.aufgabeId, anAgent);
  }

  private holeOffenen(nr: number, erlaubteArten: PostfachEintrag["art"][]): PostfachEintrag {
    const eintrag = postfach.holeEintrag(this.db, nr);
    if (!eintrag) throw new Fehler(404, `Eintrag #${nr} nicht gefunden.`);
    if (!erlaubteArten.includes(eintrag.art)) throw new Fehler(400, `Das geht bei diesem Eintrag nicht.`);
    if (!postfach.offeneStatus.includes(eintrag.status)) throw new Fehler(409, `Eintrag #${nr} ist schon erledigt.`);
    return eintrag;
  }

  /** Vermerk im Chat der Aufgabe, damit der Verlauf zeigt, was im Postfach passiert ist. */
  private hinweis(eintrag: PostfachEintrag, text: string, details?: string): void {
    this.chat.melde(eintrag.aufgabeId, { art: "postfach_aktion", postfachNr: eintrag.nr, text, ...(details ? { details } : {}) });
    meldeUebersicht({ bereich: "postfach" });
  }
}
