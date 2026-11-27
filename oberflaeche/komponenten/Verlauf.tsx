// Zeigt den Verlauf eines Chats: Nachrichten, Tool-Aufrufe, Fehler und den Text, den der Agent gerade schreibt.
// Vorschläge erscheinen als Karte zum Freigeben, Rückfragen als hervorgehobene Frage (E-52).
// Antworten des Agenten als Markdown (E-59); Davids Nachrichten bleiben reiner Text.
// Hat ein ADT-Tool etwas im System geändert, steht darunter der Vergleich mit „Rückgängig“ (E-31).
import { useEffect, useRef, type ReactNode } from "react";
import { findeAenderungsId } from "../../gemeinsam/aenderungs-hinweis.ts";
import type { AufgabenStatus, Ereignis, PostfachArt, PostfachEintrag, VerbrauchSumme } from "../../gemeinsam/typen.ts";
import { verbrauchText } from "../verbrauch-text.ts";
import { AenderungsKarte } from "./AenderungsKarte.tsx";
import { Markdown } from "./Markdown.tsx";
import { PostfachKarte, type PostfachAktionen } from "./PostfachKarte.tsx";
import { ToolAufruf, type ToolAufrufDaten } from "./ToolAufruf.tsx";
import { WorkflowLaufKarte } from "./WorkflowLaufKarte.tsx";

/** Was im Verlauf als eigener Block erscheint */
type Block =
  | { art: "nutzer"; text: string }
  | { art: "agent"; text: string }
  | { art: "tool"; aufruf: ToolAufrufDaten }
  /** `ausfuehrung`: der zugehörige Tool-Aufruf – seine Karte entfällt, die Vorschlagskarte zeigt ihn */
  | { art: "postfach"; nr: number; eintragsArt: PostfachArt; ausfuehrung?: ToolAufrufDaten }
  | { art: "postfach_aktion"; text: string; details?: string }
  | { art: "zurueckgenommen"; text: string }
  | { art: "workflow"; laufNr: number; workflowName: string }
  /** Kleine graue Zeile: welches Modell bzw. welcher Agent */
  | { art: "modell"; text: string }
  | { art: "verbrauch"; summe: VerbrauchSumme }
  | { art: "abbruch"; text: string }
  | { art: "fehler"; text: string };

/**
 * Macht aus der Ereignisliste die Blöcke für die Anzeige. Tool-Start und -Ende werden zu einem Block.
 * Braucht ein Tool-Aufruf eine Freigabe, steht nur die Vorschlagskarte da (E-54); ebenso zeigt eine
 * Rückfrage nur die Frage, nicht den Aufruf von rueckfrage_stellen.
 */
