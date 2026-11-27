// Vorher/Nachher als Text für das Ergebnis von „speichern“ (E-20): nur die geänderten Zeilen, je Stelle
// mit der Zeilennummer im neuen Stand. Das liest der Agent. Den Vergleich nebeneinander für David zeigt
// die App aus dem Änderungssatz (aenderungen.ts); beide nutzen denselben Zeilenvergleich.
import { vergleicheZeilen } from "../../gemeinsam/zeilenvergleich.ts";

const maxZeilen = 40;

export function vergleiche(vorher: string, nachher: string): string {
  const schritte = vergleicheZeilen(vorher, nachher);
  const raus = schritte.filter((s) => s.art === "raus").length;
  const rein = schritte.filter((s) => s.art === "rein").length;
  if (raus === 0 && rein === 0) return "keine Änderung";

  // Je zusammenhängender Änderung eine Kopfzeile mit der Zeilennummer im neuen Stand
  const zeilen: string[] = [];
  let vorige = "gleich";
  let zeileNeu = 0;
  for (const schritt of schritte) {
    if (schritt.art === "gleich") {
      vorige = "gleich";
      zeileNeu = schritt.zeileNeu;
      continue;
    }
    if (vorige === "gleich") zeilen.push(`@ Zeile ${schritt.art === "rein" ? schritt.zeileNeu : zeileNeu + 1}`);
    zeilen.push(`${schritt.art === "raus" ? "-" : "+"} ${schritt.text}`);
    if (schritt.art === "rein") zeileNeu = schritt.zeileNeu;
    vorige = schritt.art;
  }
  const gekuerzt = zeilen.length > maxZeilen ? [...zeilen.slice(0, maxZeilen), `… (${zeilen.length - maxZeilen} weitere Zeilen)`] : zeilen;
  return `${raus} Zeilen raus, ${rein} rein\n${gekuerzt.join("\n")}`;
}
