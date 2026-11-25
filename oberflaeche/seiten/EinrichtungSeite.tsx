// Einrichtung: prüft, ob alles da ist, was die App braucht, und sagt, was zu tun ist.
// Nur prüfen und anzeigen – Einstellungen ändert David weiter in einstellungen.json (E-60).
import { useEffect, useState } from "react";
import type { EinrichtungsBericht, Pruefung } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";

const zeichen = (ok: boolean | null) => (ok === true ? "✓" : ok === false ? "✗" : "i");
const klasse = (ok: boolean | null) => (ok === true ? "ok" : ok === false ? "fehler" : "info");

function Zeile({ pruefung }: { pruefung: Pruefung }) {
  return (
    <div className={`pruefung ${klasse(pruefung.ok)}`}>
      <span className="pruefung-zeichen">{zeichen(pruefung.ok)}</span>
      <div>
        <div className="pruefung-titel">{pruefung.titel}</div>
        <div>{pruefung.text}</div>
        {pruefung.hinweis && <div className="pruefung-hinweis">{pruefung.hinweis}</div>}
      </div>
    </div>
  );
}

export function EinrichtungSeite() {
  const [bericht, setBericht] = useState<EinrichtungsBericht | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function pruefe(mcpStarten: boolean) {
    setLaeuft(true);
    setFehler(null);
    try {
      setBericht(await api.pruefeEinrichtung(mcpStarten));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  useEffect(() => {
    pruefe(false);
  }, []);

  const fehlerAnzahl = bericht?.pruefungen.filter((p) => p.ok === false).length ?? 0;

  return (
    <div className="detail breit">
      <div className="server-kopf">
        <h2>Einrichtung</h2>
        <div className="knopfreihe">
          <button className="knopf" onClick={() => pruefe(false)} disabled={laeuft}>
            Neu prüfen
          </button>
          <button className="knopf" onClick={() => pruefe(true)} disabled={laeuft} title="Startet jeden MCP-Server kurz – beim SAP-MCP kann Edge für das Cookie aufgehen">
            MCP-Server starten und prüfen
          </button>
        </div>
      </div>
      {laeuft && <div className="denkt">Prüfe …</div>}
      {fehler && <div className="fehlerleiste">{fehler}</div>}

      {bericht && (
        <>
          <p className="hinweis">
            {fehlerAnzahl === 0 ? "Alles in Ordnung." : `${fehlerAnzahl} ${fehlerAnzahl === 1 ? "Punkt braucht" : "Punkte brauchen"} Aufmerksamkeit.`} Bei
            den MCP-Servern steht zunächst das Ergebnis des letzten Auslesens.
          </p>
          <div className="pruefungen">
            {bericht.pruefungen.map((p, i) => (
              <Zeile key={i} pruefung={p} />
            ))}
          </div>

          <h3>Einstellungen</h3>
          <p className="hinweis">So benutzt die App sie gerade. Ändern in einstellungen.json, danach die App neu starten.</p>
          <table className="tabelle">
            <tbody>
              {bericht.einstellungen.map((e) => (
                <tr key={e.name}>
                  <td>{e.name}</td>
                  <td>
                    <code>{e.wert}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
