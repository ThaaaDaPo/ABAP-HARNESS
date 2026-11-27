// Platzhalter und Bedingungen in Workflows. Bewusst klein und ohne eval (wie E-59: nichts aus Tickets,
// Quelltext oder Modell wird als Code ausgeführt):
// - {{name}}, {{name.feld}}, {{liste[0].feld}}, {{eingaben.jql}} lesen Variablen.
// - Steht in einem Text nur ein einziger Platzhalter, bleibt der Wert, wie er ist (Liste, Zahl, Objekt).
//   Sonst wird eingesetzt: Texte und Zahlen direkt, Listen und Objekte als JSON.
// - Bedingungen vergleichen zwei solche Texte: gleich, ungleich, enthält, größer, kleiner, leer …
import type { Bedingung, WertTyp } from "../../gemeinsam/typen.ts";

export type Variablen = Record<string, unknown>;

const platzhalter = /\{\{\s*([^{}]+?)\s*\}\}/g;
const nurPlatzhalter = /^\{\{\s*([^{}]+?)\s*\}\}$/;
/** name, .feld, [3] – mehr gibt es nicht */
const pfadTeil = /^([A-Za-z_][A-Za-z0-9_]*)|^\.([A-Za-z_][A-Za-z0-9_]*)|^\[(\d+)\]/;

/** Ungültiger Platzhalter, z. B. {{a..b}}. Wird beim Prüfen des Workflows und zur Laufzeit gemeldet. */
export class AusdruckFehler extends Error {}

/** Zerlegt "liste[0].feld" in ["liste", 0, "feld"]. */
export function zerlegePfad(pfad: string): (string | number)[] {
  const teile: (string | number)[] = [];
  let rest = pfad.trim();
  while (rest) {
    const treffer = rest.match(pfadTeil);
    if (!treffer || (teile.length === 0 && !treffer[1]) || (teile.length > 0 && treffer[1])) {
      throw new AusdruckFehler(`Ungültiger Platzhalter {{${pfad}}}`);
    }
    teile.push(treffer[1] ?? treffer[2] ?? Number(treffer[3]));
    rest = rest.slice(treffer[0].length);
  }
  if (teile.length === 0) throw new AusdruckFehler("Leerer Platzhalter {{}}");
  return teile;
}

/** Liest den Wert. Fehlt etwas auf dem Weg, ist das Ergebnis undefined (kein Fehler). */
export function lies(variablen: Variablen, pfad: string): unknown {
  let wert: unknown = variablen;
  for (const teil of zerlegePfad(pfad)) {
    // Ein Text, der JSON enthält (z. B. Tool-Ergebnis), lässt sich auch durchsuchen.
    if (typeof wert === "string") wert = alsJson(wert) ?? wert;
    if (wert === null || typeof wert !== "object") return undefined;
    wert = (wert as Record<string | number, unknown>)[teil];
  }
  return wert;
}

/** Die Namen der Variablen, die ein Text benutzt (erster Teil jedes Platzhalters) – für die Prüfung. */
export function benutzteVariablen(text: string): string[] {
  return [...text.matchAll(platzhalter)].map((t) => String(zerlegePfad(t[1])[0]));
}

/** Setzt die Variablen in den Text ein. Ein einzelner Platzhalter behält seinen Typ. */
export function setzeEin(text: string, variablen: Variablen): unknown {
  const einzeln = text.match(nurPlatzhalter);
  if (einzeln) return lies(variablen, einzeln[1]);
  return text.replace(platzhalter, (_ganz, pfad: string) => alsText(lies(variablen, pfad)));
}

/** Immer ein Text, z. B. für den Auftrag eines KI-Schritts. */
export function setzeEinAlsText(text: string, variablen: Variablen): string {
  return alsText(setzeEin(text, variablen));
}

export function alsText(wert: unknown): string {
  if (wert === undefined || wert === null) return "";
  if (typeof wert === "string") return wert;
  if (typeof wert === "number" || typeof wert === "boolean") return String(wert);
  return JSON.stringify(wert, null, 2);
}

/** JSON-Objekt oder -Liste aus einem Text, sonst null. */
export function alsJson(text: string): unknown {
  const getrimmt = text.trim();
  if (!getrimmt.startsWith("{") && !getrimmt.startsWith("[")) return null;
  try {
    return JSON.parse(getrimmt);
  } catch {
    return null;
  }
}

