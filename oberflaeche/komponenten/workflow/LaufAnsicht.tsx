// Lauf-Ansicht: was ein Workflow-Lauf getan hat und gerade tut – Schritt für Schritt mit Eingabe und
// Ergebnis, eingerückt nach Bedingung und Schleife. Offene Freigaben lassen sich hier direkt erledigen,
// und bei KI-Schritten ist der Verlauf des Agenten aufklappbar.
import { useCallback, useEffect, useState } from "react";
import type { LaufMitSchritten, LaufSchritt, PostfachEintrag } from "../../../gemeinsam/typen.ts";
import * as api from "../../api.ts";
import { useUebersicht } from "../../live/useUebersicht.ts";
import { creditText } from "../../verbrauch-text.ts";
import { PostfachKarte } from "../PostfachKarte.tsx";
import { KiVerlauf } from "./KiVerlauf.tsx";
import { artText, ausloeserText, laufStatusText, schrittStatusText } from "./texte.ts";

interface Eigenschaften {
  nr: number;
  zurueck: () => void;
  zeigeChat: (aufgabeId: string) => void;
  zeigeLauf: (nr: number) => void;
}

const alsText = (wert: unknown) => (typeof wert === "string" ? wert : JSON.stringify(wert, null, 2));

export function LaufAnsicht({ nr, zurueck, zeigeChat, zeigeLauf }: Eigenschaften) {
  const [daten, setDaten] = useState<LaufMitSchritten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState<number | null>(null);

  const lade = useCallback(() => {
    api.holeLauf(nr).then(setDaten).catch((e) => setFehler(e.message));
  }, [nr]);
  useEffect(lade, [lade]);
  useUebersicht("workflows", lade);
  useUebersicht("postfach", lade);

  async function handle(aktion: () => Promise<unknown>, eintragNr: number | null = null) {
    setBeschaeftigt(eintragNr ?? -1);
    setFehler(null);
    try {
      await aktion();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(null);
      lade();
    }
  }

  if (!daten) return <div className="detail">{fehler ? <div className="fehlerleiste">{fehler}</div> : <p className="leer">Lädt …</p>}</div>;
  const { lauf, schritte, postfach } = daten;
  const aktiv = lauf.status === "laeuft" || lauf.status === "wartet";
  const fortsetzbar = lauf.status === "unterbrochen" || lauf.status === "fehlgeschlagen";
  const credits = lauf.verbrauch.nanoAiu / 1e9;

  return (
    <div className="detail lauf-ansicht">
      <button className="karten-chat" onClick={zurueck}>
        ← zurück
      </button>
      <div className="server-kopf">
        <h2>
          {lauf.workflowName} · Lauf #{lauf.nr}
        </h2>
        <div className="knopfreihe">
          {aktiv && (
            <button className="knopf" disabled={beschaeftigt !== null} onClick={() => confirm("Lauf abbrechen?") && handle(() => api.brecheLaufAb(nr))}>
              Abbrechen
            </button>
          )}
          {fortsetzbar && (
            <button className="knopf haupt" disabled={beschaeftigt !== null} onClick={() => handle(() => api.setzeLaufFort(nr))} title="Fertige Schritte werden nicht wiederholt">
              {lauf.status === "fehlgeschlagen" ? "Erneut versuchen" : "Fortsetzen"}
            </button>
          )}
        </div>
      </div>
      <div className="lauf-kennzahlen">
        <span className={`lauf-status ${lauf.status}`}>{laufStatusText[lauf.status]}</span>
        <span>Start: {ausloeserText[lauf.ausloeser]}</span>
        <span>{new Date(lauf.gestartetAm).toLocaleString("de-DE")}</span>
        {lauf.beendetAm && <span>bis {new Date(lauf.beendetAm).toLocaleTimeString("de-DE")}</span>}
        <span title="Verbrauch der KI-Schritte dieses Laufs">
          {creditText(lauf.verbrauch)} von {lauf.creditLimit} ({Math.round((credits / lauf.creditLimit) * 100)} %)
        </span>
        {lauf.chatAufgabeId && (
          <button className="karten-chat" onClick={() => zeigeChat(lauf.chatAufgabeId!)}>
            aus dem Chat gestartet
          </button>
        )}
        {lauf.elternLauf && (
          <button className="karten-chat" onClick={() => zeigeLauf(lauf.elternLauf!)}>
            Teil von Lauf #{lauf.elternLauf}
          </button>
        )}
      </div>
      {lauf.aktuellerSchritt && <p className="hinweis">Gerade: {lauf.aktuellerSchritt}</p>}
      {fehler && <div className="fehlerleiste">{fehler}</div>}
      {lauf.fehler && <div className={lauf.status === "unterbrochen" ? "abbruch-hinweis" : "fehlerleiste"}>{lauf.fehler}</div>}
      {lauf.ergebnis !== null && lauf.ergebnis !== undefined && (
        <div className="lauf-ergebnis">
          <div className="tool-ueberschrift">Ergebnis</div>
          <pre>{alsText(lauf.ergebnis)}</pre>
        </div>
      )}
      {Object.keys(lauf.eingaben).length > 0 && (
        <details>
          <summary className="hinweis">Eingaben</summary>
          <pre>{JSON.stringify(lauf.eingaben, null, 2)}</pre>
        </details>
      )}

      <div className="lauf-schritte">
        {schritte.length === 0 && <p className="leer">Noch keine Schritte.</p>}
        {schritte.map((schritt) => (
          <SchrittZeile
            key={schritt.nr}
            schritt={schritt}
            // Fester Schritt: sein Vorschlag. KI-Schritt: offene Freigaben und Rückfragen seines Agenten.
            offene={postfach.filter(
              (e) => (e.status === "offen" || e.status === "fehlgeschlagen") && (e.nr === schritt.postfachNr || (schritt.aufgabeId !== null && e.aufgabeId === schritt.aufgabeId)),
            )}
            beschaeftigt={beschaeftigt}
            handle={handle}
            zeigeLauf={zeigeLauf}
          />
        ))}
      </div>
    </div>
  );
}

