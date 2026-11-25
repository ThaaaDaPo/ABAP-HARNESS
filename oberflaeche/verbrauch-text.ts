// Zahlen der Verbrauchsanzeige lesbar machen. Gebraucht unter jeder Antwort, über dem Chat und auf
// der Seite „Verbrauch“.
import type { VerbrauchSumme } from "../gemeinsam/typen.ts";

const zahl = (wert: number, stellen = 0) => wert.toLocaleString("de-DE", { maximumFractionDigits: stellen });

/** 1234 → "1,2 Tsd.", 2_500_000 → "2,5 Mio." */
export function tokenText(anzahl: number): string {
  if (anzahl >= 1_000_000) return `${zahl(anzahl / 1_000_000, 1)} Mio.`;
  if (anzahl >= 1000) return `${zahl(anzahl / 1000, 1)} Tsd.`;
  return zahl(anzahl);
}

/**
 * AI-Credits aus den Nano-AI-Units des SDK (totalNanoAiu ÷ 10⁹). Ob das genau die Einheit der
 * GitHub-Abrechnung ist, wird am Firmenrechner verglichen.
 */
export function creditText(summe: VerbrauchSumme): string {
  const credits = summe.nanoAiu / 1e9;
  const text = `${zahl(credits, credits < 1 ? 4 : 2)} AI-Credits`;
  // Ohne Kostenangabe ist der Wert nur eine Untergrenze
  return summe.ohneKosten > 0 ? `mind. ${text}` : text;
}

/** Kurzform für eine Zeile: "2 Modellaufrufe · 1,2 Tsd. Tokens ein, 110 aus · 0,0023 AI-Credits" */
export function verbrauchText(summe: VerbrauchSumme): string {
  const aufrufe = summe.aufrufe === 1 ? "1 Modellaufruf" : `${summe.aufrufe} Modellaufrufe`;
  return `${aufrufe} · ${tokenText(summe.eingabeTokens)} Tokens ein, ${tokenText(summe.ausgabeTokens)} aus · ${creditText(summe)}`;
}
