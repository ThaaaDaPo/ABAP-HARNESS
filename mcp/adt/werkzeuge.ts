// Die Tools des ADT-MCP – wenige, grobe Schritte wie in docs/03-adt-integration.md:
// auschecken → (Dateien bearbeiten) → pruefen → speichern → aktivieren → unit_tests / atc_pruefen,
// dazu anlegen. Die Regeln stecken hier im Code, nicht im Prompt:
// - speichern prüft immer selbst die Syntax und speichert bei Fehlern nicht (V-03)
// - anlegen, speichern, aktivieren nur in den freigegebenen Paketen (V-11, E-28)
// - speichern bricht ab, wenn das Objekt seit dem Auschecken im System geändert wurde
// Die Texte sind für den Agenten geschrieben: was passiert ist und was als Nächstes zu tun ist.
import type { AdtLaufzeitKonfiguration } from "../../gemeinsam/typen.ts";
import { ToolFehler, type ToolDefinition } from "../gemeinsam/mini-server.ts";
import type { AdtGegenstelle, AdtObjekt, Meldung } from "./gegenstelle.ts";
import { alleArten, arten, istArt, teilBeschreibung, type ObjektArt, type Teil } from "./objektarten.ts";
import { vergleiche } from "./vergleich.ts";
import { einheitlich, pruefsumme, type Stand, type Workspace } from "./workspace.ts";

export interface AdtKontext {
  gegenstelle: AdtGegenstelle;
  workspace: Workspace;
  konfiguration: AdtLaufzeitKonfiguration;
}

const artenText = alleArten.join(", ");

function art(wert: unknown, pflicht = false): ObjektArt | undefined {
  if (wert === undefined || wert === null || wert === "") {
    if (pflicht) throw new ToolFehler(`Bitte die Art angeben: ${artenText}.`);
    return undefined;
  }
  if (!istArt(wert)) throw new ToolFehler(`Unbekannte Art "${wert}". Möglich: ${artenText}.`);
  return wert;
}

function name(wert: unknown): string {
  const text = String(wert ?? "").trim().toUpperCase();
  if (!text) throw new ToolFehler("Bitte den Namen des Objekts angeben.");
  return text;
}

async function findeOderFehler(k: AdtKontext, objektName: string, objektArt?: ObjektArt): Promise<AdtObjekt> {
  const objekt = await k.gegenstelle.finde(objektName, objektArt);
  if (!objekt) throw new ToolFehler(`${objektName} gibt es im System nicht. Neu anlegen geht mit dem Tool anlegen.`);
  return objekt;
}

/** Paket-Sperre: Ändern nur in den freigegebenen Paketen. */
function darfAendern(k: AdtKontext, paket: string): boolean {
  return k.konfiguration.pakete.some((p) => p.toUpperCase() === paket.toUpperCase());
}

function pruefePaket(k: AdtKontext, objekt: AdtObjekt): void {
  if (!darfAendern(k, objekt.paket)) {
    throw new ToolFehler(
      `${objekt.name} liegt im Paket ${objekt.paket || "(unbekannt)"}. Ändern darf ich nur in: ${k.konfiguration.pakete.join(", ")}. ` +
        `Das ist technisch gesperrt – suche keinen anderen Weg, sondern sage dem Nutzer Bescheid.`,
    );
  }
}

/** Meldungen mit den betroffenen Quelltextzeilen – so kann der Agent direkt korrigieren. */
function meldungsText(meldungen: Meldung[], quelltext: string): string {
  const zeilen = quelltext.split("\n");
  return meldungen
    .map((m) => {
      const zeile = zeilen[m.zeile - 1];
      const art = m.schwere === "fehler" ? "Fehler" : m.schwere === "warnung" ? "Warnung" : "Info";
      return `  ${art} in Zeile ${m.zeile}, Spalte ${m.spalte}: ${m.text}${zeile !== undefined ? `\n    ${m.zeile} | ${zeile}` : ""}`;
    })
    .join("\n");
}

const fehlerIn = (meldungen: Meldung[]) => meldungen.filter((m) => m.schwere === "fehler");