interface ZeilenEigenschaften {
  schritt: LaufSchritt;
  offene: PostfachEintrag[];
  beschaeftigt: number | null;
  handle: (aktion: () => Promise<unknown>, eintragNr?: number | null) => void;
  zeigeLauf: (nr: number) => void;
}

function SchrittZeile({ schritt, offene, beschaeftigt, handle, zeigeLauf }: ZeilenEigenschaften) {
  const [verlaufOffen, setVerlaufOffen] = useState(false);
  const unterlauf = schritt.art === "workflow" ? (schritt.eingabe as { lauf?: number } | null)?.lauf : undefined;
  return (
    <div className={`lauf-schritt ${schritt.status}`} style={{ marginLeft: schritt.tiefe * 24 }}>
      <div className="lauf-schritt-kopf">
        <span className={`schritt-punkt ${schritt.status}`} title={schrittStatusText[schritt.status]} />
        <span className="schritt-art">{artText[schritt.art]}</span>
        <strong>{schritt.titel}</strong>
        {schritt.durchlauf && <span className="hinweis">{schritt.durchlauf}</span>}
        <span className={`karten-status ${schritt.status === "fertig" ? "freigegeben" : schritt.status === "fehler" ? "fehlgeschlagen" : schritt.status === "wartet" ? "offen" : ""}`}>
          {schrittStatusText[schritt.status]}
        </span>
      </div>
      {schritt.meldung && <div className={schritt.status === "fehler" ? "fehler-text" : "hinweis"}>{schritt.meldung}</div>}

      {offene.map((eintrag) => (
        <PostfachKarte
          key={eintrag.nr}
          eintrag={eintrag}
          beschaeftigt={beschaeftigt === eintrag.nr}
          aktionen={{
            freigeben: () => handle(() => api.freigeben(eintrag.nr), eintrag.nr),
            verwerfen: () => handle(() => api.verwerfen(eintrag.nr), eintrag.nr),
            zurKenntnis: () => handle(() => api.zurKenntnis(eintrag.nr), eintrag.nr),
            antworten: (text) => handle(() => api.antworten(eintrag.nr, text), eintrag.nr),
          }}
        />
      ))}

      {(schritt.eingabe !== null || schritt.ergebnis !== null) && (
        <details className="lauf-details">
          <summary className="hinweis">Details</summary>
          {schritt.eingabe !== null && (
            <>
              <div className="tool-ueberschrift">Eingabe</div>
              <pre>{alsText(schritt.eingabe)}</pre>
            </>
          )}
          {schritt.ergebnis !== null && (
            <>
              <div className="tool-ueberschrift">Ergebnis</div>
              <pre>{alsText(schritt.ergebnis)}</pre>
            </>
          )}
        </details>
      )}
      <div className="knopfreihe">
        {schritt.aufgabeId && (
          <button className="knopf-klein" onClick={() => setVerlaufOffen(!verlaufOffen)}>
            {verlaufOffen ? "Verlauf des Agenten zuklappen" : "Verlauf des Agenten"}
          </button>
        )}
        {unterlauf && (
          <button className="knopf-klein" onClick={() => zeigeLauf(unterlauf)}>
            Lauf #{unterlauf} ansehen
          </button>
        )}
      </div>
      {verlaufOffen && schritt.aufgabeId && <KiVerlauf aufgabeId={schritt.aufgabeId} />}
    </div>
  );
}
