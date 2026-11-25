// Einstellungen des eingebauten ADT-MCP (Seite MCP-Server → ADT): SAP-Adresse, Mandant, Pakete …
// und die SSO-Anmeldung. Benutzer und Passwort gibt es bewusst nicht – angemeldet wird nur per SSO
// über Edge (E-63).
import { useCallback, useEffect, useState } from "react";
import type { AdtKonfiguration, AdtUebersicht } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { useUebersicht } from "../live/useUebersicht.ts";

/** Listen stehen im Formular als Text, eine Angabe je Komma */
const alsText = (liste: string[]) => liste.join(", ");
const alsListe = (text: string) => text.split(",").map((t) => t.trim()).filter(Boolean);

const zustandText = { abgemeldet: "nicht angemeldet", laeuft: "Anmeldung läuft", angemeldet: "angemeldet", fehler: "Fehler" };

export function AdtEinstellungen() {
  const [uebersicht, setUebersicht] = useState<AdtUebersicht | null>(null);
  const [entwurf, setEntwurf] = useState<AdtKonfiguration | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [testErgebnis, setTestErgebnis] = useState<string | null>(null);

  const lade = useCallback(() => {
    api
      .holeAdt()
      .then((neu) => {
        setUebersicht(neu);
        // Ein angefangener Entwurf bleibt, nur der Anmeldestand wird aktualisiert
        setEntwurf((bisher) => bisher ?? neu.konfiguration);
      })
      .catch((e) => setFehler(e.message));
  }, []);
  useEffect(lade, [lade]);
  // Der Anmeldestand ändert sich auch, wenn ein Agent die Anmeldung auslöst
  useUebersicht("adt", lade);

  async function fuehreAus(aktion: () => Promise<AdtUebersicht>) {
    setBeschaeftigt(true);
    setFehler(null);
    try {
      setUebersicht(await aktion());
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  if (!uebersicht || !entwurf) return fehler ? <div className="fehlerleiste">{fehler}</div> : null;

  const setze = (teil: Partial<AdtKonfiguration>) => setEntwurf({ ...entwurf, ...teil });
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(uebersicht.konfiguration);
  const sap = entwurf.gegenstelle === "sap";
  const { anmeldung } = uebersicht;

  return (
    <section className="adt-einstellungen">
      <form
        className="formular"
        onSubmit={(e) => {
          e.preventDefault();
          fuehreAus(async () => {
            const neu = await api.speichereAdt(entwurf);
            setEntwurf(neu.konfiguration);
            return neu;
          });
        }}
      >
        <fieldset className="feld">
          <legend className="feld-titel">Gegenstelle</legend>
          <label className="haken">
            <input type="radio" checked={!sap} onChange={() => setze({ gegenstelle: "simulation" })} />
            Übungssystem – ohne SAP, zum Ausprobieren
          </label>
          <label className="haken">
            <input type="radio" checked={sap} onChange={() => setze({ gegenstelle: "sap" })} />
            SAP-System
          </label>
        </fieldset>

        {sap && (
          <>
            <label>
              SAP-Adresse
              <span className="hinweis">
                Die Seite, die Edge zur SSO-Anmeldung öffnet, z. B. https://sap-entwicklung.firma.de:44300/sap/bc/adt/. ADT benutzt davon
                Protokoll, Host und Port.
              </span>
              <input value={entwurf.url} onChange={(e) => setze({ url: e.target.value })} placeholder="https://…" />
            </label>
            <div className="formular-zeile">
              <label>
                Mandant
                <input value={entwurf.mandant} onChange={(e) => setze({ mandant: e.target.value })} placeholder="010" maxLength={3} />
              </label>
              <label>
                Sprache
                <input value={entwurf.sprache} onChange={(e) => setze({ sprache: e.target.value })} maxLength={2} />
              </label>
            </div>
          </>
        )}

        <label>
          Pakete, in denen der Agent ändern darf
          <span className="hinweis">Anlegen, speichern und aktivieren nur hier – technisch erzwungen. Lesen geht überall.</span>
          <input value={alsText(entwurf.pakete)} onChange={(e) => setze({ pakete: alsListe(e.target.value) })} placeholder="$TMP" />
        </label>

        {sap && (
          <>
            <label>
              ATC-Prüfvariante
              <span className="hinweis">Leer = Standardvariante des Systems.</span>
              <input value={entwurf.atcVariante} onChange={(e) => setze({ atcVariante: e.target.value })} />
            </label>
            <details className="erweitert">
              <summary>Anmeldung (erweitert)</summary>
              <label>
                Anmelde-Cookies
                <span className="hinweis">Daran erkennt die App, dass die Anmeldung in Edge fertig ist. * = beliebige Fortsetzung.</span>
                <input value={alsText(entwurf.cookieNamen)} onChange={(e) => setze({ cookieNamen: alsListe(e.target.value) })} />
              </label>
              <label>
                Pfad zu Edge
                <span className="hinweis">Leer = an den üblichen Stellen suchen.</span>
                <input
                  value={entwurf.edgePfad}
                  onChange={(e) => setze({ edgePfad: e.target.value })}
                  placeholder="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
                />
              </label>
            </details>
          </>
        )}

        <div className="knopfreihe">
          <button type="submit" className="knopf haupt" disabled={beschaeftigt || !geaendert}>
            Speichern
          </button>
          {geaendert && (
            <button type="button" className="knopf" onClick={() => setEntwurf(uebersicht.konfiguration)} disabled={beschaeftigt}>
              Verwerfen
            </button>
          )}
          {geaendert && <span className="hinweis">Gilt nach dem Speichern ab der nächsten Nachricht.</span>}
        </div>
      </form>

      {uebersicht.konfiguration.gegenstelle === "sap" && (
        <div className={`anmeldung ${anmeldung.zustand}`}>
          <div>
            <strong>SAP-Anmeldung: {zustandText[anmeldung.zustand]}</strong>
            <div className="hinweis">
              {anmeldung.text}
              {anmeldung.seit && ` Seit ${new Date(anmeldung.seit).toLocaleTimeString("de-DE")}.`}
            </div>
            <div className="hinweis">Nur per SSO über Edge – Benutzer und Passwort gibt es hier nicht.</div>
          </div>
          <div className="knopfreihe">
            <button className="knopf" onClick={() => fuehreAus(api.adtAnmelden)} disabled={beschaeftigt || anmeldung.zustand === "laeuft"}>
              {anmeldung.zustand === "angemeldet" ? "Neu anmelden" : "Anmelden (Edge)"}
            </button>
            <button
              className="knopf"
              onClick={() =>
                fuehreAus(async () => {
                  const { text, uebersicht } = await api.adtVerbindungTesten();
                  setTestErgebnis(text);
                  return uebersicht;
                })
              }
              disabled={beschaeftigt}
            >
              Verbindung testen
            </button>
            {anmeldung.zustand === "angemeldet" && (
              <button className="knopf" onClick={() => fuehreAus(api.adtAbmelden)} disabled={beschaeftigt}>
                Abmelden
              </button>
            )}
          </div>
          {testErgebnis && <div className="hinweis">{testErgebnis}</div>}
        </div>
      )}
      {beschaeftigt && <div className="denkt">Einen Moment … (bei der Anmeldung bitte in Edge anmelden)</div>}
      {fehler && <div className="fehlerleiste">{fehler}</div>}
    </section>
  );
}
