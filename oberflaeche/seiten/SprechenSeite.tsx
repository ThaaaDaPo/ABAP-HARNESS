// Sprechen: Testseite für den Voice Agent. Nur reden, ohne Tools – erst wenn das gut funktioniert,
// kommt er in den Chat. Erkennung und Stimme laufen lokal, die Antworten kommen vom gewählten Modell.
import { useEffect, useRef, useState } from "react";
import type { Agent, ModellInfo, ModellWahl as Wahl, SprachModellStand, SprachStatus } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ModellWahl } from "../komponenten/ModellWahl.tsx";
import { useGespraech, type AnzeigeZustand } from "../sprache/useGespraech.ts";

const zustandsText: Record<AnzeigeZustand, string> = {
  aus: "Zum Starten klicken",
  startet: "Startet …",
  hoert: "Hört zu",
  erkennt: "Erkennt …",
  denkt: "Denkt …",
  spricht: "Spricht",
};

const tempi = [
  { wert: 0.9, text: "langsam" },
  { wert: 1, text: "normal" },
  { wert: 1.1, text: "etwas schneller" },
  { wert: 1.25, text: "schnell" },
];

function modellZustand(m: SprachModellStand): string {
  switch (m.zustand) {
    case "vorhanden":
      return "vorhanden";
    case "laedt":
      return `wird geladen … ${m.geladenMb} von ca. ${m.groesseMb} MB`;
    case "entpackt":
      return "wird entpackt …";
    case "fehler":
      return `Fehler: ${m.fehler}`;
    default:
      return "fehlt";
  }
}

