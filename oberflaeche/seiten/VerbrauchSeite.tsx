// Verbrauch: gesamt und aufgeteilt nach Agent, Modell und Monat (V-14). Nur anzeigen – ein Limit
// oder Monatsbudget gibt es vorerst nicht (E-60).
import { useEffect, useState } from "react";
import type { VerbrauchSumme, VerbrauchUebersicht } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { creditText, tokenText } from "../verbrauch-text.ts";

function Tabelle({ titel, zeilen }: { titel: string; zeilen: ({ name: string } & VerbrauchSumme)[] }) {
  return (
    <section>
      <h3>{titel}</h3>
      {zeilen.length === 0 ? (
        <p className="leer">Noch nichts.</p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>{titel.replace("Je ", "")}</th>
              <th className="zahl">Modellaufrufe</th>
              <th className="zahl">Tokens ein</th>
              <th className="zahl">davon Cache</th>
              <th className="zahl">Tokens aus</th>
              <th className="zahl">AI-Credits</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.name}>
                <td>{z.name}</td>
                <td className="zahl">{z.aufrufe.toLocaleString("de-DE")}</td>
                <td className="zahl">{tokenText(z.eingabeTokens)}</td>
                <td className="zahl">{tokenText(z.cacheTokens)}</td>
                <td className="zahl">{tokenText(z.ausgabeTokens)}</td>
                <td className="zahl">{creditText(z).replace(" AI-Credits", "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function VerbrauchSeite() {
  const [uebersicht, setUebersicht] = useState<VerbrauchUebersicht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api.holeVerbrauch().then(setUebersicht).catch((e) => setFehler(e.message));
  }, []);

  return (
    <div className="detail breit">
      <h2>Verbrauch</h2>
      {fehler && <div className="fehlerleiste">{fehler}</div>}
      {uebersicht && (
        <>
          <div className="kennzahlen">
            <div>
              <span className="kennzahl">{creditText(uebersicht.gesamt)}</span>
              <span className="hinweis">gesamt</span>
            </div>
            <div>
              <span className="kennzahl">{tokenText(uebersicht.gesamt.eingabeTokens + uebersicht.gesamt.ausgabeTokens)}</span>
              <span className="hinweis">Tokens</span>
            </div>
            <div>
              <span className="kennzahl">{uebersicht.gesamt.aufrufe.toLocaleString("de-DE")}</span>
              <span className="hinweis">Modellaufrufe</span>
            </div>
          </div>
          <p className="hinweis">
            Zahlen, wie Copilot sie nach jedem Modellaufruf meldet. AI-Credits = Nano-AI-Units ÷ 10⁹; ob das genau die Einheit der
            GitHub-Abrechnung ist, ist noch mit der Abrechnung zu vergleichen.
            {uebersicht.gesamt.ohneKosten > 0 && ` Bei ${uebersicht.gesamt.ohneKosten} Aufrufen fehlte die Kostenangabe („mind.“).`}
            {" "}Auch gelöschte Chats zählen mit.
          </p>
          <Tabelle titel="Je Monat" zeilen={uebersicht.jeMonat} />
          <Tabelle titel="Je Agent" zeilen={uebersicht.jeAgent} />
          <Tabelle titel="Je Modell" zeilen={uebersicht.jeModell} />
        </>
      )}
    </div>
  );
}
