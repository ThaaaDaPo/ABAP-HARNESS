// Änderungen des ADT-MCP in der App (E-31): den Änderungssatz für den Vergleich im Chat liefern und
// eine Änderung rückgängig machen – ohne KI. Ausgeführt wird im ADT-MCP selbst (Tool
// zuruecknehmen), damit SAP-Zugriff, Paket-Sperre und Workspace an einer Stelle bleiben. Dafür startet
// die App einen eigenen ADT-MCP-Prozess mit --app; nur dort gibt es dieses Tool.
import type { AdtAenderung, McpServerDaten } from "../../gemeinsam/typen.ts";
import { leseAenderung } from "../../mcp/adt/aenderungen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";
import type { McpAufrufer } from "../mcp/mcp-aufrufer.ts";
import { adtSchluessel } from "./adt-einrichten.ts";

export class AenderungenDienst {
  private db: Datenbank;
  private einstellungen: Einstellungen;
  private chat: ChatDienst;
  private aufrufer: McpAufrufer;
  /** Änderungen, die gerade zurückgenommen werden – gegen doppeltes Klicken */
  private inArbeit = new Set<string>();

  constructor(db: Datenbank, einstellungen: Einstellungen, chat: ChatDienst, aufrufer: McpAufrufer) {
    this.db = db;
    this.einstellungen = einstellungen;
    this.chat = chat;
    this.aufrufer = aufrufer;
  }

  hole(id: string): AdtAenderung {
    const aenderung = leseAenderung(this.einstellungen.workspaceOrdner, id);
    if (!aenderung) throw new Fehler(404, `Die Änderung ${id} gibt es nicht (mehr) im Workspace.`);
    return aenderung;
  }

  /** Macht die Änderung rückgängig und vermerkt es im Chat; der Agent erfährt es mit der nächsten Nachricht. */
  async nimmZurueck(id: string, aufgabeId: string): Promise<AdtAenderung> {
    this.hole(id);
    if (!aufgaben.holeAufgabe(this.db, aufgabeId)) throw new Fehler(404, "Chat nicht gefunden.");
    // Sonst schrieben Agent und App womöglich gleichzeitig am selben Objekt
    if (this.chat.istBeschaeftigt(aufgabeId)) throw new Fehler(409, "Der Agent arbeitet gerade in diesem Chat. Rückgängig geht, sobald er fertig ist.");
    if (this.inArbeit.has(id)) throw new Fehler(409, "Läuft schon.");

    this.inArbeit.add(id);
    try {
      const ergebnis = await this.aufrufer.rufeAuf(this.appServer(), "zuruecknehmen", { id });
      if (ergebnis.fehler) throw new Fehler(409, ergebnis.text);
      this.chat.melde(aufgabeId, { art: "adt_zurueckgenommen", aenderungId: id, text: ergebnis.text });
      aufgaben.merkeHinweisFuerAgent(
        this.db,
        aufgabeId,
        `Der Nutzer hat eine deiner ADT-Änderungen rückgängig gemacht: ${ergebnis.text} Arbeite vom Stand im System aus weiter (ggf. neu auschecken).`,
      );
      return this.hole(id);
    } finally {
      this.inArbeit.delete(id);
    }
  }

  /** Der eingebaute ADT-MCP, aber mit --app (eigener Prozess, eigene Tools) */
  private appServer(): McpServerDaten {
    const server = holeServer(this.db, adtSchluessel);
    if (!server?.eingebaut) throw new Fehler(500, "Der eingebaute ADT-MCP ist nicht eingetragen.");
    return { ...server, argumente: [...server.argumente, "--app"] };
  }
}
