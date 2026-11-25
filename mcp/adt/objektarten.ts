// Welche ABAP-Objekte der ADT-MCP kennt (E-11), wie ADT sie nennt und wie ihre Dateien im
// Workspace heißen. Die Dateinamen folgen abapGit (zcl_x.clas.abap, zcl_x.clas.testclasses.abap …),
// das kennen die Modelle.

export type ObjektArt = "klasse" | "interface" | "programm" | "funktionsbaustein" | "funktionsgruppe";

/** Ein Teil eines Objekts mit eigenem Quelltext. Nur Klassen haben mehr als "main". */
export type Teil = "main" | "definitions" | "implementations" | "macros" | "testclasses";

interface ArtAngaben {
  /** Typ-Kennung in ADT (Suche, Anlegen) */
  adtTyp: string;
  /** Endung im Dateinamen */
  endung: string;
  teile: Teil[];
  /** Lässt sich bearbeiten (Funktionsgruppen nur anlegen, ihre Bausteine bearbeiten) */
  bearbeitbar: boolean;
}

export const arten: Record<ObjektArt, ArtAngaben> = {
  klasse: { adtTyp: "CLAS/OC", endung: "clas", teile: ["main", "definitions", "implementations", "macros", "testclasses"], bearbeitbar: true },
  interface: { adtTyp: "INTF/OI", endung: "intf", teile: ["main"], bearbeitbar: true },
  programm: { adtTyp: "PROG/P", endung: "prog", teile: ["main"], bearbeitbar: true },
  funktionsbaustein: { adtTyp: "FUGR/FF", endung: "func", teile: ["main"], bearbeitbar: true },
  funktionsgruppe: { adtTyp: "FUGR/F", endung: "fugr", teile: [], bearbeitbar: false },
};

export const alleArten = Object.keys(arten) as ObjektArt[];

/** Wie abapGit die Klassen-Includes in Dateinamen nennt */
const teilEndung: Record<Teil, string> = {
  main: "",
  definitions: ".locals_def",
  implementations: ".locals_imp",
  macros: ".macros",
  testclasses: ".testclasses",
};

const teilText: Record<Teil, string> = {
  main: "Hauptteil",
  definitions: "lokale Definitionen",
  implementations: "lokale Implementierungen",
  macros: "Makros",
  testclasses: "Testklassen",
};

export function teilBeschreibung(teil: Teil): string {
  return teilText[teil];
}

/** zcl_kunde.clas.testclasses.abap; Namensräume /ABC/ werden wie bei abapGit zu #abc#. */
export function dateiName(name: string, art: ObjektArt, teil: Teil): string {
  return `${name.toLowerCase().replace(/\//g, "#")}.${arten[art].endung}${teilEndung[teil]}.abap`;
}

export function artAusAdtTyp(adtTyp: string): ObjektArt | null {
  return alleArten.find((art) => arten[art].adtTyp === adtTyp) ?? null;
}

export function istArt(wert: unknown): wert is ObjektArt {
  return alleArten.includes(wert as ObjektArt);
}
