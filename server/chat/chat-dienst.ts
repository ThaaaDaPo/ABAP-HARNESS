// Verbindet Aufgaben, Agenten-Laufzeit, Datenbank und Live-Anzeige.
// Hier steht der Ablauf "Nachricht einreihen → Agent arbeitet → Ereignisse speichern und anzeigen".
//
// Der Agent arbeitet immer nur an einer Aufgabe (E-45). Alles Weitere – neue Nachrichten in anderen
// Chats und Fortsetzungen nach Postfach-Aktionen – wartet in der Warteschlange und kommt dran,
// sobald er fertig ist.
import type { AufgabenStatus, Ereignis, ModellInfo, ModellWahl } from "../../gemeinsam/typen.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { sollGespeichertWerden, speichereEreignis } from "../datenbank/ereignisse.ts";
import { holeAlleServer } from "../datenbank/mcp-server.ts";
import { hatOffeneFreigabeOderRueckfrage, offeneRueckfragen, schliesseAb } from "../datenbank/postfach.ts";
import * as warteschlange from "../datenbank/warteschlange.ts";
import { standardAgentId, ToolGateway } from "../gateway/gateway.ts";
import type { Einstellungen } from "../einstellungen.ts";
import type { AgentenLaufzeit, AgentenSitzung, SitzungsEinstellungen } from "../laufzeit/laufzeit.ts";
import { erstellePlattformTools } from "../postfach/plattform-tools.ts";
import { Fehler } from "../fehler.ts";
import { meldeUebersicht, verteile } from "./live-verteiler.ts";

const neuerTitel = "Neuer Chat";

export class ChatDienst {
  private db: Datenbank;
  private laufzeit: AgentenLaufzeit;
  private einstellungen: Einstellungen;
  /** Offene Sitzungen im Speicher, je Aufgabe. */
  private sitzungen = new Map<string, AgentenSitzung>();
  /** Die Aufgabe, an der der Agent gerade arbeitet. */
  private laufend: string | null = null;
  /** Aufgaben, deren Modellwahl sich geändert hat: Die Sitzung wird vor dem nächsten Lauf neu aufgebaut. */
  private veraltet = new Set<string>();

  constructor(db: Datenbank, laufzeit: AgentenLaufzeit, einstellungen: Einstellungen) {
    this.db = db;
    this.laufzeit = laufzeit;
    this.einstellungen = einstellungen;
  }

  /** Nach dem Start: Was beim Beenden lief, bekommt seinen Status neu; was eingereiht war, kommt dran. */
  starte(): void {
    for (const aufgabe of aufgaben.holeAlleAufgaben(this.db)) {
      if (aufgabe.status === "arbeitet") this.aktualisiereStatus(aufgabe.id);
    }
    this.arbeiteWeiter();
  }

  /** Legt einen Chat an. Chats ohne Inhalt werden dabei weggeräumt, damit sich keine leeren sammeln. */
  async neueAufgabe(): Promise<aufgaben.AufgabeIntern> {
    for (const id of aufgaben.holeLeereAufgaben(this.db)) await this.loescheAufgabe(id);
    const aufgabe = aufgaben.legeAufgabeAn(this.db, neuerTitel);
    meldeUebersicht({ bereich: "aufgaben" });
    return aufgabe;
  }

  /** Löscht den Chat mit Verlauf, Postfach-Einträgen, Warteschlange und gespeicherter Sitzung. */
  async loescheAufgabe(aufgabeId: string): Promise<void> {
    const aufgabe = aufgaben.holeAufgabe(this.db, aufgabeId);
    if (!aufgabe) throw new Fehler(404, "Aufgabe nicht gefunden");
    if (this.laufend === aufgabeId) throw new Fehler(409, "Der Agent arbeitet gerade an diesem Chat. Bitte erst abbrechen.");

    const sitzung = this.sitzungen.get(aufgabeId);
    this.sitzungen.delete(aufgabeId);
    this.veraltet.delete(aufgabeId);
    await sitzung?.trennen().catch(() => {});
    if (aufgabe.sitzungId) await this.laufzeit.loescheSitzung(aufgabe.sitzungId).catch(() => {});

    aufgaben.loescheAufgabe(this.db, aufgabeId);
    meldeUebersicht({ bereich: "aufgaben" });
    meldeUebersicht({ bereich: "postfach" });
  }

  modelle(): Promise<ModellInfo[]> {
    return this.laufzeit.modelle();
  }

  /** Neue Modellwahl für den Chat. Gilt ab der nächsten Nachricht, auch wenn der Agent gerade arbeitet. */
  async setzeModellWahl(aufgabeId: string, wahl: ModellWahl): Promise<aufgaben.AufgabeIntern> {
    if (!aufgaben.holeAufgabe(this.db, aufgabeId)) throw new Fehler(404, "Aufgabe nicht gefunden");
    await this.pruefeModellWahl(wahl);
    aufgaben.setzeModellWahl(this.db, aufgabeId, wahl);
    if (this.sitzungen.has(aufgabeId)) this.veraltet.add(aufgabeId);
    meldeUebersicht({ bereich: "aufgaben" });
    return aufgaben.holeAufgabe(this.db, aufgabeId)!;
  }

