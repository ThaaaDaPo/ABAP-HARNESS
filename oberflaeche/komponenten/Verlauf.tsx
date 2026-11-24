// Zeigt den Verlauf eines Chats: Nachrichten, Tool-Aufrufe, Fehler und den Text, den der Agent gerade schreibt.
import { useEffect, useRef } from "react";
import type { AufgabenStatus, Ereignis } from "../../gemeinsam/typen.ts";
import { ToolAufruf, type ToolAufrufDaten } from "./ToolAufruf.tsx";

/** Was im Verlauf als eigener Block erscheint */
type Block =
  | { art: "nutzer"; text: string }
  | { art: "agent"; text: string }
  | { art: "tool"; aufruf: ToolAufrufDaten }
  | { art: "postfach"; text: string }
  | { art: "postfach_aktion"; text: string; details?: string }
  | { art: "modell"; text: string }
  | { art: "fehler"; text: string };

/** Macht aus der Ereignisliste die Blöcke für die Anzeige. Tool-Start und -Ende werden zu einem Block. */
function bildeBloecke(ereignisse: Ereignis[]): Block[] {
  const bloecke: Block[] = [];
  const toolBloecke = new Map<string, ToolAufrufDaten>();
  let letztesModell = "";

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
      case "postfach":
        bloecke.push({ art: "postfach", text: postfachText(ereignis) });
        break;
      case "postfach_aktion":
        bloecke.push({ art: "postfach_aktion", text: ereignis.text, details: ereignis.details });
        break;
      case "modell":
        // Nur anzeigen, wenn sich das Modell ändert – sonst stünde es nach jedem Aufruf da.
        if (ereignis.modell !== letztesModell) bloecke.push({ art: "modell", text: `Modell: ${ereignis.modell}` });
        letztesModell = ereignis.modell;
        break;
      case "fehler":
        bloecke.push({ art: "fehler", text: ereignis.meldung });
        break;
    }
  }
  return bloecke;
}

function postfachText(ereignis: Extract<Ereignis, { art: "postfach" }>): string {
  const nr = ereignis.postfachNr;
  switch (ereignis.eintragsArt) {
    case "freigabe":
      return `Vorschlag #${nr} liegt im Postfach und wartet auf Freigabe (${ereignis.toolName})`;
    case "rueckfrage":
      return `Rückfrage #${nr} liegt im Postfach`;
    case "meldung":
      return `Meldung #${nr} im Postfach: ${ereignis.toolName} wurde ausgeführt`;
  }
}

/** Hinweis unter dem Verlauf, solange der Chat nicht einfach auf eine Nachricht wartet */
const statusHinweise: Partial<Record<AufgabenStatus, string>> = {
  arbeitet: "Agent arbeitet …",
  eingereiht: "Eingereiht – der Agent macht hier weiter, sobald er mit seiner aktuellen Aufgabe fertig ist.",
  wartet: "Wartet aufs Postfach.",
  erledigt: "Aufgabe erledigt.",
  abgebrochen: "Aufgabe abgebrochen.",
};

interface Eigenschaften {
  ereignisse: Ereignis[];
  /** Text, den der Agent gerade schreibt (noch nicht fertig) */
  laufenderText: string;
  status: AufgabenStatus;
  zeigePostfach: () => void;
}

export function Verlauf({ ereignisse, laufenderText, status, zeigePostfach }: Eigenschaften) {
  const ende = useRef<HTMLDivElement>(null);

  // Bei neuen Inhalten nach unten scrollen
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "end" });
  }, [ereignisse.length, laufenderText]);

  const bloecke = bildeBloecke(ereignisse);

  return (
    <div className="verlauf">
      {bloecke.length === 0 && status === "bereit" && <p className="leer">Schreib dem Agenten eine Nachricht.</p>}

      {bloecke.map((block, index) => {
        switch (block.art) {
          case "nutzer":
            return <div key={index} className="nachricht nutzer">{block.text}</div>;
          case "agent":
            return <div key={index} className="nachricht agent">{block.text}</div>;
          case "tool":
            return <ToolAufruf key={index} aufruf={block.aufruf} />;
          case "postfach":
            return (
              <button key={index} className="postfach-hinweis" onClick={zeigePostfach} title="Im Postfach ansehen">
                {block.text}
              </button>
            );
          case "postfach_aktion":
            return (
              <div key={index} className="postfach-aktion">
                {block.text}
                {block.details && <pre>{block.details}</pre>}
              </div>
            );
          case "fehler":
            return <div key={index} className="nachricht fehler">{block.text}</div>;
          case "modell":
            return <div key={index} className="modell-hinweis">{block.text}</div>;
        }
      })}

      {laufenderText && <div className="nachricht agent schreibt">{laufenderText}</div>}
      {statusHinweise[status] && !laufenderText && <div className="denkt">{statusHinweise[status]}</div>}
      <div ref={ende} />
    </div>
  );
}
