// MCP-Server-Seite: links die eingetragenen Server, rechts der gewählte mit Startbefehl und Tools.
// Welcher Agent welchen Server benutzen darf und mit welchen Regeln, steht auf der Agenten-Seite.
import { useEffect, useState } from "react";
import type { McpServer, McpServerDaten } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { AdtEinstellungen } from "../komponenten/AdtEinstellungen.tsx";
import { McpServerFormular } from "../komponenten/McpServerFormular.tsx";

/** Was rechts angezeigt wird */
type Ansicht = "ansehen" | "bearbeiten" | "neu";

export function McpSeite() {
  const [server, setServer] = useState<McpServer[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [ansicht, setAnsicht] = useState<Ansicht>("ansehen");
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api
      .holeMcpServer()
      .then((liste) => {
        setServer(liste);
        setGewaehlt((bisher) => bisher ?? liste[0]?.schluessel ?? null);
      })
      .catch((e) => setFehler(e.message));
  }, []);

  /** Führt eine Änderung aus; der Server antwortet mit der aktuellen Liste. */
  async function aendere(aktion: () => Promise<McpServer[]>, danach?: () => void) {
    setBeschaeftigt(true);
    setFehler(null);
    try {
      setServer(await aktion());
      danach?.();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  const aktuell = server.find((s) => s.schluessel === gewaehlt) ?? null;

  function speichere(daten: McpServerDaten) {
    if (ansicht === "neu") {
      aendere(
        () => api.legeMcpServerAn(daten),
        () => {
          setGewaehlt(daten.schluessel);
          setAnsicht("ansehen");
        },
      );
    } else {
      aendere(() => api.aendereMcpServer(daten), () => setAnsicht("ansehen"));
    }
  }

  function loesche(schluessel: string) {
    if (!confirm(`Server ${schluessel} mit allen Regeln löschen?`)) return;
    aendere(
      () => api.loescheMcpServer(schluessel),
      () => setGewaehlt(null),
    );
  }

  return (
    <div className="zweispaltig">
      <aside className="seiten-liste">
        <button
          className="knopf haupt"
          onClick={() => {
            setAnsicht("neu");
            setFehler(null);
          }}
        >
          Server eintragen
        </button>
        {server.length === 0 && <p className="leer">Noch keine Server eingetragen.</p>}
        {server.map((s) => (
          <button
            key={s.schluessel}
            className={s.schluessel === gewaehlt && ansicht !== "neu" ? "listen-eintrag aktiv" : "listen-eintrag"}
            onClick={() => {
              setGewaehlt(s.schluessel);
              setAnsicht("ansehen");
              setFehler(null);
            }}
          >
            <span className="chat-titel">{s.name}</span>
            {s.eingebaut && <span className="status-marke">eingebaut</span>}
            {s.leseFehler && <span className="fehler-punkt" title="Fehler beim Auslesen" />}
          </button>
        ))}
      </aside>

      <section className="detail">
        {fehler && <div className="fehlerleiste">{fehler}</div>}
        {beschaeftigt && <div className="denkt">Einen Moment …</div>}

        {ansicht === "neu" && (
          <>
            <h2>MCP-Server eintragen</h2>
            <McpServerFormular speichere={speichere} abbrechen={() => setAnsicht("ansehen")} beschaeftigt={beschaeftigt} />
          </>
        )}

        {ansicht !== "neu" && !aktuell && <div className="leer mitte">Wähle links einen Server oder trage einen neuen ein.</div>}

        {ansicht === "bearbeiten" && aktuell && (
          <>
            <h2>{aktuell.name} bearbeiten</h2>
            <McpServerFormular
              key={aktuell.schluessel}
              vorhanden={aktuell}
              speichere={speichere}
              abbrechen={() => setAnsicht("ansehen")}
              beschaeftigt={beschaeftigt}
            />
          </>
        )}

        {ansicht === "ansehen" && aktuell && (
          <>
            <h2>{aktuell.name}</h2>
            {/* Den eingebauten ADT-MCP startet die App selbst; eingestellt wird er im eigenen Formular. */}
            {aktuell.eingebaut ? (
              <AdtEinstellungen />
            ) : (
              <div className="server-kopf">
                <code>
                  {aktuell.befehl} {aktuell.argumente.join(" ")}
                </code>
                <div className="knopfreihe">
                  <button className="knopf" onClick={() => aendere(() => api.leseMcpTools(aktuell.schluessel))} disabled={beschaeftigt}>
                    Tools neu auslesen
                  </button>
                  <button className="knopf" onClick={() => setAnsicht("bearbeiten")} disabled={beschaeftigt}>
                    Bearbeiten
                  </button>
                  <button className="knopf" onClick={() => loesche(aktuell.schluessel)} disabled={beschaeftigt}>
                    Löschen
                  </button>
                </div>
              </div>
            )}

            {aktuell.leseFehler && <div className="fehlerleiste">Auslesen fehlgeschlagen: {aktuell.leseFehler}</div>}
            {aktuell.toolsGelesenAm && (
              <p className="hinweis">
                {aktuell.tools.length} Tools, ausgelesen am {new Date(aktuell.toolsGelesenAm).toLocaleString("de-DE")}. Tools heißen für den
                Agenten <code>{aktuell.schluessel}-…</code>
              </p>
            )}

            <p className="hinweis">
              {aktuell.agenten.length > 0
                ? `Benutzt von: ${aktuell.agenten.join(", ")}. `
                : "Noch keinem Agenten zugeordnet – die Agenten benutzen ihn erst, wenn du ihn auf der Seite Agenten anhakst. "}
              Die Regeln je Tool (erlauben, Freigabe …) stellst du dort je Agent ein.
            </p>

            {aktuell.tools.length === 0 ? (
              <p className="leer">Noch keine Tools ausgelesen.</p>
            ) : (
              <table className="tabelle">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Beschreibung</th>
                  </tr>
                </thead>
                <tbody>
                  {aktuell.tools.map((tool) => (
                    <tr key={tool.name}>
                      <td className="tool-name">
                        {tool.name}
                        {tool.nurLesend && <span className="marke-lesend" title="Laut Server ändert dieses Tool nichts">nur lesend</span>}
                      </td>
                      <td className="tool-beschreibung">{tool.beschreibung}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
