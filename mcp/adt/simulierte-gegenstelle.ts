// Übungssystem statt SAP (V-12): Damit lassen sich ADT-MCP, Workspace und Abläufe auf dem
// Privatrechner prüfen. Der Zustand liegt in einer JSON-Datei, damit alle ADT-MCP-Prozesse (je
// Copilot-Sitzung einer) dasselbe „System“ sehen und es einen Neustart übersteht.
//
// Die Syntaxprüfung ist bewusst einfach, aber nachvollziehbar:
// - ein Bezeichner mit „unbekannt“ darin → „Feld … ist unbekannt“ (so lässt sich ein Fehler erzeugen)
// - die letzte Anweisung endet nicht mit einem Punkt → Fehler
// ABAP Unit zählt Methoden mit FOR TESTING; cl_abap_unit_assert=>fail lässt einen Test scheitern.
// ATC meldet SELECT * als Befund.
import fs from "node:fs";
import path from "node:path";
import type { AdtGegenstelle, AdtObjekt, AktivierungsErgebnis, AtcBefund, Meldung, TestErgebnis } from "./gegenstelle.ts";
import type { ObjektArt, Teil } from "./objektarten.ts";

interface SimObjekt {
  name: string;
  art: ObjektArt;
  paket: string;
  beschreibung: string;
  funktionsgruppe?: string;
  aktiv: Partial<Record<Teil, string>>;
  /** Gespeichert, aber noch nicht aktiviert */
  inaktiv: Partial<Record<Teil, string>>;
}

type Zustand = Record<string, SimObjekt>;

function klassenQuelle(name: string, inhalt = ""): string {
  const klein = name.toLowerCase();
  return `CLASS ${klein} DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n${inhalt}  PROTECTED SECTION.\n  PRIVATE SECTION.\nENDCLASS.\n\nCLASS ${klein} IMPLEMENTATION.\nENDCLASS.\n`;
}

/** Womit ein neues Objekt beginnt – so ähnlich wie SAP es anlegt. */
function vorlage(art: ObjektArt, name: string): Partial<Record<Teil, string>> {
  const klein = name.toLowerCase();
  switch (art) {
    case "klasse":
      return { main: klassenQuelle(name), definitions: "", implementations: "", macros: "" };
    case "interface":
      return { main: `INTERFACE ${klein} PUBLIC.\nENDINTERFACE.\n` };
    case "programm":
      return { main: `REPORT ${klein}.\n` };
    case "funktionsbaustein":
      return { main: `FUNCTION ${klein}.\n*"----------------------------------------------------------------------\n*"*"Lokale Schnittstelle:\n*"----------------------------------------------------------------------\nENDFUNCTION.\n` };
    case "funktionsgruppe":
      return {};
  }
}

/** Beispieldaten wie beim SAP-Stellvertreter, damit Lesen (SAP-MCP) und Ändern (ADT) zusammenpassen. */
function anfangsZustand(): Zustand {
  const objekt = (name: string, art: ObjektArt, paket: string, aktiv: Partial<Record<Teil, string>>, extra: Partial<SimObjekt> = {}): SimObjekt => ({
    name,
    art,
    paket,
    beschreibung: `${name} (Übungssystem)`,
    aktiv,
    inaktiv: {},
    ...extra,
  });
  return {
    ZCL_KUNDEN_SERVICE: objekt("ZCL_KUNDEN_SERVICE", "klasse", "$TMP", {
      main:
        "CLASS zcl_kunden_service DEFINITION PUBLIC FINAL CREATE PUBLIC.\n  PUBLIC SECTION.\n" +
        "    METHODS get_kunde IMPORTING iv_id TYPE kunnr RETURNING VALUE(rs_kunde) TYPE kna1.\n" +
        "ENDCLASS.\n\nCLASS zcl_kunden_service IMPLEMENTATION.\n  METHOD get_kunde.\n" +
        "    SELECT SINGLE * FROM kna1 WHERE kunnr = @iv_id INTO @rs_kunde.\n  ENDMETHOD.\nENDCLASS.\n",
      definitions: "",
      implementations: "",
      macros: "",
    }),
    ZIF_KUNDEN_LESER: objekt("ZIF_KUNDEN_LESER", "interface", "$TMP", {
      main: "INTERFACE zif_kunden_leser PUBLIC.\n  METHODS lese IMPORTING iv_id TYPE kunnr RETURNING VALUE(rs_kunde) TYPE kna1.\nENDINTERFACE.\n",
    }),
    // Liegt nicht in $TMP – daran sieht man die Paket-Sperre.
    Z_KUNDEN_LISTE: objekt("Z_KUNDEN_LISTE", "programm", "ZVERTRIEB", {
      main: "REPORT z_kunden_liste.\n\nSELECT kunnr, name1 FROM kna1 INTO TABLE @DATA(lt_kunden) UP TO 10 ROWS.\ncl_demo_output=>display( lt_kunden ).\n",
    }),
    ZKUNDEN: objekt("ZKUNDEN", "funktionsgruppe", "$TMP", {}),
    Z_KUNDE_LESEN: objekt("Z_KUNDE_LESEN", "funktionsbaustein", "$TMP", vorlage("funktionsbaustein", "Z_KUNDE_LESEN"), { funktionsgruppe: "ZKUNDEN" }),
  };
}