  private async pruefeModellWahl(wahl: ModellWahl): Promise<void> {
    if (wahl.kontext !== "standard" && wahl.kontext !== "lang") throw new Fehler(400, "Kontext muss standard oder lang sein.");
    if (!wahl.modell) {
      // Automatische Auswahl: Feineinstellungen hängen am Modell und gelten dann nicht.
      if (wahl.denkaufwand || wahl.kontext === "lang") throw new Fehler(400, "Thinking Effort und langer Kontext brauchen ein gewähltes Modell.");
      return;
    }
    const modell = (await this.laufzeit.modelle()).find((m) => m.id === wahl.modell);
    if (!modell) throw new Fehler(400, `Das Modell ${wahl.modell} steht nicht zur Wahl.`);
    if (wahl.denkaufwand && !modell.denkStufen.includes(wahl.denkaufwand)) {
      throw new Fehler(400, `${modell.name} kennt den Thinking Effort ${wahl.denkaufwand} nicht.`);
    }
    if (wahl.kontext === "lang" && !modell.langerKontext) throw new Fehler(400, `${modell.name} hat keinen langen Kontext.`);
  }

  /**
   * Nimmt die Nachricht an und reiht sie für den Agenten ein. Kehrt sofort zurück;
   * was der Agent tut, kommt über die Live-Anzeige.
   */
  nimmNachrichtAn(aufgabeId: string, text: string): void {
    const aufgabe = aufgaben.holeAufgabe(this.db, aufgabeId);
    if (!aufgabe) throw new Fehler(404, "Aufgabe nicht gefunden");
    if (aufgabe.status === "arbeitet" || aufgabe.status === "eingereiht") {
      throw new Fehler(409, "Der Agent ist mit diesem Chat noch beschäftigt. Bitte warten oder abbrechen.");
    }

    if (aufgabe.titel === neuerTitel) {
      aufgaben.setzeTitel(this.db, aufgabeId, text.replace(/\s+/g, " ").trim().slice(0, 60));
    }
    this.melde(aufgabeId, { art: "nutzer_nachricht", text });
    warteschlange.reiheEin(this.db, aufgabeId, this.mitRueckfrageBezug(aufgabeId, text), false);
    this.setzeStatus(aufgabeId, "eingereiht");
    this.arbeiteWeiter();
  }

  /**
   * Hat der Agent im Chat eine Rückfrage gestellt, ist Davids nächste Nachricht die Antwort darauf.
   * Die Rückfrage gilt damit als beantwortet, und der Agent erfährt, worauf sich die Nachricht bezieht.
   */
  private mitRueckfrageBezug(aufgabeId: string, text: string): string {
    const offen = offeneRueckfragen(this.db, aufgabeId);
    if (offen.length === 0) return text;
    for (const nr of offen) schliesseAb(this.db, nr, { status: "beantwortet", antwort: text });
    const nummern = offen.map((nr) => `#${nr}`).join(", ");
    return `Antwort auf deine Rückfrage ${nummern}:\n${text}`;
  }

  /**
   * Fortsetzung nach einer Postfach-Aktion (Freigabe zum Weitermachen, Änderungswunsch, Antwort).
   * Was im Chat dazu erscheint, meldet der Postfach-Dienst selbst.
   */
  setzeFortAusPostfach(aufgabeId: string, text: string): void {
    warteschlange.reiheEin(this.db, aufgabeId, text, true);
    this.aktualisiereStatus(aufgabeId);
    this.arbeiteWeiter();
  }

  /** Hält den Agenten an oder nimmt die Aufgabe aus der Warteschlange. */
  async brecheAb(aufgabeId: string): Promise<void> {
    if (this.laufend === aufgabeId) {
      await this.sitzungen.get(aufgabeId)?.abbrechen();
      return;
    }
    warteschlange.entferne(this.db, aufgabeId);
    this.aktualisiereStatus(aufgabeId);
  }

  /**
   * Setzt den Status danach, was ansteht: eingereiht, wartet aufs Postfach oder bereit.
   * `sonst` gilt, wenn nichts mehr ansteht (z. B. "erledigt" nach der Freigabe zum Abschluss).
   * Während der Agent an der Aufgabe arbeitet, bleibt sie "arbeitet"; am Ende des Laufs wird neu bestimmt.
   */
  aktualisiereStatus(aufgabeId: string, sonst: AufgabenStatus = "bereit"): void {
    if (this.laufend === aufgabeId) return;
    let status = sonst;
    // Eine Fortsetzung, die noch auf weitere Freigaben wartet, zählt als "wartet", nicht als eingereiht.
    if (warteschlange.stehtAn(this.db, aufgabeId)) status = "eingereiht";
    else if (hatOffeneFreigabeOderRueckfrage(this.db, aufgabeId)) status = "wartet";
    this.setzeStatus(aufgabeId, status);
  }