/** Die Teile, für die es im Workspace eine Datei gibt, mit Inhalt */
function lokaleTeile(k: AdtKontext, objekt: { name: string; art: ObjektArt }): { teil: Teil; quelltext: string }[] {
  return arten[objekt.art].teile.flatMap((teil) => {
    const quelltext = k.workspace.leseDatei(objekt.name, objekt.art, teil);
    return quelltext === null ? [] : [{ teil, quelltext }];
  });
}

function standOderFehler(k: AdtKontext, objektName: string) {
  const stand = k.workspace.leseStand(objektName);
  if (!stand) throw new ToolFehler(`${objektName} ist nicht ausgecheckt. Zuerst auschecken (oder neu anlegen).`);
  return stand;
}

async function auschecken(k: AdtKontext, objekt: AdtObjekt, ueberschreiben: boolean): Promise<string> {
  if (!arten[objekt.art].bearbeitbar) {
    throw new ToolFehler(`${objekt.name} ist eine Funktionsgruppe – die hat keinen eigenen Quelltext. Checke ihre Funktionsbausteine aus.`);
  }
  // Ungespeicherte Änderungen im Workspace nicht stillschweigend überschreiben
  const stand = k.workspace.leseStand(objekt.name);
  if (stand && !ueberschreiben) {
    const geaendert = lokaleTeile(k, objekt).filter(({ teil, quelltext }) => pruefsumme(quelltext) !== stand.teile[teil]);
    if (geaendert.length > 0) {
      const dateien = geaendert.map(({ teil }) => k.workspace.anzeige(k.workspace.pfad(objekt.name, objekt.art, teil))).join(", ");
      throw new ToolFehler(`Im Workspace gibt es ungespeicherte Änderungen (${dateien}). Erst speichern – oder mit ueberschreiben: true verwerfen.`);
    }
  }

  const teile: Stand["teile"] = {};
  const zeilen: string[] = [];
  for (const teil of arten[objekt.art].teile) {
    const quelltext = await k.gegenstelle.lies(objekt, teil);
    // Leere Includes nicht als Datei anlegen – wer sie braucht, legt die Datei an, speichern übernimmt sie.
    // Eine alte Datei davon (früheres Auschecken) entfernen, sonst gälte sie als Änderung.
    if (quelltext === null || (teil !== "main" && !quelltext.trim())) {
      k.workspace.entferneDatei(objekt.name, objekt.art, teil);
      continue;
    }
    k.workspace.schreibeDatei(objekt.name, objekt.art, teil, quelltext);
    teile[teil] = pruefsumme(quelltext);
    const datei = k.workspace.anzeige(k.workspace.pfad(objekt.name, objekt.art, teil));
    zeilen.push(`- ${datei} (${teilBeschreibung(teil)}, ${einheitlich(quelltext).split("\n").length} Zeilen)`);
  }
  k.workspace.schreibeStand({ name: objekt.name, art: objekt.art, teile });

  const hinweise: string[] = [];
  if (objekt.art === "klasse" && !teile.testclasses) {
    const datei = k.workspace.anzeige(k.workspace.pfad(objekt.name, objekt.art, "testclasses"));
    hinweise.push(`Testklassen gibt es noch nicht. Bei Bedarf ${datei} anlegen – speichern legt sie im System an.`);
  }
  if (!darfAendern(k, objekt.paket)) hinweise.push(`Achtung: Paket ${objekt.paket} ist nicht freigegeben – lesen ja, speichern nein.`);

  return [
    `${objekt.name} (${objekt.art}, Paket ${objekt.paket}) ausgecheckt:`,
    ...zeilen,
    "",
    "Bearbeite die Dateien mit deinen Datei-Werkzeugen. Dann: pruefen, speichern, aktivieren. " +
      "Für dieses Objekt gilt die Datei im Workspace, nicht die aktive Version im System.",
    ...hinweise,
  ].join("\n");
}

