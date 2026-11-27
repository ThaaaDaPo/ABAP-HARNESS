// Fester Tool-Schritt: ruft ein MCP-Tool direkt auf, ohne KI dazwischen (kostet keine Credits).
// Die Regel legt David je Schritt fest (E-67):
// - erlauben: wird ausgeführt
// - melden:   wird ausgeführt, danach eine Meldung mit dem Ergebnis (im Postfach bzw. im Chat)
// - freigabe: wartet, bis David freigibt (im Postfach bzw. im Chat, E-68). Verwerfen bricht den Lauf ab.
// Die Agenten-Regeln gelten hier nicht – den Schritt hat David selbst so hingeschrieben.
import type { ToolSchrittDaten } from "../../../gemeinsam/typen.ts";
import { holeServer } from "../../datenbank/mcp-server.ts";
import { legeAb, schliesseAb } from "../../datenbank/postfach.ts";
import { alsJson, argumentWert } from "../ausdruecke.ts";
import { LaufAbbruch, SchrittFehler, type SchrittKontext } from "./gemeinsam.ts";

export async function toolSchritt(schritt: ToolSchrittDaten, k: SchrittKontext): Promise<unknown> {
  const { db, aufrufer } = k.umgebung;
  const server = holeServer(db, schritt.server);
  if (!server) throw new SchrittFehler(`Den MCP-Server ${schritt.server} gibt es nicht (mehr).`);

  // Leere Argumente weglassen – sonst bekäme das Tool z. B. status: "" statt keinem Filter.
  const parameter = server.tools.find((t) => t.name === schritt.tool)?.parameter ?? [];
  const argumente: Record<string, unknown> = {};
  for (const [name, text] of Object.entries(schritt.argumente)) {
    const wert = argumentWert(text, k.variablen, parameter.find((p) => p.name === name)?.typ ?? "");
    if (wert !== "" && wert !== undefined && wert !== null) argumente[name] = wert;
  }
  k.vermerke({ eingabe: argumente });

  let vorschlag: number | null = null;
  if (schritt.regel === "freigabe") {
    vorschlag = legeAb(db, { aufgabeId: k.lauf.aufgabeId, art: "freigabe", server: schritt.server, tool: schritt.tool, argumente });
    k.vermerke({ postfachNr: vorschlag });
    k.umgebung.meldePostfach(k.lauf, vorschlag, "freigabe", `${schritt.server}-${schritt.tool}`);
    k.wartet(true);
    const entscheidung = await k.umgebung.warteAufEntscheidung(k.lauf, vorschlag);
    k.wartet(false);
    if (entscheidung.art !== "freigegeben") {
      throw new LaufAbbruch(k.umgebung.abbruchGrund(k.lauf.nr) ?? `Vorschlag #${vorschlag} wurde verworfen.`);
    }
  }

  let text: string;
  let fehlgeschlagen: boolean;
  try {
    const antwort = await aufrufer.rufeAuf(server, schritt.tool, argumente);
    text = antwort.text;
    fehlgeschlagen = antwort.fehler;
  } catch (fehler) {
    text = (fehler as Error).message;
    fehlgeschlagen = true;
  }

  // Das Ergebnis steht auch am Vorschlag, damit die Karte im Chat bzw. Postfach es zeigt.
  if (vorschlag !== null) schliesseAb(db, vorschlag, { status: "freigegeben", ergebnis: fehlgeschlagen ? `Fehler: ${text}` : text });

  if (fehlgeschlagen) {
    if (schritt.beiFehler === "weiter") {
      k.vermerke({ meldung: `Fehlgeschlagen, der Lauf geht weiter: ${text}` });
      return { fehler: text };
    }
    throw new SchrittFehler(`${schritt.server}-${schritt.tool} ist fehlgeschlagen: ${text}`);
  }

  if (schritt.regel === "melden") {
    const nr = legeAb(db, { aufgabeId: k.lauf.aufgabeId, art: "meldung", server: schritt.server, tool: schritt.tool, argumente, ergebnis: text });
    k.vermerke({ postfachNr: nr });
    k.umgebung.meldePostfach(k.lauf, nr, "meldung", `${schritt.server}-${schritt.tool}`);
  }
  // JSON-Ergebnisse als Objekt bzw. Liste, damit spätere Schritte auf Felder zugreifen können
  return alsJson(text) ?? text;
}