function bildeBloecke(ereignisse: Ereignis[]): Block[] {
  const bloecke: Block[] = [];
  const toolBloecke = new Map<string, ToolAufrufDaten>();
  let letztesModell = "";
  let letzterAgent = "";

  // Aufrufe, die zu einem Vorschlag gehören (Copilot meldet den Vorschlag ggf. vor dem Tool-Start)
  const mitVorschlag = new Set(ereignisse.flatMap((e) => (e.art === "postfach" && e.aufrufId ? [e.aufrufId] : [])));

  for (const ereignis of ereignisse) {
    switch (ereignis.art) {
      case "nutzer_nachricht":
        bloecke.push({ art: "nutzer", text: ereignis.text });
        break;
      case "agent_nachricht":
        bloecke.push({ art: "agent", text: ereignis.text });
        break;
      case "tool_start": {
        // Vorhandenen Eintrag weiterverwenden, falls der Vorschlag schon vorher kam
        const aufruf = toolBloecke.get(ereignis.aufrufId) ?? { aufrufId: ereignis.aufrufId, toolName: "", argumente: null };
        aufruf.toolName = ereignis.toolName;
        aufruf.argumente = ereignis.argumente;
        toolBloecke.set(ereignis.aufrufId, aufruf);
        const versteckt = mitVorschlag.has(ereignis.aufrufId) || ereignis.toolName === "rueckfrage_stellen";
        if (!versteckt) bloecke.push({ art: "tool", aufruf });
        break;
      }
      case "tool_ende": {
        const aufruf = toolBloecke.get(ereignis.aufrufId);
        if (aufruf) aufruf.ende = { erfolgreich: ereignis.erfolgreich, ergebnis: ereignis.ergebnis };
        break;
      }
      case "postfach":
        bloecke.push({
          art: "postfach",
          nr: ereignis.postfachNr,
          eintragsArt: ereignis.eintragsArt,
          ausfuehrung: ereignis.aufrufId ? (toolBloecke.get(ereignis.aufrufId) ?? legeAn(toolBloecke, ereignis.aufrufId)) : undefined,
        });
        break;
      case "postfach_aktion":
        bloecke.push({ art: "postfach_aktion", text: ereignis.text, details: ereignis.details });
        break;
      case "adt_zurueckgenommen":
        bloecke.push({ art: "zurueckgenommen", text: ereignis.text });
        break;
      case "workflow_lauf":
        bloecke.push({ art: "workflow", laufNr: ereignis.laufNr, workflowName: ereignis.workflowName });
        break;
      case "modell":
        // Nur anzeigen, wenn sich das Modell ändert – sonst stünde es nach jedem Aufruf da.
        if (ereignis.modell !== letztesModell) bloecke.push({ art: "modell", text: `Modell: ${ereignis.modell}` });
        letztesModell = ereignis.modell;
        break;
      case "agent":
        // Ebenso der Agent: nur am Anfang und beim Wechsel (E-56)
        if (ereignis.agentId !== letzterAgent) bloecke.push({ art: "modell", text: `Agent: ${ereignis.name}` });
        letzterAgent = ereignis.agentId;
        break;
      case "lauf_verbrauch":
        bloecke.push({ art: "verbrauch", summe: ereignis });
        break;
      case "abbruch":
        bloecke.push({ art: "abbruch", text: ereignis.text });
        break;
      case "fehler":
        bloecke.push({ art: "fehler", text: ereignis.meldung });
        break;
    }
  }
  return bloecke;
}

/** Hinweis unter dem Verlauf, solange der Chat nicht einfach auf eine Nachricht wartet */
const statusHinweise: Partial<Record<AufgabenStatus, string>> = {
  arbeitet: "Agent arbeitet …",
  eingereiht: "Eingereiht – kommt gleich dran.",
  wartet: "Wartet auf dich.",
  erledigt: "Aufgabe erledigt.",
  abgebrochen: "Aufgabe abgebrochen.",
};

interface Eigenschaften {
  aufgabeId: string;
  ereignisse: Ereignis[];
  /** Text, den der Agent gerade schreibt (noch nicht fertig) */
  laufenderText: string;
  status: AufgabenStatus;
  /** Vorschläge und Rückfragen dieses Chats, mit aktuellem Stand */
  eintraege: PostfachEintrag[];
  aktionen: (eintrag: PostfachEintrag) => PostfachAktionen;
  /** Nummer des Eintrags, für den gerade eine Aktion läuft */
  beschaeftigt: number | null;
  /** Zur Lauf-Ansicht eines Workflows, den der Agent gestartet hat */
  zeigeLauf?: (nr: number) => void;
}