export function erstelleWerkzeuge(kontext: () => Promise<AdtKontext>): ToolDefinition[] {
  return [
    {
      name: "auschecken",
      beschreibung:
        "Holt den Quelltext eines ABAP-Objekts (Klasse, Interface, Programm, Funktionsbaustein) als Dateien in den Workspace " +
        "(Ordner abap/). Danach bearbeitest du die Dateien und speicherst mit speichern. Erst auschecken, dann ändern.",
      nurLesend: true,
      parameter: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name des Objekts, z. B. ZCL_KUNDEN_SERVICE" },
          art: { type: "string", enum: alleArten, description: "Optional, falls der Name nicht eindeutig ist" },
          ueberschreiben: { type: "boolean", description: "Ungespeicherte Änderungen im Workspace verwerfen" },
        },
        required: ["name"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        return auschecken(k, await findeOderFehler(k, name(a.name), art(a.art)), a.ueberschreiben === true);
      },
    },
    {
      name: "pruefen",
      beschreibung:
        "Syntaxprüfung des ausgecheckten Objekts mit dem Stand der Dateien im Workspace – gegen das echte System, ohne zu speichern. " +
        "Liefert Fehler mit Zeile und betroffenem Quelltext.",
      nurLesend: true,
      parameter: {
        type: "object",
        properties: { name: { type: "string", description: "Name des ausgecheckten Objekts" } },
        required: ["name"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const stand = standOderFehler(k, name(a.name));
        const objekt = await findeOderFehler(k, stand.name, stand.art);
        const teile: string[] = [];
        let fehler = 0;
        for (const { teil, quelltext } of lokaleTeile(k, objekt)) {
          const meldungen = await k.gegenstelle.pruefe(objekt, teil, quelltext);
          fehler += fehlerIn(meldungen).length;
          const datei = k.workspace.anzeige(k.workspace.pfad(objekt.name, objekt.art, teil));
          if (meldungen.length > 0) teile.push(`${datei}:\n${meldungsText(meldungen, quelltext)}`);
        }
        if (teile.length === 0) return `${objekt.name}: keine Fehler, keine Warnungen.`;
        return `${objekt.name}: ${fehler} Fehler.\n${teile.join("\n")}`;
      },
    },
    {
      name: "speichern",
      beschreibung:
        "Speichert die geänderten Dateien des Objekts im System (inaktiv): prüft zuerst die Syntax und speichert nur ohne Fehler, " +
        "sperrt das Objekt nur kurz. Bricht ab, wenn das Objekt seit dem Auschecken im System geändert wurde. Danach aktivieren.",
      nurLesend: false,
      parameter: {
        type: "object",
        properties: { name: { type: "string", description: "Name des ausgecheckten Objekts" } },
        required: ["name"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const stand = standOderFehler(k, name(a.name));
        const objekt = await findeOderFehler(k, stand.name, stand.art);
        pruefePaket(k, objekt);

        const kandidaten = lokaleTeile(k, objekt).filter(({ teil, quelltext }) => pruefsumme(quelltext) !== stand.teile[teil]);

        // Konflikt: Hat jemand anderes inzwischen im System geändert?
        const imSystem = new Map<Teil, string>();
        for (const { teil } of kandidaten) {
          const aktuell = (await k.gegenstelle.lies(objekt, teil)) ?? "";
          imSystem.set(teil, aktuell);
          if (stand.teile[teil] !== undefined && pruefsumme(aktuell) !== stand.teile[teil]) {
            throw new ToolFehler(
              `Nicht gespeichert: ${objekt.name} (${teilBeschreibung(teil)}) wurde seit dem Auschecken im System geändert. ` +
                `Nichts überschrieben. Sage dem Nutzer Bescheid oder checke mit ueberschreiben: true neu aus und übertrage deine Änderung.`,
            );
          }
        }

        // Was schon so im System steht, muss nicht gespeichert werden
        const geaendert = kandidaten.filter(({ teil, quelltext }) => pruefsumme(quelltext) !== pruefsumme(imSystem.get(teil) ?? ""));
        if (geaendert.length === 0) return `${objekt.name}: Die Dateien entsprechen dem Stand im System – nichts zu speichern.`;

        // Erst speichern, wenn die Syntax stimmt (V-03)
        const berichte: string[] = [];
        for (const { teil, quelltext } of geaendert) {
          const meldungen = await k.gegenstelle.pruefe(objekt, teil, quelltext);
          const datei = k.workspace.anzeige(k.workspace.pfad(objekt.name, objekt.art, teil));
          if (fehlerIn(meldungen).length > 0) {
            throw new ToolFehler(`Nicht gespeichert – Syntaxfehler in ${datei}:\n${meldungsText(fehlerIn(meldungen), quelltext)}\nKorrigiere die Datei und rufe speichern erneut auf.`);
          }
          if (meldungen.length > 0) berichte.push(`${datei}:\n${meldungsText(meldungen, quelltext)}`);
        }

        for (const { teil } of geaendert) {
          const vorher = imSystem.get(teil) ?? "";
          if (vorher) k.workspace.sichereVorher(objekt.name, teil, vorher);
        }
        await k.gegenstelle.schreibe(objekt, geaendert);
        for (const { teil, quelltext } of geaendert) stand.teile[teil] = pruefsumme(quelltext);
        k.workspace.schreibeStand(stand);

        const aenderungen = geaendert.map(
          ({ teil, quelltext }) => `${teilBeschreibung(teil)}: ${vergleiche(einheitlich(imSystem.get(teil) ?? ""), einheitlich(quelltext))}`,
        );
        return [
          `${objekt.name} gespeichert (inaktiv). Noch nicht aktiv – als Nächstes aktivieren.`,
          ...(berichte.length > 0 ? ["Warnungen:", ...berichte] : []),
          "Vorher/Nachher:",
          ...aenderungen,
        ].join("\n");
      },
    },
    {
      name: "aktivieren",
      beschreibung:
        "Aktiviert gespeicherte Objekte. Mehrere Objekte, die voneinander abhängen (z. B. Interface und Klasse), zusammen angeben.",
      nurLesend: false,
      parameter: {
        type: "object",
        properties: { namen: { type: "array", items: { type: "string" }, description: "Namen der Objekte" } },
        required: ["namen"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const namen: string[] = Array.isArray(a.namen) ? a.namen.map(name) : [name(a.namen)];
        if (namen.length === 0) throw new ToolFehler("Bitte mindestens einen Namen angeben.");
        const objekte: AdtObjekt[] = [];
        for (const n of namen) {
          const objekt = await findeOderFehler(k, n, k.workspace.leseStand(n)?.art);
          pruefePaket(k, objekt);
          objekte.push(objekt);
        }
        const ergebnis = await k.gegenstelle.aktiviere(objekte);
        const meldungen = ergebnis.meldungen.map((m) => `  ${m.schwere === "fehler" ? "Fehler" : "Hinweis"} ${m.objekt}, Zeile ${m.zeile}: ${m.text}`);
        if (!ergebnis.erfolgreich) return [`Nicht aktiviert: ${namen.join(", ")}.`, ...meldungen].join("\n");
        return [`Aktiviert: ${namen.join(", ")}.`, ...meldungen].join("\n");
      },
    },
    {
      name: "anlegen",
      beschreibung:
        "Legt ein neues ABAP-Objekt an (nur in den freigegebenen Paketen, Start: $TMP) und checkt es gleich aus. " +
        "Funktionsbausteine brauchen eine vorhandene Funktionsgruppe; die lässt sich mit art funktionsgruppe anlegen.",
      nurLesend: false,
      parameter: {
        type: "object",
        properties: {
          art: { type: "string", enum: alleArten },
          name: { type: "string", description: "Name im Kundennamensraum, z. B. ZCL_KUNDEN_EXPORT" },
          beschreibung: { type: "string", description: "Kurzbeschreibung (max. 60 Zeichen)" },
          paket: { type: "string", description: "Paket, Standard: das erste freigegebene (meist $TMP)" },
          funktionsgruppe: { type: "string", description: "Nur bei Funktionsbausteinen: Name der Funktionsgruppe" },
        },
        required: ["art", "name", "beschreibung"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const objektArt = art(a.art, true)!;
        const objektName = name(a.name);
        const beschreibung = String(a.beschreibung ?? "").trim().slice(0, 60) || objektName;
        if (await k.gegenstelle.finde(objektName)) throw new ToolFehler(`${objektName} gibt es schon. Zum Ändern auschecken.`);

        let paket = String(a.paket ?? "").trim().toUpperCase() || k.konfiguration.pakete[0];
        let gruppe: AdtObjekt | undefined;
        if (objektArt === "funktionsbaustein") {
          if (!a.funktionsgruppe) throw new ToolFehler("Für einen Funktionsbaustein bitte die Funktionsgruppe angeben.");
          gruppe = await findeOderFehler(k, name(a.funktionsgruppe), "funktionsgruppe");
          paket = gruppe.paket;
        }
        if (!paket || !darfAendern(k, paket)) {
          throw new ToolFehler(`Anlegen ist nur in diesen Paketen erlaubt: ${k.konfiguration.pakete.join(", ")}. Gewählt war: ${paket || "(keins)"}.`);
        }
        const objekt = await k.gegenstelle.legeAn(objektArt, objektName, beschreibung, paket, gruppe);
        if (!arten[objektArt].bearbeitbar) return `Funktionsgruppe ${objekt.name} in ${paket} angelegt. Jetzt Funktionsbausteine darin anlegen.`;
        return `${objekt.name} in ${paket} angelegt (inaktiv).\n${await auschecken(k, objekt, true)}`;
      },
    },
    {
      name: "unit_tests",
      beschreibung: "Führt die ABAP-Unit-Tests eines Objekts aus. Getestet wird die aktive Version – also vorher speichern und aktivieren.",
      nurLesend: false,
      parameter: {
        type: "object",
        properties: { name: { type: "string", description: "Klasse oder Programm mit Testklassen" } },
        required: ["name"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const objekt = await findeOderFehler(k, name(a.name));
        const ergebnis = await k.gegenstelle.unitTests(objekt);
        if (ergebnis.methoden === 0) return `${objekt.name}: keine Testmethoden gefunden (Testklassen angelegt und aktiviert?).`;
        const methoden = ergebnis.methoden === 1 ? "1 Testmethode" : `${ergebnis.methoden} Testmethoden`;
        if (ergebnis.fehler.length === 0) return `${objekt.name}: ${methoden}, ${ergebnis.methoden === 1 ? "erfolgreich" : "alle erfolgreich"}.`;
        return [
          `${objekt.name}: ${methoden}, ${ergebnis.fehler.length} fehlgeschlagen:`,
          ...ergebnis.fehler.map((f) => `  ${f.klasse}${f.methode ? `->${f.methode}` : ""}: ${f.text}`),
        ].join("\n");
      },
    },
    {
      name: "atc_pruefen",
      beschreibung: "ATC-Prüfung (ABAP Test Cockpit) eines Objekts mit der eingestellten Prüfvariante. Geprüft wird die aktive Version.",
      nurLesend: true,
      parameter: {
        type: "object",
        properties: { name: { type: "string", description: "Name des Objekts" } },
        required: ["name"],
      },
      ausfuehren: async (a) => {
        const k = await kontext();
        const objekt = await findeOderFehler(k, name(a.name));
        const befunde = await k.gegenstelle.atc(objekt, k.konfiguration.atcVariante);
        if (befunde.length === 0) return `${objekt.name}: ATC ohne Befunde.`;
        const stufe = (p: number) => (p === 1 ? "Fehler" : p === 2 ? "Warnung" : "Info");
        return [
          `${objekt.name}: ${befunde.length === 1 ? "1 ATC-Befund" : `${befunde.length} ATC-Befunde`}:`,
          ...befunde
            .sort((x, y) => x.prioritaet - y.prioritaet)
            .map((b) => `  ${stufe(b.prioritaet)}${b.zeile ? ` (Zeile ${b.zeile})` : ""}: ${b.text} [${b.pruefung}]`),
        ].join("\n");
      },
    },
  ];
}
