// Linke Leiste: Seiten der App und Modus-Anzeige.
import type { StatusAntwort } from "../../gemeinsam/typen.ts";

export type SeitenName = "chat" | "mcp" | "postfach" | "agenten" | "einrichtung";

interface Eintrag {
  name: SeitenName;
  titel: string;
  /** Gesetzt, solange die Seite noch nicht gebaut ist */
  kommtIn?: string;
}

const eintraege: Eintrag[] = [
  { name: "chat", titel: "Chat" },
  { name: "mcp", titel: "MCP-Server" },
  { name: "postfach", titel: "Postfach", kommtIn: "Schritt 3" },
  { name: "agenten", titel: "Agenten", kommtIn: "Schritt 4" },
  { name: "einrichtung", titel: "Einrichtung", kommtIn: "Schritt 4" },
];

interface Eigenschaften {
  aktiv: SeitenName;
  waehle: (seite: SeitenName) => void;
  status: StatusAntwort | null;
}

export function Navigation({ aktiv, waehle, status }: Eigenschaften) {
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
        </button>
      ))}

      {status && (
        <div className="modus">
          <span className={status.modus === "copilot" ? "modus-punkt echt" : "modus-punkt"} />
          {status.modus === "copilot" ? "Copilot" : "Simulation"}
          <div className="modus-details">Modell: {status.modell}</div>
        </div>
      )}
    </nav>
  );
}
