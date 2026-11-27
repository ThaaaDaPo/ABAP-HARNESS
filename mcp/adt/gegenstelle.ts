// Die Gegenstelle des ADT-MCP ist austauschbar (V-12): das echte SAP-System über die ADT-Schnittstelle
// (sap-gegenstelle.ts) oder eine Simulation für den Privatrechner (simulierte-gegenstelle.ts).
// Die Tools in werkzeuge.ts kennen nur diese Schnittstelle.
import type { ObjektArt, Teil } from "./objektarten.ts";

export interface AdtObjekt {
  /** Großgeschrieben, wie im System */
  name: string;
  art: ObjektArt;
  paket: string;
  /** Adresse des Objekts in ADT, z. B. /sap/bc/adt/oo/classes/zcl_x */
  url: string;
  /** Nur bei Funktionsbausteinen */
  funktionsgruppe?: string;
}

export interface Meldung {
  zeile: number;
  spalte: number;
  schwere: "fehler" | "warnung" | "info";
  text: string;
}

export interface AktivierungsErgebnis {
  erfolgreich: boolean;
  meldungen: (Meldung & { objekt: string })[];
}

export interface TestErgebnis {
  methoden: number;
  fehler: { klasse: string; methode: string; text: string }[];
}

export interface AtcBefund {
  /** 1 = Fehler, 2 = Warnung, 3 = Info */
  prioritaet: number;
  pruefung: string;
  text: string;
  zeile: number | null;
}

export interface AdtGegenstelle {
  /** Der angemeldete SAP-Benutzer (bei SSO von SAP gemeldet, nicht konfiguriert) */
  benutzer(): Promise<string>;
  /** Null, wenn es das Objekt nicht gibt */
  finde(name: string, art?: ObjektArt): Promise<AdtObjekt | null>;
  /** Neuester Stand (inaktiv, sonst aktiv). Null, wenn es den Teil nicht gibt (z. B. keine Testklassen). */
  lies(objekt: AdtObjekt, teil: Teil): Promise<string | null>;
  /** Syntaxprüfung des übergebenen, nicht gespeicherten Quelltexts – speichert nichts. */
  pruefe(objekt: AdtObjekt, teil: Teil, quelltext: string): Promise<Meldung[]>;
  /** Sperren, alle Teile speichern (inaktiv), entsperren. Fehlende Testklassen werden angelegt. */
  schreibe(objekt: AdtObjekt, aenderungen: { teil: Teil; quelltext: string }[]): Promise<void>;
  aktiviere(objekte: AdtObjekt[]): Promise<AktivierungsErgebnis>;
  legeAn(art: ObjektArt, name: string, beschreibung: string, paket: string, funktionsgruppe?: AdtObjekt): Promise<AdtObjekt>;
  /** Sperren und löschen. Nur für „Rückgängig“ eines neu angelegten Objekts – der Agent kann nicht löschen. */
  loesche(objekt: AdtObjekt): Promise<void>;
  unitTests(objekt: AdtObjekt): Promise<TestErgebnis>;
  /** `variante` leer = Standard-Prüfvariante des Systems */
  atc(objekt: AdtObjekt, variante: string): Promise<AtcBefund[]>;
  beenden(): Promise<void>;
}