/** Solange Modelle fehlen: Stand des Downloads und wie es von Hand geht */
function ModellKarte({ status, ladeNeu }: { status: SprachStatus; ladeNeu: () => void }) {
  const laedt = status.modelle.some((m) => m.zustand === "laedt" || m.zustand === "entpackt");
  const fehlgeschlagen = status.modelle.some((m) => m.zustand === "fehler");
  return (
    <div className="sprechen-karte">
      <strong>Modelle für Erkennung und Stimme</strong>
      {status.modelle.map((m) => (
        <div key={m.name} className={`sprach-modell ${m.zustand}`}>
          <span>{m.titel}</span>
          <span>{modellZustand(m)}</span>
          {m.zustand === "laedt" && <progress max={m.groesseMb} value={m.geladenMb} />}
        </div>
      ))}
      {!laedt && (
        <div className="knopfreihe">
          <button className="knopf haupt" onClick={ladeNeu}>
            {fehlgeschlagen ? "Erneut laden" : "Jetzt laden"}
          </button>
        </div>
      )}
      {fehlgeschlagen && (
        <div className="hinweis">
          Klappt der Download nicht, lassen sich die Dateien von Hand holen und nach <code>{status.modellOrdner}</code> entpacken:
          <ul>
            {status.modelle
              .filter((m) => m.zustand !== "vorhanden")
              .map((m) => (
                <li key={m.name}>
                  <code>{m.adresse}</code>
                  {m.adresse.endsWith(".tar.bz2") ? (
                    <> – entpacken mit <code>tar -xjf {m.adresse.split("/").pop()} -C "{status.modellOrdner}"</code></>
                  ) : (
                    <> – Datei direkt in den Ordner legen</>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function SprechenSeite() {
  const [status, setStatus] = useState<SprachStatus | null>(null);
  const [modelle, setModelle] = useState<ModellInfo[]>([]);
  const [tempo, setTempo] = useState(1);
  const [text, setText] = useState("");
  const [seitenFehler, setSeitenFehler] = useState<string | null>(null);
  const gespraech = useGespraech();
  const verlaufEnde = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.holeSprachStatus().then(setStatus).catch((e: Error) => setSeitenFehler(e.message));
    api.holeModelle().then(setModelle).catch(() => setModelle([]));
  }, []);

  // Während Modelle geladen werden, den Stand regelmäßig holen
  const laedt = status?.modelle.some((m) => m.zustand === "laedt" || m.zustand === "entpackt") ?? false;
  useEffect(() => {
    if (!laedt) return;
    const zeitgeber = setInterval(() => api.holeSprachStatus().then(setStatus).catch(() => {}), 1000);
    return () => clearInterval(zeitgeber);
  }, [laedt]);

  useEffect(() => {
    verlaufEnde.current?.scrollIntoView({ block: "end" });
  }, [gespraech.beitraege]);

  async function aendereModell(agent: Agent, modellWahl: Wahl) {
    setSeitenFehler(null);
    try {
      const { id: _id, erstelltAm: _erstellt, ...daten } = agent;
      const neu = await api.speichereAgent(agent.id, { ...daten, modellWahl });
      setStatus((alt) => (alt ? { ...alt, agent: neu } : alt));
    } catch (e) {
      setSeitenFehler((e as Error).message);
    }
  }

  async function starte() {
    await gespraech.starte(tempo);
    // Beim ersten Gespräch schlägt der Server ein schnelles Modell vor – die Anzeige nachziehen.
    api.holeSprachStatus().then(setStatus).catch(() => {});
  }

  function schicke() {
    if (!text.trim()) return;
    gespraech.schreibe(text.trim());
    setText("");
  }

  if (!status) return <div className="sprechen-seite">{seitenFehler ? <div className="fehlerleiste">{seitenFehler}</div> : "Lädt …"}</div>;

  const laeuft = gespraech.zustand !== "aus";
  const fehler = seitenFehler ?? gespraech.fehler ?? status.fehler;

  return (
    <div className="sprechen-seite">
      <div className="sprechen-kopf">
        <h2>Sprechen</h2>
        <p className="hinweis">
          Testseite für den Voice Agent „{status.agent.name}“: nur reden, ohne Tools. Ein anderes Modell gilt ab dem nächsten Satz. Erkennung und Stimme laufen lokal auf diesem Rechner, die
          Antworten kommen vom gewählten Modell. Auftrag und Modell lassen sich auch auf der Seite „Agenten“ einstellen.
        </p>
      </div>

      {!status.bereit && !status.fehler && (
        <ModellKarte status={status} ladeNeu={() => api.ladeSprachModelle().then(setStatus).catch((e: Error) => setSeitenFehler(e.message))} />
      )}

      <div className="modell-wahl sprechen-einstellungen">
        <ModellWahl
          modelle={modelle}
          wahl={status.agent.modellWahl}
          aendere={(wahl) => aendereModell(status.agent, wahl)}
          standardText="Automatisch"
        />
        <label>
          Tempo
          <select
            value={tempo}
            onChange={(e) => {
              setTempo(Number(e.target.value));
              gespraech.setzeTempo(Number(e.target.value));
            }}
          >
            {tempi.map((t) => (
              <option key={t.wert} value={t.wert}>
                {t.text}
              </option>
            ))}
          </select>
        </label>
        <label title="Ohne Headset hört das Mikrofon die Stimme mit und unterbricht sich womöglich selbst.">
          <input type="checkbox" checked={gespraech.unterbrechenErlaubt} onChange={(e) => gespraech.setUnterbrechenErlaubt(e.target.checked)} />
          Durch Sprechen unterbrechen (mit Headset)
        </label>
        {gespraech.modell && <span className="modell-info">Antwortet: {gespraech.modell}</span>}
      </div>

      {fehler && <div className="fehlerleiste">{fehler}</div>}

      <div className="sprechen-mitte">
        <button
          className={`sprech-knopf ${gespraech.zustand}`}
          disabled={!status.bereit || gespraech.zustand === "startet"}
          onClick={() => (laeuft ? gespraech.beende() : void starte())}
          style={{ boxShadow: gespraech.zustand === "hoert" ? `0 0 0 ${4 + gespraech.pegel * 22}px var(--akzent-hell)` : undefined }}
          title={laeuft ? "Gespräch beenden" : "Gespräch starten"}
        >
          {laeuft ? "Beenden" : "Start"}
        </button>
        <div className="sprech-zustand">{gespraech.stumm && laeuft ? "Stumm" : zustandsText[gespraech.zustand]}</div>
        {laeuft && (
          <div className="knopfreihe">
            <button className="knopf" onClick={() => gespraech.setzeStumm(!gespraech.stumm)}>
              {gespraech.stumm ? "Mikrofon an" : "Stumm"}
            </button>
            <button className="knopf" onClick={gespraech.unterbreche} disabled={gespraech.zustand === "hoert"}>
              Unterbrechen
            </button>
          </div>
        )}
      </div>

      <div className="sprechen-verlauf">
        {gespraech.beitraege.length === 0 && laeuft && <div className="leer mitte">Sag etwas – zum Beispiel „Hallo, wer bist du?“</div>}
        {gespraech.beitraege.map((b) => (
          <div key={`${b.rolle}-${b.runde}`} className={`sprech-beitrag ${b.rolle}`}>
            <div>{b.text || "…"}</div>
            {b.info && <div className="sprech-info">{b.info}</div>}
          </div>
        ))}
        <div ref={verlaufEnde} />
      </div>

      {laeuft && (
        <div className="eingabe">
          <textarea
            rows={1}
            placeholder="Oder hier tippen – die Antwort wird trotzdem gesprochen"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                schicke();
              }
            }}
          />
          <button className="knopf haupt" onClick={schicke} disabled={!text.trim()}>
            Senden
          </button>
        </div>
      )}
    </div>
  );
}
