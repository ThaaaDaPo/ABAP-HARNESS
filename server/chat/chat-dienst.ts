// Verbindet Aufgaben, Agenten, Laufzeit, Datenbank und Live-Anzeige.
// Hier steht der Ablauf "Nachricht einreihen → Agent arbeitet → Ereignisse speichern und anzeigen".
//
// Jeder Chat läuft für sich (E-57): Chats arbeiten gleichzeitig, auch zwei Chats desselben Agenten.
// Jeder Chat hat seine eigene Sitzung. Innerhalb eines Chats geht es der Reihe nach – kommt während
// eines Laufs etwas dazu (Fortsetzung aus dem Postfach), wartet es in der Warteschlange.
//
// Freigaben und Rückfragen im Chat (E-54): Der Agent wartet mitten im Tool-Aufruf auf David. Hat
// David entschieden, geht der Aufruf an genau der Stelle weiter.
import { randomUUID } from "node:crypto";
import type { AufgabenStatus, Ereignis, ModellInfo, ModellWahl } from "../../gemeinsam/typen.ts";
import { holeAgent, standardAgentId } from "../datenbank/agenten.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { sollGespeichertWerden, speichereEreignis } from "../datenbank/ereignisse.ts";
import { holeAlleServer } from "../datenbank/mcp-server.ts";
import { hatOffeneFreigabeOderRueckfrage, holeEintrag, offeneRueckfragen, schliesseAb } from "../datenbank/postfach.ts";
import { speichereVerbrauch, summeDesLaufs } from "../datenbank/verbrauch.ts";
import * as warteschlange from "../datenbank/warteschlange.ts";
import { ToolGateway } from "../gateway/gateway.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { instructionsText, skillsFuerSitzung } from "../instructions/instructions-ordner.ts";
import type { AgentenLaufzeit, AgentenSitzung, SitzungsEinstellungen } from "../laufzeit/laufzeit.ts";
import { WartendeEntscheidungen, type NutzerEntscheidung } from "../postfach/entscheidungen.ts";
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
  /** Chats, in denen gerade ein Lauf steckt – auch wenn er gerade auf David wartet. */
  private laufend = new Set<string>();
  /** Aufgaben, deren Agent, Modell oder Konfiguration sich geändert hat: Die Sitzung wird vor dem nächsten Lauf neu aufgebaut. */
  private veraltet = new Set<string>();
  /** Tool-Aufrufe im Chat, die auf Davids Entscheidung warten */
  private entscheidungen = new WartendeEntscheidungen();
  /** Aufgaben, die nach dem Ende des Laufs als abgebrochen gelten (Vorschlag verworfen) */
  private abgebrochenNachLauf = new Set<string>();
  /** Je laufendem Chat: Kennung des Laufs und Agent – damit der Verbrauch einer Nachricht zusammenbleibt */
  private laeufe = new Map<string, { lauf: string; agentId: string }>();

  constructor(db: Datenbank, laufzeit: AgentenLaufzeit, einstellungen: Einstellungen) {
    this.db = db;
    this.laufzeit = laufzeit;
    this.einstellungen = einstellungen;
  }

  /** Nach dem Start: Was beim Beenden lief, bekommt einen Hinweis und seinen Status neu; was eingereiht war, kommt dran. */
  starte(): void {
    for (const aufgabe of aufgaben.holeAlleAufgaben(this.db)) {
      if (aufgabe.status !== "arbeitet") continue;
      this.melde(aufgabe.id, { art: "abbruch", text: "Unterbrochen: Die App wurde beendet, während der Agent arbeitete." });
      this.aktualisiereStatus(aufgabe.id);
    }
    this.arbeiteWeiter();
  }

  /** Legt einen Chat an. Chats ohne Inhalt werden dabei weggeräumt, damit sich keine leeren sammeln. */
  async neueAufgabe(agentId: string = standardAgentId): Promise<aufgaben.AufgabeIntern> {
    if (!holeAgent(this.db, agentId)) throw new Fehler(400, `Den Agenten ${agentId} gibt es nicht.`);
    for (const id of aufgaben.holeLeereAufgaben(this.db)) await this.loescheAufgabe(id);
    const aufgabe = aufgaben.legeAufgabeAn(this.db, neuerTitel, agentId);
    meldeUebersicht({ bereich: "aufgaben" });
    return aufgabe;
  }

  /** Löscht den Chat mit Verlauf, Postfach-Einträgen, Warteschlange und gespeicherter Sitzung. */
  async loescheAufgabe(aufgabeId: string): Promise<void> {
    const aufgabe = aufgaben.holeAufgabe(this.db, aufgabeId);
    if (!aufgabe) throw new Fehler(404, "Aufgabe nicht gefunden");
    // Wartet der Agent hier auf David, gilt der Vorschlag als verworfen und der Lauf endet.
    const wartetHier = this.wartetAufDavid(aufgabeId);
    if (this.laufend.has(aufgabeId) && !wartetHier) throw new Fehler(409, "Der Agent arbeitet gerade an diesem Chat. Bitte erst abbrechen.");
    for (const nr of this.entscheidungen.vonAufgabe(aufgabeId)) this.entscheidungen.nimm(nr)?.loese({ art: "verworfen" });

    const sitzung = this.sitzungen.get(aufgabeId);
    this.sitzungen.delete(aufgabeId);
    this.veraltet.delete(aufgabeId);
    if (wartetHier) await sitzung?.abbrechen().catch(() => {});
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

  /**
   * Anderer Agent für den Chat (E-56). Gilt ab der nächsten Nachricht: Die Sitzung wird mit Auftrag,
   * Servern und Regeln des neuen Agenten fortgesetzt, der Verlauf bleibt.
   */
  setzeAgent(aufgabeId: string, agentId: string): aufgaben.AufgabeIntern {
    if (!aufgaben.holeAufgabe(this.db, aufgabeId)) throw new Fehler(404, "Aufgabe nicht gefunden");
    if (!holeAgent(this.db, agentId)) throw new Fehler(400, `Den Agenten ${agentId} gibt es nicht.`);
    aufgaben.setzeAgent(this.db, aufgabeId, agentId);
    if (this.sitzungen.has(aufgabeId)) this.veraltet.add(aufgabeId);
    meldeUebersicht({ bereich: "aufgaben" });
    return aufgaben.holeAufgabe(this.db, aufgabeId)!;
  }

  /** Arbeitet der Agent in diesem Chat, wartet er auf David oder ist eine Nachricht eingereiht? */
  istBeschaeftigt(aufgabeId: string): boolean {
    return this.laufend.has(aufgabeId) || warteschlange.stehtAn(this.db, aufgabeId);
  }

  /** Arbeitet der Agent gerade in irgendeinem Chat? (Dann lässt er sich nicht löschen.) */
  agentArbeitet(agentId: string): boolean {
    return [...this.laufend].some((id) => aufgaben.holeAufgabe(this.db, id)?.agentId === agentId);
  }

  /** Prüft, ob die Laufzeit die Wahl kennt. Auch für das Standardmodell eines Agenten. */
  async pruefeModellWahl(wahl: ModellWahl): Promise<void> {
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
    const wartend = this.entscheidungen.vonAufgabe(aufgabeId);
    if ((this.laufend.has(aufgabeId) && wartend.length === 0) || aufgabe.status === "eingereiht") {
      throw new Fehler(409, "Der Agent ist mit diesem Chat noch beschäftigt. Bitte warten oder abbrechen.");
    }

    if (aufgabe.titel === neuerTitel) {
      aufgaben.setzeTitel(this.db, aufgabeId, text.replace(/\s+/g, " ").trim().slice(0, 60));
    }
    this.melde(aufgabeId, { art: "nutzer_nachricht", text });

    // Wartet der Agent gerade auf David, ist die Nachricht die Antwort darauf: bei einer Rückfrage
    // die Antwort, bei einem Vorschlag der Änderungswunsch (E-54).
    if (wartend.length > 0) {
      for (const nr of wartend) this.entscheide(nr, { art: "antwort", text });
      return;
    }

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
   * David hat über einen Vorschlag oder eine Rückfrage entschieden, auf die der Agent im Chat wartet.
   * Der wartende Aufruf läuft sofort weiter. False, wenn niemand darauf wartet (dann erledigt der
   * Postfach-Dienst den Eintrag ohne wartenden Agenten).
   */
  entscheide(nr: number, entscheidung: NutzerEntscheidung): boolean {
    const wartend = this.entscheidungen.nimm(nr);
    if (!wartend) return false;
    const eintrag = holeEintrag(this.db, nr);
    const { aufgabeId } = wartend;

    if (entscheidung.art === "freigegeben") schliesseAb(this.db, nr, { status: "freigegeben" });
    else if (entscheidung.art === "verworfen") schliesseAb(this.db, nr, { status: "verworfen" });
    else {
      const status = eintrag?.art === "rueckfrage" ? "beantwortet" : "aenderung_angefordert";
      schliesseAb(this.db, nr, { status, antwort: entscheidung.text });
    }
    meldeUebersicht({ bereich: "postfach" });

    if (entscheidung.art === "verworfen") this.abgebrochenNachLauf.add(aufgabeId);
    wartend.loese(entscheidung);
    // Verworfen: Der Agent soll nichts mehr schreiben – Lauf gleich anhalten.
    if (entscheidung.art === "verworfen") void this.sitzungen.get(aufgabeId)?.abbrechen();
    // Hat der Agent mehrere Aufrufe gleichzeitig gestellt, wartet er ggf. noch auf die übrigen.
    this.setzeStatus(aufgabeId, this.wartetAufDavid(aufgabeId) ? "wartet" : "arbeitet");
    return true;
  }

  /** Der Agent wartet im Chat auf David. Der Lauf bleibt bestehen, nur der Status zeigt „wartet“. */
  private warteAufDavid(aufgabeId: string, nr: number): Promise<NutzerEntscheidung> {
    const entscheidung = this.entscheidungen.warte(nr, aufgabeId);
    this.setzeStatus(aufgabeId, "wartet");
    return entscheidung;
  }

  private wartetAufDavid(aufgabeId: string): boolean {
    return this.entscheidungen.vonAufgabe(aufgabeId).length > 0;
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

  /** Hält den Agenten an oder nimmt die Aufgabe aus der Warteschlange. Im Verlauf bleibt ein Hinweis. */
  async brecheAb(aufgabeId: string): Promise<void> {
    if (this.laufend.has(aufgabeId)) {
      this.melde(aufgabeId, { art: "abbruch", text: "Von dir abgebrochen." });
      // Wartet ein Aufruf auf David, gilt er als verworfen – sonst bliebe er hängen.
      for (const nr of this.entscheidungen.vonAufgabe(aufgabeId)) this.entscheide(nr, { art: "verworfen" });
      await this.sitzungen.get(aufgabeId)?.abbrechen();
      return;
    }
    if (warteschlange.stehtAn(this.db, aufgabeId)) this.melde(aufgabeId, { art: "abbruch", text: "Aus der Warteschlange genommen." });
    warteschlange.entferne(this.db, aufgabeId);
    this.aktualisiereStatus(aufgabeId);
  }

  /**
   * Setzt den Status danach, was ansteht: eingereiht, wartet aufs Postfach oder bereit.
   * `sonst` gilt, wenn nichts mehr ansteht (z. B. "erledigt" nach der Freigabe zum Abschluss).
   * Während ein Lauf im Chat steckt, bestimmt der Lauf den Status; an seinem Ende wird neu bestimmt.
   */
  aktualisiereStatus(aufgabeId: string, sonst: AufgabenStatus = "bereit"): void {
    if (this.laufend.has(aufgabeId)) return;
    let status = sonst;
    if (warteschlange.stehtAn(this.db, aufgabeId)) status = "eingereiht";
    else if (hatOffeneFreigabeOderRueckfrage(this.db, aufgabeId)) status = "wartet";
    this.setzeStatus(aufgabeId, status);
  }

  async beenden(): Promise<void> {
    for (const sitzung of this.sitzungen.values()) await sitzung.trennen().catch(() => {});
    await this.laufzeit.beenden();
  }

  /** Startet alles aus der Warteschlange, was jetzt drankommen kann – jeden Chat für sich. */
  private arbeiteWeiter(): void {
    for (;;) {
      const naechste = warteschlange.nimmNaechste(this.db, this.laufend);
      if (!naechste) return;
      const aufgabe = aufgaben.holeAufgabe(this.db, naechste.aufgabeId);
      if (aufgabe) this.starteLauf(aufgabe, naechste.text);
    }
  }

  private starteLauf(aufgabe: aufgaben.AufgabeIntern, text: string): void {
    this.laufend.add(aufgabe.id);
    this.laeufe.set(aufgabe.id, { lauf: randomUUID(), agentId: aufgabe.agentId });
    this.setzeStatus(aufgabe.id, "arbeitet");
    this.lasseAgentArbeiten(aufgabe, text)
      .catch((fehler) => this.melde(aufgabe.id, { art: "fehler", meldung: String(fehler?.message ?? fehler) }))
      .finally(() => {
        this.laufend.delete(aufgabe.id);
        this.meldeLaufVerbrauch(aufgabe.id);
        this.aktualisiereStatus(aufgabe.id, this.abgebrochenNachLauf.delete(aufgabe.id) ? "abgebrochen" : "bereit");
        this.arbeiteWeiter();
      });
  }

  private async lasseAgentArbeiten(aufgabe: aufgaben.AufgabeIntern, text: string): Promise<void> {
    const sitzung = await this.holeSitzung(aufgabe);
    const agent = this.agentDer(aufgabe);
    this.melde(aufgabe.id, { art: "agent", agentId: agent.id, name: agent.name });
    // Was David inzwischen ohne den Agenten getan hat (z. B. Rückgängig), steht vor der Nachricht.
    const hinweis = aufgaben.nimmHinweiseFuerAgent(this.db, aufgabe.id);
    await sitzung.sende(hinweis ? `[Hinweis der App: ${hinweis}]\n\n${text}` : text);
  }

  /** Am Ende eines Laufs: was er verbraucht hat, klein unter der Antwort. */
  private meldeLaufVerbrauch(aufgabeId: string): void {
    const lauf = this.laeufe.get(aufgabeId);
    this.laeufe.delete(aufgabeId);
    if (!lauf) return;
    const summe = summeDesLaufs(this.db, lauf.lauf);
    if (summe.aufrufe > 0) this.melde(aufgabeId, { art: "lauf_verbrauch", ...summe });
  }

  /** Nimmt die offene Sitzung, setzt eine gespeicherte fort oder startet eine neue. */
  private async holeSitzung(aufgabe: aufgaben.AufgabeIntern): Promise<AgentenSitzung> {
    // Agent, Modell oder Konfiguration geändert: Sitzung aus dem Speicher nehmen und mit den neuen
    // Einstellungen fortsetzen. Der Verlauf bleibt erhalten, weil die Sitzung gespeichert ist.
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
   * Nach Änderungen an Agenten, MCP-Servern, Regeln oder Instructions: Sitzungen ohne Lauf aus dem
   * Speicher nehmen; Sitzungen mit Lauf vor ihrem nächsten Lauf neu aufbauen. Die nächste Nachricht
   * setzt sie dann mit der neuen Konfiguration fort. (Regeln prüft das Gateway ohnehin bei jedem Aufruf neu.)
   */
  async konfigurationGeaendert(): Promise<void> {
    for (const [aufgabeId, sitzung] of this.sitzungen) {
      if (this.laufend.has(aufgabeId)) {
        this.veraltet.add(aufgabeId);
        continue;
      }
      this.sitzungen.delete(aufgabeId);
      await sitzung.trennen().catch(() => {});
    }
  }

  /** Der Agent des Chats. Gibt es ihn nicht mehr, übernimmt der Standard-Agent. */
  private agentDer(aufgabe: aufgaben.AufgabeIntern) {
    const agent = holeAgent(this.db, aufgabe.agentId) ?? holeAgent(this.db, standardAgentId);
    if (!agent) throw new Error("Es gibt keinen Agenten. Die App legt den Standard-Agenten beim Start an – bitte neu starten.");
    return agent;
  }

  private sitzungsEinstellungen(aufgabe: aufgaben.AufgabeIntern): SitzungsEinstellungen {
    const aufgabeId = aufgabe.id;
    const agent = this.agentDer(aufgabe);
    // Im Chat warten Freigaben und Rückfragen auf David; ohne ihn (Workflow) wird nicht gewartet.
    const imChat = aufgabe.herkunft === "chat";
    const kontext = {
      db: this.db,
      aufgabeId,
      melde: (ereignis: Ereignis) => this.melde(aufgabeId, ereignis),
      ...(imChat ? { warteAufNutzer: (nr: number) => this.warteAufDavid(aufgabeId, nr) } : {}),
    };
    // Hat der Chat ein eigenes Modell gewählt, gilt das (E-51); sonst das Standardmodell des Agenten.
    const wahl = aufgabe.modellWahl.modell ? aufgabe.modellWahl : agent.modellWahl;
    const ordner = this.einstellungen.instructionsOrdner;
    const skills = skillsFuerSitzung(ordner, agent.skills);
    return {
      agentName: agent.name,
      // Zugeordnete Instructions hängen hinter dem Auftrag – so sind sie eindeutig drin (auch in der Simulation sichtbar).
      auftrag: [agent.auftrag, instructionsText(ordner, agent.instructions)].filter(Boolean).join("\n\n"),
      modell: wahl.modell,
      denkaufwand: wahl.modell ? wahl.denkaufwand : "",
      kontext: wahl.modell ? wahl.kontext : "standard",
      workspaceOrdner: this.einstellungen.workspaceOrdner,
      mcpServer: holeAlleServer(this.db).filter((s) => agent.mcpServer.includes(s.schluessel)),
      gateway: new ToolGateway({ ...kontext, agentId: agent.id }),
      plattformTools: erstellePlattformTools(kontext),
      skillOrdner: skills.ordner,
      abgeschalteteSkills: skills.abgeschaltet,
      imChat,
    };
  }

  private setzeStatus(aufgabeId: string, status: AufgabenStatus): void {
    aufgaben.setzeStatus(this.db, aufgabeId, status);
    this.melde(aufgabeId, { art: "status", status });
    meldeUebersicht({ bereich: "aufgaben" });
  }

  /** Speichert das Ereignis (wenn nötig) und zeigt es live an. */
  melde(aufgabeId: string, ereignis: Ereignis): void {
    // Verbrauch eines Modellaufrufs: in die eigene Tabelle, die Summe kommt am Ende des Laufs.
    if (ereignis.art === "verbrauch") {
      const { art: _art, ...werte } = ereignis;
      const lauf = this.laeufe.get(aufgabeId);
      const agentId = lauf?.agentId ?? aufgaben.holeAufgabe(this.db, aufgabeId)?.agentId ?? standardAgentId;
      speichereVerbrauch(this.db, { ...werte, aufgabeId, agentId, lauf: lauf?.lauf ?? "ohne-lauf" });
      return;
    }
    // Ein inzwischen gelöschter Chat bekommt nichts mehr gespeichert (z. B. Ende einer Freigabe).
    if (sollGespeichertWerden(ereignis) && aufgaben.holeAufgabe(this.db, aufgabeId)) speichereEreignis(this.db, aufgabeId, ereignis);
    verteile(aufgabeId, ereignis);
    if (ereignis.art === "postfach") meldeUebersicht({ bereich: "postfach" });
  }
}
