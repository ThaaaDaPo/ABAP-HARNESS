// Schritte ohne Nebenwirkung: Bedingung, Schleife, Variable setzen, vorzeitig beenden.
// Sie laufen beim Fortsetzen einfach noch einmal – das Ergebnis ist dasselbe, weil die Tool-, KI- und
// Workflow-Schritte davor ihr Ergebnis aus dem Protokoll übernehmen.
import type { WorkflowSchritt } from "../../../gemeinsam/typen.ts";
import { alsListe, pruefeBedingung, setzeEin } from "../ausdruecke.ts";
import { Beenden, type SchrittKontext } from "./gemeinsam.ts";

type Art<A extends WorkflowSchritt["art"]> = Extract<WorkflowSchritt, { art: A }>;

export async function wennSchritt(schritt: Art<"wenn">, k: SchrittKontext): Promise<unknown> {
  const erfuellt = pruefeBedingung(schritt.bedingung, k.variablen);
  k.vermerke({ eingabe: { links: setzeEin(schritt.bedingung.links, k.variablen), vergleich: schritt.bedingung.vergleich, rechts: schritt.bedingung.rechts } });
  await k.fuehreAus(erfuellt ? schritt.dann : schritt.sonst, "", "");
  return { erfuellt };
}

export async function fuerJedesSchritt(schritt: Art<"fuer_jedes">, k: SchrittKontext): Promise<unknown> {
  const liste = alsListe(setzeEin(schritt.liste, k.variablen));
  const anzahl = Math.min(liste.length, schritt.hoechstens);
  if (liste.length > anzahl) k.vermerke({ meldung: `Nur die ersten ${anzahl} von ${liste.length} Einträgen (Höchstzahl).` });
  for (let i = 0; i < anzahl; i++) {
    k.setze(schritt.als, liste[i]);
    k.setze(`${schritt.als}_nr`, i + 1);
    await k.fuehreAus(schritt.schritte, `${schritt.id}[${i}]/`, `${schritt.als} ${i + 1}/${anzahl}`);
  }
  return { durchlaeufe: anzahl };
}

export async function setzenSchritt(schritt: Art<"setzen">, k: SchrittKontext): Promise<unknown> {
  const wert = setzeEin(schritt.wert, k.variablen);
  k.setze(schritt.name, wert);
  return wert;
}

export async function beendenSchritt(schritt: Art<"beenden">, k: SchrittKontext): Promise<unknown> {
  throw new Beenden(schritt.ergebnis ? setzeEin(schritt.ergebnis, k.variablen) : null);
}