/**
 * Wert für ein Tool-Argument. Ist der Parameter laut Server ein Text, bleibt es Text. Sonst wird
 * geschriebenes JSON übernommen: 3 wird zur Zahl, true zu ja, ["A","B"] zur Liste.
 */
export function argumentWert(text: string, variablen: Variablen, typ: string): unknown {
  const wert = setzeEin(text, variablen);
  if (typ === "string") return alsText(wert);
  if (typeof wert !== "string" || nurPlatzhalter.test(text)) return wert;
  try {
    return JSON.parse(wert);
  } catch {
    return wert;
  }
}

/** Liste für „Für jedes“: echte Liste, JSON-Liste im Text oder Text mit einem Eintrag je Zeile. */
export function alsListe(wert: unknown): unknown[] {
  if (Array.isArray(wert)) return wert;
  if (wert === undefined || wert === null || wert === "") return [];
  if (typeof wert === "string") {
    const json = alsJson(wert);
    if (Array.isArray(json)) return json;
    return wert.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);
  }
  return [wert];
}

function istLeer(wert: unknown): boolean {
  if (wert === undefined || wert === null) return true;
  if (typeof wert === "string") return wert.trim() === "";
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === "object") return Object.keys(wert).length === 0;
  return false;
}

/** ja/nein auch aus Text: "true", "ja", "1" gelten als ja. */
export function alsJaNein(wert: unknown): boolean {
  if (typeof wert === "boolean") return wert;
  if (typeof wert === "number") return wert !== 0;
  if (typeof wert === "string") return ["true", "ja", "1", "yes", "wahr"].includes(wert.trim().toLowerCase());
  return !istLeer(wert);
}

function alsZahl(wert: unknown): number | null {
  if (typeof wert === "number") return wert;
  if (typeof wert === "string" && wert.trim() !== "" && !Number.isNaN(Number(wert))) return Number(wert);
  return null;
}

export function pruefeBedingung(bedingung: Bedingung, variablen: Variablen): boolean {
  const links = setzeEin(bedingung.links, variablen);
  const rechts = setzeEin(bedingung.rechts, variablen);
  switch (bedingung.vergleich) {
    case "leer":
      return istLeer(links);
    case "nicht_leer":
      return !istLeer(links);
    case "wahr":
      return alsJaNein(links);
    case "falsch":
      return !alsJaNein(links);
    case "gleich":
    case "ungleich": {
      // Zahlen als Zahlen vergleichen (3 = "3"), sonst als Text ohne Groß-/Kleinschreibung
      const a = alsZahl(links);
      const b = alsZahl(rechts);
      const gleich = a !== null && b !== null ? a === b : alsText(links).trim().toLowerCase() === alsText(rechts).trim().toLowerCase();
      return bedingung.vergleich === "gleich" ? gleich : !gleich;
    }
    case "enthaelt":
      if (Array.isArray(links)) return links.some((e) => alsText(e).toLowerCase() === alsText(rechts).toLowerCase());
      return alsText(links).toLowerCase().includes(alsText(rechts).toLowerCase());
    case "groesser":
    case "kleiner": {
      const a = alsZahl(links) ?? (Array.isArray(links) ? links.length : null);
      const b = alsZahl(rechts);
      if (a === null || b === null) return false;
      return bedingung.vergleich === "groesser" ? a > b : a < b;
    }
  }
}

/**
 * Macht aus einem Text den Wert des gewünschten Typs (Eingaben beim Start, Ergebnisfelder der KI).
 * Wirft einen verständlichen Fehler, wenn das nicht geht.
 */
export function wandle(wert: unknown, typ: WertTyp, name: string): unknown {
  switch (typ) {
    case "text":
      return alsText(wert);
    case "zahl": {
      const zahl = alsZahl(wert);
      if (zahl === null) throw new AusdruckFehler(`${name} muss eine Zahl sein.`);
      return zahl;
    }
    case "ja_nein":
      if (typeof wert === "boolean") return wert;
      if (typeof wert === "string" && ["true", "false", "ja", "nein"].includes(wert.trim().toLowerCase())) return alsJaNein(wert);
      throw new AusdruckFehler(`${name} muss ja oder nein sein.`);
    case "liste":
      if (Array.isArray(wert)) return wert;
      if (typeof wert === "string") return alsListe(wert.includes("\n") || wert.trim().startsWith("[") ? wert : wert.split(",").join("\n"));
      throw new AusdruckFehler(`${name} muss eine Liste sein.`);
  }
}
