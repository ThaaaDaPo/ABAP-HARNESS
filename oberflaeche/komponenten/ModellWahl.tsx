// Auswahl von Modell, Thinking Effort und Context Window – über dem Chat und auf der Agenten-Seite.
// Was das gewählte Modell nicht kann, ist ausgeblendet. Im Chat gelten Änderungen ab der nächsten Nachricht.
import type { ModellInfo, ModellWahl as Wahl } from "../../gemeinsam/typen.ts";

interface Eigenschaften {
  modelle: ModellInfo[];
  wahl: Wahl;
  aendere: (wahl: Wahl) => void;
  /** Hinweis, dass die Änderung erst mit der nächsten Nachricht wirkt (Agent arbeitet gerade) */
  agentArbeitet?: boolean;
  /** Text für „kein eigenes Modell“: im Chat das Standardmodell des Agenten, beim Agenten die automatische Auswahl */
  standardText: string;
}

/** Die Stufen kommen vom SDK auf Englisch. */
const denkStufenText: Record<string, string> = {
  none: "aus",
  minimal: "minimal",
  low: "niedrig",
  medium: "mittel",
  high: "hoch",
  xhigh: "sehr hoch",
};

function tokens(anzahl: number | null): string {
  if (!anzahl) return "unbekannt";
  return anzahl >= 1_000_000 ? `${(anzahl / 1_000_000).toLocaleString("de-DE")} Mio. Tokens` : `${Math.round(anzahl / 1000)} Tsd. Tokens`;
}

export function ModellWahl({ modelle, wahl, aendere, agentArbeitet = false, standardText }: Eigenschaften) {
  const modell = modelle.find((m) => m.id === wahl.modell) ?? null;

  function waehleModell(id: string) {
    const neues = modelle.find((m) => m.id === id);
    // Feineinstellungen passen nur zum alten Modell – beim Wechsel auf Standard zurück
    aendere({
      modell: id,
      denkaufwand: neues && neues.denkStufen.includes(wahl.denkaufwand) ? wahl.denkaufwand : "",
      kontext: neues?.langerKontext ? wahl.kontext : "standard",
    });
  }

  return (
    <>
      <label>
        Modell
        <select value={wahl.modell} onChange={(e) => waehleModell(e.target.value)}>
          <option value="">{standardText}</option>
          {modelle.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.multiplikator !== null ? ` · ${m.multiplikator}×` : ""}
            </option>
          ))}
        </select>
      </label>

      {modell && modell.denkStufen.length > 0 && (
        <label>
          Thinking Effort
          <select value={wahl.denkaufwand} onChange={(e) => aendere({ ...wahl, denkaufwand: e.target.value })}>
            <option value="">
              Standard{modell.standardDenkStufe ? ` (${denkStufenText[modell.standardDenkStufe] ?? modell.standardDenkStufe})` : ""}
            </option>
            {modell.denkStufen.map((stufe) => (
              <option key={stufe} value={stufe}>
                {denkStufenText[stufe] ?? stufe}
              </option>
            ))}
          </select>
        </label>
      )}

      {modell && (
        <label>
          Context Window
          {modell.langerKontext ? (
            <select value={wahl.kontext} onChange={(e) => aendere({ ...wahl, kontext: e.target.value as Wahl["kontext"] })}>
              <option value="standard">Standard ({tokens(modell.kontextStandard)})</option>
              <option value="lang">Lang ({tokens(modell.kontextLang)})</option>
            </select>
          ) : (
            <span className="modell-info">{tokens(modell.kontextStandard)}</span>
          )}
        </label>
      )}

      {modelle.length === 0 && <span className="modell-info">Copilot bietet keine Einzelmodelle an.</span>}
      {agentArbeitet && <span className="modell-info">Gilt ab der nächsten Nachricht.</span>}
    </>
  );
}
