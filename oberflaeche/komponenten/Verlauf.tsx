// Zeigt den Verlauf eines Chats: Nachrichten, Tool-Aufrufe, Fehler und den Text, den der Agent gerade schreibt.
import { useEffect, useRef } from "react";
import type { Ereignis } from "../../gemeinsam/typen.ts";
import { ToolAufruf, type ToolAufrufDaten } from "./ToolAufruf.tsx";

/** Was im Verlauf als eigener Block erscheint */
type Block =
  | { art: "nutzer"; text: string }
  | { art: "agent"; text: string }
  | { art: "tool"; aufruf: ToolAufrufDaten }
  | { art: "fehler"; text: string };

/** Macht aus der Ereignisliste die Blöcke für die Anzeige. Tool-Start und -Ende werden zu einem Block. */
function bildeBloecke(ereignisse: Ereignis[]): Block[] {
  const bloecke: Block[] = [];
  const toolBloecke = new Map<string, ToolAufrufDaten>();

  for (const ereignis of ereignisse) {
    switch (ereignis.art) {
      case "nutzer_nachricht":
        bloecke.push({ art: "nutzer", text: ereignis.text });
        break;
      case "agent_nachricht":
        bloecke.push({ art: "agent", text: ereignis.text });
        break;
      case "tool_start": {
        const aufruf: ToolAufrufDaten = { aufrufId: ereignis.aufrufId, toolName: ereignis.toolName, argumente: ereignis.argumente };
        toolBloecke.set(ereignis.aufrufId, aufruf);
        bloecke.push({ art: "tool", aufruf });
        break;
      }
      case "tool_ende": {
        const aufruf = toolBloecke.get(ereignis.aufrufId);
        if (aufruf) aufruf.ende = { erfolgreich: ereignis.erfolgreich, ergebnis: ereignis.ergebnis };
        break;
      }
      case "fehler":
        bloecke.push({ art: "fehler", text: ereignis.meldung });
        break;
    }
  }
  return bloecke;
}

interface Eigenschaften {
  ereignisse: Ereignis[];
  /** Text, den der Agent gerade schreibt (noch nicht fertig) */
  laufenderText: string;
  arbeitet: boolean;
}

export function Verlauf({ ereignisse, laufenderText, arbeitet }: Eigenschaften) {
  const ende = useRef<HTMLDivElement>(null);

  // Bei neuen Inhalten nach unten scrollen
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "end" });
  }, [ereignisse.length, laufenderText]);

  const bloecke = bildeBloecke(ereignisse);

  return (
    <div className="verlauf">
      {bloecke.length === 0 && !arbeitet && <p className="leer">Schreib dem Agenten eine Nachricht.</p>}

      {bloecke.map((block, index) => {
        switch (block.art) {
          case "nutzer":
            return <div key={index} className="nachricht nutzer">{block.text}</div>;
          case "agent":
            return <div key={index} className="nachricht agent">{block.text}</div>;
          case "tool":
            return <ToolAufruf key={index} aufruf={block.aufruf} />;
          case "fehler":
            return <div key={index} className="nachricht fehler">{block.text}</div>;
        }
      })}

      {laufenderText && <div className="nachricht agent schreibt">{laufenderText}</div>}
      {arbeitet && !laufenderText && <div className="denkt">Agent arbeitet …</div>}
      <div ref={ende} />
    </div>
  );
}
