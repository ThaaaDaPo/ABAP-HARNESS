// Workflows-Seite: links die Workflows aus dem Workflow-Ordner, rechts der gewählte mit Editor oder
// seinen Läufen – oder ein einzelner Lauf (Lauf-Ansicht), z. B. nach dem Sprung aus Chat oder Postfach.
import { useCallback, useEffect, useState } from "react";
import type { Agent, McpServer, WorkflowDefinition, WorkflowInfo, WorkflowLauf } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { LaufAnsicht } from "../komponenten/workflow/LaufAnsicht.tsx";
import { StartFormular } from "../komponenten/workflow/StartFormular.tsx";
import { ausloeserText, laufStatusText } from "../komponenten/workflow/texte.ts";
import { WorkflowEditor } from "../komponenten/workflow/WorkflowEditor.tsx";
import { useUebersicht } from "../live/useUebersicht.ts";
import { creditText } from "../verbrauch-text.ts";

interface Eigenschaften {
  laufNr: number | null;
  waehleLauf: (nr: number | null) => void;
  zeigeChat: (aufgabeId: string) => void;
}

export function WorkflowsSeite({ laufNr, waehleLauf, zeigeChat }: Eigenschaften) {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [ordner, setOrdner] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<"ablauf" | "laeufe">("ablauf");
  const [agenten, setAgenten] = useState<Agent[]>([]);
  const [server, setServer] = useState<McpServer[]>([]);
  const [starten, setStarten] = useState(false);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeListe = useCallback(() => {
    api
      .holeWorkflows()
      .then(({ ordner, workflows }) => {
        setOrdner(ordner);
        setWorkflows(workflows);
      })
      .catch((e) => setFehler(e.message));
  }, []);
  useEffect(() => {
    ladeListe();
    api.holeAgenten().then(setAgenten).catch((e) => setFehler(e.message));
    api.holeMcpServer().then(setServer).catch((e) => setFehler(e.message));
  }, [ladeListe]);
  useUebersicht("workflows", ladeListe);

  const aktuell = workflows.find((w) => w.id === gewaehlt) ?? null;

  async function aktion(was: () => Promise<void>) {
    setBeschaeftigt(true);
    setFehler(null);
    try {
      await was();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  const neu = () =>
    aktion(async () => {
      const name = prompt("Name des neuen Workflows:")?.trim();
      if (!name) return;
      const { id } = await api.legeWorkflowAn(name);
      ladeListe();
      waehle(id);
    });

  const speichere = (definition: WorkflowDefinition) =>
    aktion(async () => {
      await api.speichereWorkflow(aktuell!.id, definition);
      ladeListe();
    });

  const loesche = () =>
    aktion(async () => {
      if (!confirm(`Workflow „${aktuell!.definition?.name ?? aktuell!.id}“ löschen? Die Datei wird entfernt; bisherige Läufe bleiben sichtbar.`)) return;
      await api.loescheWorkflow(aktuell!.id);
      setGewaehlt(null);
      ladeListe();
    });

  const starte = (eingaben: Record<string, unknown>) =>
    aktion(async () => {
      const lauf = await api.starteWorkflow(aktuell!.id, eingaben);
      setStarten(false);
      waehleLauf(lauf.nr);
    });

  function waehle(id: string) {
    setGewaehlt(id);
    setStarten(false);
    setAnsicht("ablauf");
    setFehler(null);
    waehleLauf(null);
  }

  return (
    <div className="zweispaltig">
      <aside className="seiten-liste">
        <button className="knopf haupt" onClick={neu} disabled={beschaeftigt}>
          Neuer Workflow
        </button>
        {workflows.length === 0 && <p className="leer">Noch keine Workflows.</p>}
        {workflows.map((w) => (
          <button key={w.id} className={w.id === gewaehlt && laufNr === null ? "listen-eintrag aktiv" : "listen-eintrag"} onClick={() => waehle(w.id)}>
            <span className="chat-titel">{w.definition?.name ?? w.id}</span>
            {(w.fehler || w.warnungen.length > 0) && <span className="fehler-punkt" title={w.fehler ?? w.warnungen.join("\n")} />}
            {w.definition?.start.zeitplan && <span className="status-marke" title="Zeitgesteuert">⏱</span>}
            {w.letzterLauf && (w.letzterLauf.status === "laeuft" || w.letzterLauf.status === "wartet") && (
              <span className={`status-marke ${w.letzterLauf.status === "wartet" ? "wartet" : "eingereiht"}`}>{laufStatusText[w.letzterLauf.status]}</span>
            )}
          </button>
        ))}
        {ordner && <p className="hinweis ordner-hinweis">Ordner: {ordner}</p>}
      </aside>

      {laufNr !== null ? (
        <LaufAnsicht key={laufNr} nr={laufNr} zurueck={() => waehleLauf(null)} zeigeChat={zeigeChat} zeigeLauf={waehleLauf} />
      ) : (
        <section className="detail">
          {fehler && <div className="fehlerleiste">{fehler}</div>}
          {!aktuell && <LetzteLaeufe waehleLauf={waehleLauf} />}

          {aktuell && (
            <>
              <div className="server-kopf">
                <h2>
                  {aktuell.definition?.name ?? aktuell.id} <code>{aktuell.id}.workflow.json</code>
                </h2>
                <div className="knopfreihe">
                  {aktuell.definition?.start.manuell && (
                    <button
                      className="knopf haupt"
                      disabled={beschaeftigt}
                      onClick={() => (aktuell.definition!.eingaben.length > 0 ? setStarten(true) : starte({}))}
                    >
                      Starten
                    </button>
                  )}
                  <button className="knopf" onClick={loesche} disabled={beschaeftigt}>
                    Löschen
                  </button>
                </div>
              </div>
              {aktuell.fehler && <div className="fehlerleiste">{aktuell.fehler} – Datei im Ordner korrigieren.</div>}
              {aktuell.warnungen.map((w) => (
                <div key={w} className="abbruch-hinweis">
                  {w}
                </div>
              ))}
              {starten && aktuell.definition && (
                <StartFormular definition={aktuell.definition} starte={starte} schliesse={() => setStarten(false)} beschaeftigt={beschaeftigt} />
              )}

              <div className="reiter">
                <button className={ansicht === "ablauf" ? "reiter-knopf aktiv" : "reiter-knopf"} onClick={() => setAnsicht("ablauf")}>
                  Ablauf
                </button>
                <button className={ansicht === "laeufe" ? "reiter-knopf aktiv" : "reiter-knopf"} onClick={() => setAnsicht("laeufe")}>
                  Läufe
                </button>
              </div>

              {ansicht === "ablauf" && aktuell.definition && (
                // key: Nach dem Speichern oder bei Änderungen an der Datei startet der Editor mit dem gespeicherten Stand
                <WorkflowEditor
                  key={`${aktuell.id}-${JSON.stringify(aktuell.definition)}`}
                  definition={aktuell.definition}
                  kontext={{ agenten, server, workflows, eigeneId: aktuell.id }}
                  speichere={speichere}
                  beschaeftigt={beschaeftigt}
                />
              )}
              {ansicht === "laeufe" && <LaufListe workflowId={aktuell.id} waehleLauf={waehleLauf} />}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** Läufe eines Workflows bzw. (ohne workflowId) die letzten Läufe aller Workflows */
function LaufListe({ workflowId, waehleLauf }: { workflowId?: string; waehleLauf: (nr: number) => void }) {
  const [laeufe, setLaeufe] = useState<WorkflowLauf[]>([]);
  const lade = useCallback(() => {
    (workflowId ? api.holeLaeufeDesWorkflows(workflowId) : api.holeAlleLaeufe()).then(setLaeufe).catch(() => {});
  }, [workflowId]);
  useEffect(lade, [lade]);
  useUebersicht("workflows", lade);

  if (laeufe.length === 0) return <p className="leer">Noch keine Läufe.</p>;
  return (
    <table className="tabelle">
      <thead>
        <tr>
          <th>Lauf</th>
          {!workflowId && <th>Workflow</th>}
          <th>Status</th>
          <th>Start</th>
          <th>Gestartet</th>
          <th className="zahl">Verbrauch</th>
        </tr>
      </thead>
      <tbody>
        {laeufe.map((lauf) => (
          <tr key={lauf.nr} className="klickbar" onClick={() => waehleLauf(lauf.nr)}>
            <td>#{lauf.nr}</td>
            {!workflowId && <td>{lauf.workflowName}</td>}
            <td>
              <span className={`lauf-status ${lauf.status}`}>{laufStatusText[lauf.status]}</span>
              {lauf.aktuellerSchritt && <span className="hinweis"> {lauf.aktuellerSchritt}</span>}
            </td>
            <td>{ausloeserText[lauf.ausloeser]}</td>
            <td>{new Date(lauf.gestartetAm).toLocaleString("de-DE")}</td>
            <td className="zahl">{lauf.verbrauch.aufrufe > 0 ? creditText(lauf.verbrauch) : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LetzteLaeufe({ waehleLauf }: { waehleLauf: (nr: number) => void }) {
  return (
    <>
      <h2>Workflows</h2>
      <p className="hinweis">
        Ein Workflow ist ein fester Ablauf: Tool-Schritte ohne KI, KI-Schritte genau dort, wo es eine KI braucht, dazu Bedingungen und Schleifen.
        Wähle links einen Workflow oder lege einen neuen an.
      </p>
      <h3>Letzte Läufe</h3>
      <LaufListe waehleLauf={waehleLauf} />
    </>
  );
}
