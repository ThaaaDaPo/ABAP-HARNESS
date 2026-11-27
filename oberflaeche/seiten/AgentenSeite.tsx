// Agenten-Seite: links die Agenten, rechts der gewählte mit Formular und Regeln je Tool.
import { useEffect, useState } from "react";
import type { Agent, AgentDaten, InstructionsUebersicht, McpServer, ModellInfo, WorkflowInfo } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { AgentFormular } from "../komponenten/AgentFormular.tsx";
import { AgentRegeln } from "../komponenten/AgentRegeln.tsx";

export function AgentenSeite() {
  const [agenten, setAgenten] = useState<Agent[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [modelle, setModelle] = useState<ModellInfo[]>([]);
  const [server, setServer] = useState<McpServer[]>([]);
  const [instructions, setInstructions] = useState<InstructionsUebersicht | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api
      .holeAgenten()
      .then((liste) => {
        setAgenten(liste);
        setGewaehlt((bisher) => bisher ?? liste[0]?.id ?? null);
      })
      .catch((e) => setFehler(e.message));
    api.holeModelle().then(setModelle).catch((e) => setFehler(`Modelle: ${e.message}`));
    api.holeMcpServer().then(setServer).catch((e) => setFehler(e.message));
    api.holeInstructions().then(setInstructions).catch((e) => setFehler(e.message));
    api.holeWorkflows().then((antwort) => setWorkflows(antwort.workflows)).catch((e) => setFehler(e.message));
  }, []);

  /** Führt eine Änderung aus und lädt danach die Liste neu. */
  async function aendere(aktion: () => Promise<Agent | void>) {
    setBeschaeftigt(true);
    setFehler(null);
    try {
      const agent = await aktion();
      setAgenten(await api.holeAgenten());
      if (agent) setGewaehlt(agent.id);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  const aktuell = agenten.find((a) => a.id === gewaehlt) ?? null;

  function loesche(agent: Agent) {
    if (!confirm(`Agent „${agent.name}“ löschen? Seine Chats übernimmt der Standard-Agent.`)) return;
    aendere(async () => {
      await api.loescheAgent(agent.id);
      setGewaehlt(null);
    });
  }

  return (
    <div className="zweispaltig">
      <aside className="seiten-liste">
        <button className="knopf haupt" onClick={() => aendere(api.legeAgentAn)} disabled={beschaeftigt}>
          Neuer Agent
        </button>
        {agenten.map((a) => (
          <button
            key={a.id}
            className={a.id === gewaehlt ? "listen-eintrag aktiv" : "listen-eintrag"}
            onClick={() => {
              setGewaehlt(a.id);
              setFehler(null);
            }}
          >
            <span className="chat-titel">{a.name}</span>
            {a.id === "standard" && <span className="status-marke">Standard</span>}
            {a.id === "sprache" && <span className="status-marke">Sprechen</span>}
          </button>
        ))}
      </aside>

      <section className="detail">
        {fehler && <div className="fehlerleiste">{fehler}</div>}
        {!aktuell && <div className="leer mitte">Wähle links einen Agenten oder lege einen neuen an.</div>}

        {aktuell && (
          <>
            <div className="server-kopf">
              <h2>{aktuell.name}</h2>
              <div className="knopfreihe">
                <button className="knopf" onClick={() => aendere(() => api.kopiereAgent(aktuell.id))} disabled={beschaeftigt} title="Neuer Agent mit denselben Einstellungen und Regeln">
                  Kopieren
                </button>
                {aktuell.id !== "standard" && aktuell.id !== "sprache" && (
                  <button className="knopf" onClick={() => loesche(aktuell)} disabled={beschaeftigt}>
                    Löschen
                  </button>
                )}
              </div>
            </div>
            {/* key: Beim Wechsel des Agenten oder nach dem Speichern startet das Formular mit dem gespeicherten Stand */}
            <AgentFormular
              key={`${aktuell.id}-${JSON.stringify(aktuell)}`}
              agent={aktuell}
              modelle={modelle}
              server={server}
              instructions={instructions}
              workflows={workflows}
              speichere={(daten: AgentDaten) => aendere(() => api.speichereAgent(aktuell.id, daten))}
              beschaeftigt={beschaeftigt}
            />
            <AgentRegeln agentId={aktuell.id} mcpServer={aktuell.mcpServer} />
          </>
        )}
      </section>
    </div>
  );
}