export function Verlauf({ aufgabeId, ereignisse, laufenderText, status, eintraege, aktionen, beschaeftigt, zeigeLauf }: Eigenschaften) {
  const ende = useRef<HTMLDivElement>(null);

  // Bei neuen Inhalten nach unten scrollen
  useEffect(() => {
    ende.current?.scrollIntoView({ block: "end" });
  }, [ereignisse.length, laufenderText]);

  const bloecke = bildeBloecke(ereignisse);

  // Vergleich und Rückgängig unter einem erfolgreichen Aufruf, der einen Änderungssatz meldet
  const zurueckgenommen = new Set(ereignisse.flatMap((e) => (e.art === "adt_zurueckgenommen" ? [e.aenderungId] : [])));
  const gesperrt = status === "arbeitet" || status === "wartet" || status === "eingereiht";
  const mitAenderung = (index: number, karte: ReactNode, ende?: ToolAufrufDaten["ende"]) => {
    const id = ende?.erfolgreich ? findeAenderungsId(ende.ergebnis) : null;
    if (!id) return karte;
    return (
      <div key={index} className="mit-aenderung">
        {karte}
        <AenderungsKarte id={id} aufgabeId={aufgabeId} gesperrt={gesperrt} zurueckgenommen={zurueckgenommen.has(id)} />
      </div>
    );
  };

  return (
    <div className="verlauf">
      {bloecke.length === 0 && status === "bereit" && <p className="leer">Schreib dem Agenten eine Nachricht.</p>}

      {bloecke.map((block, index) => {
        switch (block.art) {
          case "nutzer":
            return <div key={index} className="nachricht nutzer">{block.text}</div>;
          case "agent":
            return (
              <div key={index} className="nachricht agent">
                <Markdown text={block.text} />
              </div>
            );
          case "tool":
            return mitAenderung(index, <ToolAufruf key={index} aufruf={block.aufruf} />, block.aufruf.ende);
          case "postfach": {
            const eintrag = eintraege.find((e) => e.nr === block.nr);
            // Meldungen zeigt schon die Tool-Karte darüber; im Chat braucht es dafür nichts Eigenes.
            if (!eintrag || block.eintragsArt === "meldung") return null;
            if (eintrag.art === "rueckfrage") return <Rueckfrage key={index} eintrag={eintrag} />;
            return mitAenderung(
              index,
              <PostfachKarte
                key={index}
                eintrag={eintrag}
                aktionen={aktionen(eintrag)}
                beschaeftigt={beschaeftigt === eintrag.nr}
                ausfuehrung={block.ausfuehrung?.ende}
                imChat
              />,
              block.ausfuehrung?.ende,
            );
          }
          case "postfach_aktion":
            return (
              <div key={index} className="postfach-aktion">
                {block.text}
                {block.details && <pre>{block.details}</pre>}
              </div>
            );
          case "zurueckgenommen":
            return <div key={index} className="postfach-aktion">{block.text}</div>;
          case "workflow":
            return <WorkflowLaufKarte key={index} laufNr={block.laufNr} workflowName={block.workflowName} zeigeLauf={zeigeLauf} />;
          case "fehler":
            return <div key={index} className="nachricht fehler">{block.text}</div>;
          case "modell":
            return <div key={index} className="modell-hinweis">{block.text}</div>;
          case "verbrauch":
            return (
              <div key={index} className="verbrauch-hinweis" title="Verbrauch dieser Nachricht, laut Copilot">
                {verbrauchText(block.summe)}
              </div>
            );
          case "abbruch":
            return <div key={index} className="abbruch-hinweis">{block.text}</div>;
        }
      })}

      {laufenderText && (
        <div className="nachricht agent schreibt">
          <Markdown text={laufenderText} />
        </div>
      )}
      {statusHinweise[status] && !laufenderText && <div className="denkt">{statusHinweise[status]}</div>}
      <div ref={ende} />
    </div>
  );
}

/** Rückfrage des Agenten. Beantwortet wird sie im normalen Eingabefeld unten. */
function Rueckfrage({ eintrag }: { eintrag: PostfachEintrag }) {
  const frage = String((eintrag.argumente as { frage?: string })?.frage ?? "");
  const offen = eintrag.status === "offen";
  return (
    <div className={offen ? "rueckfrage offen" : "rueckfrage"}>
      <div className="rueckfrage-kopf">Rückfrage #{eintrag.nr}</div>
      <div>{frage}</div>
      <div className="hinweis">
        {offen ? "Antworte unten im Eingabefeld." : eintrag.status === "verworfen" ? "Verworfen." : "Beantwortet."}
      </div>
    </div>
  );
}

/**
 * Kommt der Vorschlag vor dem Tool-Start, wird der Aufruf hier schon angelegt; Start und Ende
 * füllen ihn dann. So hängt das Ergebnis immer an der Vorschlagskarte.
 */
function legeAn(toolBloecke: Map<string, ToolAufrufDaten>, aufrufId: string): ToolAufrufDaten {
  const aufruf: ToolAufrufDaten = { aufrufId, toolName: "", argumente: null };
  toolBloecke.set(aufrufId, aufruf);
  return aufruf;
}
