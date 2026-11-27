// Der Voice Agent gehört fest zur App: Er wird beim Start angelegt, falls er fehlt, und lässt sich
// nicht löschen. Auftrag und Modell stellt David auf der Agenten-Seite oder auf „Sprechen“ ein.
import type { ModellInfo, ModellWahl } from "../../gemeinsam/typen.ts";
import { holeAgent, legeAgentAn } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";

export const sprachAgentId = "sprache";

const auftrag = `Du bist ein Sprachassistent und führst ein gesprochenes Gespräch auf Deutsch. Was der Nutzer sagt, kommt aus einer Spracherkennung; deine Antwort wird vorgelesen.

- Antworte wie in einem natürlichen Gespräch: freundlich, direkt und kurz – meist ein bis drei Sätze. Ausführlicher nur, wenn der Nutzer das ausdrücklich möchte.
- Formuliere so, wie man spricht: keine Aufzählungen, Überschriften, Tabellen, kein Markdown, keine Emojis und kein Code. Schreib Abkürzungen aus („zum Beispiel“ statt „z. B.“) und Zahlen so, dass sie vorgelesen gut klingen.
- Die Spracherkennung macht Fehler. Wirkt etwas seltsam, nimm die wahrscheinlichste Bedeutung. Ist es wirklich unklar, frag kurz nach – höchstens eine Frage auf einmal.
- Du hast keine Werkzeuge und keinen Zugriff auf Dateien, SAP, Jira oder das Internet. Sag das offen, wenn danach gefragt wird.`;

export function richteSprachAgentenEin(db: Datenbank): void {
  if (holeAgent(db, sprachAgentId)) return;
  legeAgentAn(
    db,
    {
      name: "Sprachassistent",
      auftrag,
      // Das Modell wählt die App beim ersten Gespräch (schnellesModell), denn erst dann kennt sie die Liste.
      modellWahl: { modell: "", denkaufwand: "", kontext: "standard" },
      // Vorerst nur reden: keine MCP-Server, Instructions, Skills oder Workflows.
      mcpServer: [],
      instructions: [],
      skills: [],
      workflows: [],
    },
    sprachAgentId,
  );
}

/**
 * Vorschlag für ein schnelles Modell: kleine Modelle (mini, flash, nano …), davon das günstigste,
 * mit dem niedrigsten Thinking Effort. Null, wenn keins passt – dann bleibt es bei „automatisch“.
 */
export function schnellesModell(modelle: ModellInfo[]): ModellWahl | null {
  const klein = modelle.filter((m) => /mini|flash|nano|haiku|lite|fast|schnell/i.test(`${m.id} ${m.name}`));
  if (klein.length === 0) return null;
  const modell = [...klein].sort((a, b) => (a.multiplikator ?? 1) - (b.multiplikator ?? 1))[0];
  const denkaufwand = ["none", "minimal", "low"].find((stufe) => modell.denkStufen.includes(stufe)) ?? "";
  return { modell: modell.id, denkaufwand, kontext: "standard" };
}