function url(objekt: Pick<SimObjekt, "name" | "art" | "funktionsgruppe">): string {
  const klein = encodeURIComponent(objekt.name.toLowerCase());
  switch (objekt.art) {
    case "klasse":
      return `/sap/bc/adt/oo/classes/${klein}`;
    case "interface":
      return `/sap/bc/adt/oo/interfaces/${klein}`;
    case "programm":
      return `/sap/bc/adt/programs/programs/${klein}`;
    case "funktionsgruppe":
      return `/sap/bc/adt/functions/groups/${klein}`;
    case "funktionsbaustein":
      return `/sap/bc/adt/functions/groups/${encodeURIComponent(objekt.funktionsgruppe!.toLowerCase())}/fmodules/${klein}`;
  }
}

/** Die einfache Syntaxprüfung des Übungssystems (siehe oben). */
export function simulierteSyntaxpruefung(quelltext: string): Meldung[] {
  const meldungen: Meldung[] = [];
  const zeilen = quelltext.split(/\r?\n/);
  zeilen.forEach((zeile, i) => {
    if (zeile.trimStart().startsWith("*") || zeile.trimStart().startsWith('"')) return;
    const unbekannt = zeile.match(/[\w-]*unbekannt[\w-]*/i);
    if (unbekannt) meldungen.push({ zeile: i + 1, spalte: unbekannt.index! + 1, schwere: "fehler", text: `Das Feld "${unbekannt[0].toUpperCase()}" ist unbekannt.` });
  });
  // Letzte Anweisung: letzte Zeile mit Inhalt, die kein Kommentar ist
  const letzte = zeilen.map((z, i) => ({ z: z.replace(/".*$/, "").trim(), i })).filter(({ z }) => z && !z.startsWith("*")).pop();
  if (letzte && !letzte.z.endsWith(".")) {
    meldungen.push({ zeile: letzte.i + 1, spalte: letzte.z.length, schwere: "fehler", text: "Die letzte Anweisung ist nicht mit einem Punkt abgeschlossen." });
  }
  return meldungen;
}

export class SimulierteGegenstelle implements AdtGegenstelle {
  private datei: string;

  constructor(datei: string) {
    this.datei = datei;
  }

  private lade(): Zustand {
    if (!fs.existsSync(this.datei)) return anfangsZustand();
    return JSON.parse(fs.readFileSync(this.datei, "utf8"));
  }

  private speichere(zustand: Zustand): void {
    fs.mkdirSync(path.dirname(this.datei), { recursive: true });
    fs.writeFileSync(this.datei, JSON.stringify(zustand, null, 2));
  }

  private alsObjekt(sim: SimObjekt): AdtObjekt {
    return { name: sim.name, art: sim.art, paket: sim.paket, url: url(sim), ...(sim.funktionsgruppe ? { funktionsgruppe: sim.funktionsgruppe } : {}) };
  }

  async benutzer(): Promise<string> {
    return "UEBUNG";
  }

  async finde(name: string, art?: ObjektArt): Promise<AdtObjekt | null> {
    const sim = this.lade()[name.toUpperCase()];
    if (!sim || (art && sim.art !== art)) return null;
    return this.alsObjekt(sim);
  }

  async lies(objekt: AdtObjekt, teil: Teil): Promise<string | null> {
    const sim = this.lade()[objekt.name];
    if (!sim) throw new Error(`${objekt.name} gibt es nicht (mehr).`);
    return sim.inaktiv[teil] ?? sim.aktiv[teil] ?? null;
  }

  async pruefe(_objekt: AdtObjekt, _teil: Teil, quelltext: string): Promise<Meldung[]> {
    return simulierteSyntaxpruefung(quelltext);
  }

  async schreibe(objekt: AdtObjekt, aenderungen: { teil: Teil; quelltext: string }[]): Promise<void> {
    const zustand = this.lade();
    const sim = zustand[objekt.name];
    if (!sim) throw new Error(`${objekt.name} gibt es nicht (mehr).`);
    for (const { teil, quelltext } of aenderungen) sim.inaktiv[teil] = quelltext;
    this.speichere(zustand);
  }

  async aktiviere(objekte: AdtObjekt[]): Promise<AktivierungsErgebnis> {
    const zustand = this.lade();
    const meldungen: AktivierungsErgebnis["meldungen"] = [];
    for (const objekt of objekte) {
      const sim = zustand[objekt.name];
      for (const [teil, quelle] of Object.entries(sim?.inaktiv ?? {})) {
        for (const m of simulierteSyntaxpruefung(quelle!)) meldungen.push({ ...m, objekt: `${objekt.name} (${teil})` });
      }
    }
    if (meldungen.some((m) => m.schwere === "fehler")) return { erfolgreich: false, meldungen };
    for (const objekt of objekte) {
      const sim = zustand[objekt.name];
      if (!sim) continue;
      sim.aktiv = { ...sim.aktiv, ...sim.inaktiv };
      sim.inaktiv = {};
    }
    this.speichere(zustand);
    return { erfolgreich: true, meldungen };
  }

  async legeAn(art: ObjektArt, name: string, beschreibung: string, paket: string, funktionsgruppe?: AdtObjekt): Promise<AdtObjekt> {
    const zustand = this.lade();
    const gross = name.toUpperCase();
    if (zustand[gross]) throw new Error(`${gross} gibt es schon.`);
    // Wie SAP: im Kundennamensraum nur Z… oder Y…
    if (!/^[ZY]/.test(gross)) throw new Error(`${gross}: Namen im Kundennamensraum beginnen mit Z oder Y.`);
    const sim: SimObjekt = {
      name: gross,
      art,
      paket,
      beschreibung,
      aktiv: {},
      // Neue Objekte sind wie in SAP erst einmal inaktiv
      inaktiv: vorlage(art, gross),
      ...(funktionsgruppe ? { funktionsgruppe: funktionsgruppe.name } : {}),
    };
    zustand[gross] = sim;
    this.speichere(zustand);
    return this.alsObjekt(sim);
  }

  async loesche(objekt: AdtObjekt): Promise<void> {
    const zustand = this.lade();
    // Wie SAP: Eine Funktionsgruppe mit Bausteinen lässt sich nicht löschen.
    const bausteine = Object.values(zustand).filter((o) => o.funktionsgruppe === objekt.name);
    if (bausteine.length > 0) throw new Error(`${objekt.name} enthält noch Funktionsbausteine (${bausteine.map((b) => b.name).join(", ")}).`);
    delete zustand[objekt.name];
    this.speichere(zustand);
  }

  async unitTests(objekt: AdtObjekt): Promise<TestErgebnis> {
    const sim = this.lade()[objekt.name];
    // Getestet wird die aktive Version – wie in SAP
    const quelle = [sim?.aktiv.testclasses, objekt.art === "programm" ? sim?.aktiv.main : ""].filter(Boolean).join("\n");
    const methoden = [...quelle.matchAll(/METHODS\s+(\w+)\s+FOR\s+TESTING/gi)].map((m) => m[1]);
    const fehler = quelle.includes("cl_abap_unit_assert=>fail")
      ? [{ klasse: "LTC_TEST", methode: methoden[0] ?? "", text: "Assertion fehlgeschlagen (cl_abap_unit_assert=>fail)" }]
      : [];
    return { methoden: methoden.length, fehler };
  }

  async atc(objekt: AdtObjekt): Promise<AtcBefund[]> {
    const sim = this.lade()[objekt.name];
    const befunde: AtcBefund[] = [];
    for (const quelle of Object.values(sim?.aktiv ?? {})) {
      quelle!.split(/\r?\n/).forEach((zeile, i) => {
        if (/SELECT\s+(SINGLE\s+)?\*/i.test(zeile)) {
          befunde.push({ prioritaet: 2, pruefung: "Performance-Prüfungen", text: "SELECT * liest alle Felder – nur benötigte Felder lesen", zeile: i + 1 });
        }
      });
    }
    return befunde;
  }

  async beenden(): Promise<void> {}
}
