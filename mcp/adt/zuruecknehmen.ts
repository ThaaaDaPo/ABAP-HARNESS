// „Rückgängig“ (E-31): nimmt eine Änderung aus einem Änderungssatz zurück. Nur für die App – der
// ADT-MCP bietet dieses Tool nur an, wenn die App ihn mit --app startet; Copilot startet ihn ohne,
// der Agent sieht es also nie. Ausgeführt wird ohne KI, wie das Freigeben eines Vorschlags.
//
// - gespeichert: Der alte Stand wird zurückgeschrieben und aktiviert. Wurde das Objekt seitdem noch
//   einmal geändert (vom Agenten oder in Eclipse), wird abgelehnt – so geht nichts verloren.
// - angelegt: Das Objekt wird im System gelöscht.
// Die Paket-Sperre gilt auch hier.
import { ToolFehler, type ToolDefinition } from "../gemeinsam/mini-server.ts";
import type { AdtAenderung } from "../../gemeinsam/typen.ts";
import type { AdtObjekt } from "./gegenstelle.ts";
import { arten, istArt, type Teil } from "./objektarten.ts";
import { findeOderFehler, pruefePaket, type AdtKontext } from "./werkzeuge.ts";
import { pruefsumme } from "./workspace.ts";

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

async function schreibeZurueck(k: AdtKontext, objekt: AdtObjekt, aenderung: AdtAenderung): Promise<string> {
  // Steht im System noch genau der Stand nach dieser Änderung?
  for (const t of aenderung.teile) {
    const aktuell = (await k.gegenstelle.lies(objekt, t.teil as Teil)) ?? "";
    if (pruefsumme(aktuell) !== pruefsumme(t.nachher)) {
      throw new ToolFehler(
        `Nicht rückgängig gemacht: ${objekt.name} (${t.beschreibung}) wurde seit dieser Änderung noch einmal geändert – ` +
          `im Chat oder in Eclipse. Erst die neuere Änderung rückgängig machen. Im System ist nichts verändert.`,
      );
    }
  }

  await k.gegenstelle.schreibe(objekt, aenderung.teile.map((t) => ({ teil: t.teil as Teil, quelltext: t.vorher })));
  const aktivierung = await k.gegenstelle.aktiviere([objekt]);

  // Workspace nachziehen, damit der nächste Speichern-Aufruf vom zurückgeschriebenen Stand ausgeht
  const verworfen: string[] = [];
  const stand = k.workspace.leseStand(objekt.name);
  if (stand) {
    for (const t of aenderung.teile) {
      const teil = t.teil as Teil;
      const lokal = k.workspace.leseDatei(objekt.name, objekt.art, teil);
      if (lokal !== null && pruefsumme(lokal) !== pruefsumme(t.nachher)) verworfen.push(t.datei);
      // Leere Includes liegen wie beim Auschecken nicht als Datei im Workspace
      if (teil !== "main" && !t.vorher.trim()) {
        k.workspace.entferneDatei(objekt.name, objekt.art, teil);
        delete stand.teile[teil];
      } else {
        k.workspace.schreibeDatei(objekt.name, objekt.art, teil, t.vorher);
        stand.teile[teil] = pruefsumme(t.vorher);
      }
    }
    k.workspace.schreibeStand(stand);
  }

  const satz = [`${objekt.name}: Stand vor der Änderung von ${uhrzeit(aenderung.zeit)} zurückgeschrieben`];
  if (aktivierung.erfolgreich) satz.push(" und aktiviert.");
  else satz.push(`, aber nicht aktiviert: ${aktivierung.meldungen.map((m) => m.text).join("; ") || "SAP nennt keinen Grund"}.`);
  if (verworfen.length > 0) satz.push(` Ungespeicherte Änderungen in ${verworfen.join(", ")} sind verworfen.`);
  return satz.join("");
}

async function loescheAngelegtes(k: AdtKontext, objekt: AdtObjekt): Promise<string> {
  await k.gegenstelle.loesche(objekt);
  for (const teil of arten[objekt.art].teile) k.workspace.entferneDatei(objekt.name, objekt.art, teil);
  k.workspace.entferneStand(objekt.name);
  return `${objekt.name} im System gelöscht (war vom Agenten neu angelegt).`;
}

export function erstelleAppWerkzeuge(kontext: () => Promise<AdtKontext>): ToolDefinition[] {
  return [
    {
      name: "zuruecknehmen",
      beschreibung: "Nur für die App: nimmt eine Änderung aus einem Änderungssatz zurück (alten Stand zurückschreiben bzw. neu angelegtes Objekt löschen).",
      nurLesend: false,
      parameter: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      ausfuehren: async (a) => {
        const k = await kontext();
        const id = String(a.id ?? "");
        const aenderung = k.workspace.leseAenderung(id);
        if (!aenderung) throw new ToolFehler(`Die Änderung ${id} gibt es nicht (mehr).`);
        if (aenderung.zurueckgenommen) throw new ToolFehler(`Schon erledigt: ${aenderung.zurueckgenommen.text}`);
        const art = istArt(aenderung.objekt.art) ? aenderung.objekt.art : undefined;
        // Nur „nicht gefunden“ umformulieren; Verbindungsfehler bleiben, wie sie sind
        const objekt = await findeOderFehler(k, aenderung.objekt.name, art).catch((fehler) => {
          throw fehler instanceof ToolFehler ? new ToolFehler(`${aenderung.objekt.name} gibt es im System nicht mehr.`) : fehler;
        });
        pruefePaket(k, objekt);

        const text = aenderung.art === "angelegt" ? await loescheAngelegtes(k, objekt) : await schreibeZurueck(k, objekt, aenderung);
        aenderung.zurueckgenommen = { zeit: new Date().toISOString(), text };
        k.workspace.schreibeAenderung(aenderung);
        return text;
      },
    },
  ];
}
