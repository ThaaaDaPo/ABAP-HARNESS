// Formular eines Agenten: Name, Auftrag, Standardmodell, MCP-Server, Instructions, Skills und Workflows.
// Gespeichert wird mit „Speichern“; die Regeln je Tool darunter (AgentRegeln) wirken sofort.
import { useState } from "react";
import type { Agent, AgentDaten, InstructionsUebersicht, McpServer, ModellInfo, WorkflowInfo } from "../../gemeinsam/typen.ts";
import { ModellWahl } from "./ModellWahl.tsx";

interface Eigenschaften {
  agent: Agent;
  modelle: ModellInfo[];
  server: McpServer[];
  /** Null, solange noch nicht geladen */
  instructions: InstructionsUebersicht | null;
  workflows: WorkflowInfo[];
  speichere: (daten: AgentDaten) => void;
  beschaeftigt: boolean;
}

/** Hakt einen Eintrag an oder ab. */
function umschalten(liste: string[], wert: string, an: boolean): string[] {
  return an ? [...liste, wert] : liste.filter((w) => w !== wert);
}

export function AgentFormular({ agent, modelle, server, instructions, workflows, speichere, beschaeftigt }: Eigenschaften) {
  const { id: _id, erstelltAm: _erstellt, ...gespeichert } = agent;
  const [daten, setDaten] = useState<AgentDaten>(gespeichert);
  const geaendert = JSON.stringify(daten) !== JSON.stringify(gespeichert);
  const setze = (teil: Partial<AgentDaten>) => setDaten((bisher) => ({ ...bisher, ...teil }));

  // Zugeordnet, aber im Ordner nicht (mehr) da – z. B. umbenannt oder anderer Ordner eingetragen
  const fehlendeInstructions = instructions ? daten.instructions.filter((p) => !instructions.instructions.some((i) => i.pfad === p)) : [];
  const fehlendeSkills = instructions ? daten.skills.filter((p) => !instructions.skills.some((s) => s.pfad === p)) : [];
  // Nur Workflows mit „Start durch Agent“ sind wählbar; zugeordnete ohne diesen Haken werden angezeigt, damit man sie abwählen kann.
  const startbar = workflows.filter((w) => w.definition?.start.durchAgent);
  const nichtStartbar = daten.workflows.filter((id) => !startbar.some((w) => w.id === id));

  return (
    <form
      className="formular"
      onSubmit={(e) => {
        e.preventDefault();
        speichere(daten);
      }}
    >
      <label>
        Name
        <input value={daten.name} onChange={(e) => setze({ name: e.target.value })} />
      </label>

      <label>
        Auftrag
        <span className="hinweis">Wer der Agent ist und wie er arbeiten soll (Systemprompt). Die zugeordneten Instructions kommen dahinter.</span>
        <textarea className="lesbar" value={daten.auftrag} onChange={(e) => setze({ auftrag: e.target.value })} rows={8} />
      </label>

      <div className="feld">
        <span className="feld-titel">Standardmodell</span>
        <span className="hinweis">Gilt in jedem Chat dieses Agenten, solange der Chat kein eigenes Modell wählt.</span>
        <div className="modell-wahl im-formular">
          <ModellWahl modelle={modelle} wahl={daten.modellWahl} aendere={(modellWahl) => setze({ modellWahl })} standardText="Automatisch" />
        </div>
      </div>

      <fieldset className="feld">
        <legend className="feld-titel">MCP-Server</legend>
        <span className="hinweis">Nur angehakte Server bekommt der Agent. Die Regeln je Tool stehen weiter unten.</span>
        {server.length === 0 && <span className="leer">Noch keine Server eingetragen (Seite MCP-Server).</span>}
        {server.map((s) => (
          <label key={s.schluessel} className="haken">
            <input
              type="checkbox"
              checked={daten.mcpServer.includes(s.schluessel)}
              onChange={(e) => setze({ mcpServer: umschalten(daten.mcpServer, s.schluessel, e.target.checked) })}
            />
            {s.name} <code>{s.schluessel}</code>
          </label>
        ))}
      </fieldset>

      <fieldset className="feld">
        <legend className="feld-titel">Instructions</legend>
        <span className="hinweis">Werden an den Auftrag gehängt – vollständig, unabhängig von applyTo.</span>
        {instructions?.fehler && <span className="fehler-text">{instructions.fehler}</span>}
        {instructions && !instructions.fehler && instructions.instructions.length === 0 && (
          <span className="leer">Keine *.instructions.md im Ordner.</span>
        )}
        {instructions?.instructions.map((i) => (
          <label key={i.pfad} className="haken">
            <input
              type="checkbox"
              checked={daten.instructions.includes(i.pfad)}
              onChange={(e) => setze({ instructions: umschalten(daten.instructions, i.pfad, e.target.checked) })}
            />
            <code>{i.pfad}</code>
            {i.beschreibung && <span className="hinweis">{i.beschreibung}</span>}
          </label>
        ))}
        {fehlendeInstructions.map((pfad) => (
          <label key={pfad} className="haken fehlt">
            <input type="checkbox" checked onChange={() => setze({ instructions: umschalten(daten.instructions, pfad, false) })} />
            <code>{pfad}</code> <span className="fehler-text">Datei fehlt</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="feld">
        <legend className="feld-titel">Skills</legend>
        <span className="hinweis">Copilot lädt einen Skill bei Bedarf. Nicht angehakte Skills sind für diesen Agenten abgeschaltet.</span>
        {instructions && !instructions.fehler && instructions.skills.length === 0 && <span className="leer">Keine Skills (Ordner mit SKILL.md).</span>}
        {instructions?.skills.map((s) => (
          <label key={s.pfad} className="haken">
            <input
              type="checkbox"
              checked={daten.skills.includes(s.pfad)}
              onChange={(e) => setze({ skills: umschalten(daten.skills, s.pfad, e.target.checked) })}
            />
            {s.name} <code>{s.pfad}</code>
            {s.beschreibung && <span className="hinweis">{s.beschreibung}</span>}
          </label>
        ))}
        {fehlendeSkills.map((pfad) => (
          <label key={pfad} className="haken fehlt">
            <input type="checkbox" checked onChange={() => setze({ skills: umschalten(daten.skills, pfad, false) })} />
            <code>{pfad}</code> <span className="fehler-text">Ordner fehlt</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="feld">
        <legend className="feld-titel">Workflows</legend>
        <span className="hinweis">Diese Workflows darf der Agent über das Tool workflow_starten starten. Wählbar sind nur Workflows mit „Start durch Agent“.</span>
        {startbar.length === 0 && <span className="leer">Keine Workflows mit „Start durch Agent“.</span>}
        {startbar.map((w) => (
          <label key={w.id} className="haken">
            <input
              type="checkbox"
              checked={daten.workflows.includes(w.id)}
              onChange={(e) => setze({ workflows: umschalten(daten.workflows, w.id, e.target.checked) })}
            />
            {w.definition!.name} <code>{w.id}</code>
            {w.definition!.beschreibung && <span className="hinweis">{w.definition!.beschreibung}</span>}
          </label>
        ))}
        {nichtStartbar.map((id) => (
          <label key={id} className="haken fehlt">
            <input type="checkbox" checked onChange={() => setze({ workflows: umschalten(daten.workflows, id, false) })} />
            <code>{id}</code> <span className="fehler-text">fehlt oder ohne „Start durch Agent“</span>
          </label>
        ))}
      </fieldset>

      <div className="knopfreihe">
        <button type="submit" className="knopf haupt" disabled={beschaeftigt || !geaendert}>
          Speichern
        </button>
        {geaendert && (
          <button type="button" className="knopf" onClick={() => setDaten(gespeichert)} disabled={beschaeftigt}>
            Verwerfen
          </button>
        )}
        {geaendert && <span className="hinweis">Ungespeicherte Änderungen. Gilt nach dem Speichern ab der nächsten Nachricht.</span>}
      </div>
    </form>
  );
}