  async beenden(): Promise<void> {
    for (const sitzung of this.sitzungen.values()) await sitzung.trennen().catch(() => {});
    await this.laufzeit.beenden();
  }

  /** Startet die nächste Aufgabe aus der Warteschlange, wenn der Agent frei ist. */
  private arbeiteWeiter(): void {
    if (this.laufend) return;
    const naechste = warteschlange.nimmNaechste(this.db);
    if (!naechste) return;

    const aufgabe = aufgaben.holeAufgabe(this.db, naechste.aufgabeId);
    if (!aufgabe) return this.arbeiteWeiter();

    this.laufend = aufgabe.id;
    this.setzeStatus(aufgabe.id, "arbeitet");
    this.lasseAgentArbeiten(aufgabe, naechste.text)
      .catch((fehler) => this.melde(aufgabe.id, { art: "fehler", meldung: String(fehler?.message ?? fehler) }))
      .finally(() => {
        this.laufend = null;
        this.aktualisiereStatus(aufgabe.id);
        this.arbeiteWeiter();
      });
  }

  private async lasseAgentArbeiten(aufgabe: aufgaben.AufgabeIntern, text: string): Promise<void> {
    const sitzung = await this.holeSitzung(aufgabe);
    await sitzung.sende(text);
  }

  /** Nimmt die offene Sitzung, setzt eine gespeicherte fort oder startet eine neue. */
  private async holeSitzung(aufgabe: aufgaben.AufgabeIntern): Promise<AgentenSitzung> {
    // Modellwahl geändert: Sitzung aus dem Speicher nehmen und mit der neuen Wahl fortsetzen.
    // Der Verlauf bleibt erhalten, weil die Sitzung gespeichert ist.
    if (this.veraltet.delete(aufgabe.id)) {
      await this.sitzungen.get(aufgabe.id)?.trennen().catch(() => {});
      this.sitzungen.delete(aufgabe.id);
    }
    const offen = this.sitzungen.get(aufgabe.id);
    if (offen) return offen;

    const empfaenger = (ereignis: Ereignis) => this.melde(aufgabe.id, ereignis);
    const einstellungen = this.sitzungsEinstellungen(aufgabe);
    const sitzung = aufgabe.sitzungId
      ? await this.laufzeit.setzeFort(aufgabe.sitzungId, einstellungen, empfaenger)
      : await this.laufzeit.starte(einstellungen, empfaenger);

    aufgaben.setzeSitzungId(this.db, aufgabe.id, sitzung.id);
    this.sitzungen.set(aufgabe.id, sitzung);
    return sitzung;
  }

  /**
   * Nach Änderungen an MCP-Servern oder Regeln: Sitzungen, in denen gerade nichts läuft, aus dem
   * Speicher nehmen. Die nächste Nachricht setzt sie fort – dann mit den neuen Servern und Tools.
   * (Die Regeln selbst prüft das Gateway ohnehin bei jedem Aufruf neu.)
   */
  async konfigurationGeaendert(): Promise<void> {
    for (const [aufgabeId, sitzung] of this.sitzungen) {
      if (this.laufend === aufgabeId) continue;
      this.sitzungen.delete(aufgabeId);
      await sitzung.trennen().catch(() => {});
    }
  }

  private sitzungsEinstellungen(aufgabe: aufgaben.AufgabeIntern): SitzungsEinstellungen {
    const aufgabeId = aufgabe.id;
    const kontext = { db: this.db, aufgabeId, melde: (ereignis: Ereignis) => this.melde(aufgabeId, ereignis) };
    const { modell, denkaufwand, kontext: kontextGroesse } = aufgabe.modellWahl;
    return {
      auftrag: this.einstellungen.agent.auftrag,
      // Ohne Wahl im Chat gilt das Modell aus einstellungen.json – dann ohne Feineinstellungen.
      modell: modell || this.einstellungen.modell,
      denkaufwand: modell ? denkaufwand : "",
      kontext: modell ? kontextGroesse : "standard",
      workspaceOrdner: this.einstellungen.workspaceOrdner,
      mcpServer: holeAlleServer(this.db),
      gateway: new ToolGateway({ ...kontext, agentId: standardAgentId }),
      plattformTools: erstellePlattformTools(kontext),
    };
  }

  private setzeStatus(aufgabeId: string, status: AufgabenStatus): void {
    aufgaben.setzeStatus(this.db, aufgabeId, status);
    this.melde(aufgabeId, { art: "status", status });
    meldeUebersicht({ bereich: "aufgaben" });
  }

  /** Speichert das Ereignis (wenn nötig) und zeigt es live an. */
  melde(aufgabeId: string, ereignis: Ereignis): void {
    // Ein inzwischen gelöschter Chat bekommt nichts mehr gespeichert (z. B. Ende einer Freigabe).
    if (sollGespeichertWerden(ereignis) && aufgaben.holeAufgabe(this.db, aufgabeId)) speichereEreignis(this.db, aufgabeId, ereignis);
    verteile(aufgabeId, ereignis);
    if (ereignis.art === "postfach") meldeUebersicht({ bereich: "postfach" });
  }
}
