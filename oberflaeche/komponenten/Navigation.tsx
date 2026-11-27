// Linke Leiste: Seiten der App, Zahl der offenen Postfach-Einträge und Modus-Anzeige.
import type { StatusAntwort } from "../../gemeinsam/typen.ts";

export type SeitenName = "chat" | "sprechen" | "workflows" | "postfach" | "agenten" | "instructions" | "mcp" | "verbrauch" | "einrichtung";

interface Eintrag {
  name: SeitenName;
  titel: string;
  /** Gesetzt, solange die Seite noch nicht gebaut ist */
  kommtIn?: string;
}

const eintraege: Eintrag[] = [
  { name: "chat", titel: "Chat" },
  // Voice Agent zum Ausprobieren – eigene Seite, bis er gut genug für den Chat ist.
  { name: "sprechen", titel: "Sprechen" },
  { name: "workflows", titel: "Workflows" },
  // Das Postfach ist für Workflows, die ohne David laufen (E-52, E-68). Freigaben aus Chats gibt er im Chat.
  { name: "postfach", titel: "Postfach" },
  { name: "agenten", titel: "Agenten" },
  { name: "instructions", titel: "Instructions & Skills" },
  { name: "mcp", titel: "MCP-Server" },
  { name: "verbrauch", titel: "Verbrauch" },
  { name: "einrichtung", titel: "Einrichtung" },
];

interface Eigenschaften {
  aktiv: SeitenName;
  waehle: (seite: SeitenName) => void;
  status: StatusAntwort | null;
  offenImPostfach: number;
}

export function Navigation({ aktiv, waehle, status, offenImPostfach }: Eigenschaften) {
  return (
    <nav className="navigation">
      <div className="marke">ABAP-HARNESS</div>

      {eintraege.map((eintrag) => (
        <button
          key={eintrag.name}
          className={eintrag.name === aktiv ? "nav-eintrag aktiv" : "nav-eintrag"}
          disabled={!!eintrag.kommtIn}
          title={eintrag.kommtIn ? `Kommt in ${eintrag.kommtIn}` : undefined}
          onClick={() => waehle(eintrag.name)}
        >
          {eintrag.titel}
          {eintrag.name === "postfach" && offenImPostfach > 0 && <span className="zaehler">{offenImPostfach}</span>}
        </button>
      ))}

      {status && (
        <div className="modus">
          <span className={status.modus === "copilot" ? "modus-punkt echt" : "modus-punkt"} />
          {status.modus === "copilot" ? "Copilot" : "Simulation"}
        </div>
      )}
    </nav>
  );
}
