// Der Workspace des ADT-MCP (V-02): Ausgecheckte Quelltexte liegen als normale Dateien unter
// <workspace>/abap/, damit der Agent sie mit seinen Datei-Werkzeugen gezielt bearbeiten kann.
// Je Objekt merkt sich .adt/<name>.json, welcher Stand im System beim Auschecken bzw. letzten
// Speichern war – daran erkennt „speichern“, ob jemand anderes inzwischen geändert hat.
// Vor jedem Speichern wird der alte Stand unter .adt/verlauf/ abgelegt (Grundlage für „Rückgängig“, E-31).
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dateiName, type ObjektArt, type Teil } from "./objektarten.ts";

export interface Stand {
  name: string;
  art: ObjektArt;
  /** Prüfsumme des Systemstands je Teil beim Auschecken bzw. letzten Speichern */
  teile: Partial<Record<Teil, string>>;
}

/** Zeilenenden vereinheitlichen: Windows-Editoren schreiben \r\n, SAP liefert \n. */
export function einheitlich(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function pruefsumme(text: string): string {
  return createHash("sha256").update(einheitlich(text)).digest("hex").slice(0, 16);
}

export class Workspace {
  /** <workspace>/abap */
  readonly ordner: string;
  private workspaceOrdner: string;

  constructor(workspaceOrdner: string) {
    this.workspaceOrdner = workspaceOrdner;
    this.ordner = path.join(workspaceOrdner, "abap");
  }

  /** Absoluter Pfad der Datei eines Teils */
  pfad(name: string, art: ObjektArt, teil: Teil): string {
    return path.join(this.ordner, dateiName(name, art, teil));
  }

  /** So nennt der Agent die Datei: relativ zum Workspace, mit / */
  anzeige(absolut: string): string {
    return path.relative(this.workspaceOrdner, absolut).split(path.sep).join("/");
  }

  leseDatei(name: string, art: ObjektArt, teil: Teil): string | null {
    const datei = this.pfad(name, art, teil);
    return fs.existsSync(datei) ? einheitlich(fs.readFileSync(datei, "utf8")) : null;
  }

  schreibeDatei(name: string, art: ObjektArt, teil: Teil, inhalt: string): void {
    fs.mkdirSync(this.ordner, { recursive: true });
    fs.writeFileSync(this.pfad(name, art, teil), einheitlich(inhalt), "utf8");
  }

  entferneDatei(name: string, art: ObjektArt, teil: Teil): void {
    fs.rmSync(this.pfad(name, art, teil), { force: true });
  }

  private standDatei(name: string): string {
    return path.join(this.ordner, ".adt", `${name.replace(/\//g, "#")}.json`);
  }

  leseStand(name: string): Stand | null {
    const datei = this.standDatei(name.toUpperCase());
    return fs.existsSync(datei) ? JSON.parse(fs.readFileSync(datei, "utf8")) : null;
  }

  schreibeStand(stand: Stand): void {
    const datei = this.standDatei(stand.name);
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, JSON.stringify(stand, null, 2));
  }

  /** Legt den Systemstand vor dem Speichern ab; gibt den Pfad zurück. */
  sichereVorher(name: string, teil: Teil, quelltext: string): string {
    const zeit = new Date().toISOString().replace(/[:.]/g, "-");
    const datei = path.join(this.ordner, ".adt", "verlauf", name.replace(/\//g, "#"), `${zeit}.${teil}.abap`);
    fs.mkdirSync(path.dirname(datei), { recursive: true });
    fs.writeFileSync(datei, quelltext, "utf8");
    return datei;
  }
}
