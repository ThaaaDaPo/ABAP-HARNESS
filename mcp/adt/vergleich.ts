// Vorher/Nachher für das Ergebnis von „speichern“ (E-20): nur die geänderten Zeilen, je Stelle mit
// der Zeilennummer im neuen Stand. Ein kleiner zeilenweiser Vergleich (längste gemeinsame Folge)
// statt eines Diff-Pakets – Quelltexte von ABAP-Objekten sind dafür klein genug.

const maxZeilen = 40;
/** Darüber wird nicht mehr zeilenweise verglichen, sondern der geänderte Bereich am Stück gezeigt. */
const maxZellen = 4_000_000;

type Schritt = { art: "gleich" | "raus" | "rein"; text: string; zeileNeu: number };

/** Zeilenweiser Vergleich über die längste gemeinsame Folge. */
function schritte(alt: string[], neu: string[], versatz: number): Schritt[] {
  const n = alt.length;
  const m = neu.length;
  if (n * m > maxZellen) {
    return [...alt.map((text) => ({ art: "raus" as const, text, zeileNeu: versatz + 1 })), ...neu.map((text, j) => ({ art: "rein" as const, text, zeileNeu: versatz + j + 1 }))];
  }
  // laenge[i][j] = längste gemeinsame Folge von alt[i..] und neu[j..]
  const laenge = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      laenge[i][j] = alt[i] === neu[j] ? laenge[i + 1][j + 1] + 1 : Math.max(laenge[i + 1][j], laenge[i][j + 1]);
    }
  }
  const ergebnis: Schritt[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && alt[i] === neu[j]) {
      ergebnis.push({ art: "gleich", text: neu[j], zeileNeu: versatz + j + 1 });
      i++;
      j++;
    } else if (i < n && (j === m || laenge[i + 1][j] >= laenge[i][j + 1])) {
      // Bei Gleichstand zuerst die alte Zeile raus, dann die neue rein – so liest man es gewohnt
      ergebnis.push({ art: "raus", text: alt[i], zeileNeu: versatz + j + 1 });
      i++;
    } else {
      ergebnis.push({ art: "rein", text: neu[j], zeileNeu: versatz + j + 1 });
      j++;
    }
  }
  return ergebnis;
}

export function vergleiche(vorher: string, nachher: string): string {
  const alt = vorher.split("\n");
  const neu = nachher.split("\n");
  // Gleiche Zeilen vorne und hinten abschneiden – das hält den Vergleich klein.
  let anfang = 0;
  while (anfang < alt.length && anfang < neu.length && alt[anfang] === neu[anfang]) anfang++;
  let ende = 0;
  while (ende < alt.length - anfang && ende < neu.length - anfang && alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]) ende++;

  const mitte = schritte(alt.slice(anfang, alt.length - ende), neu.slice(anfang, neu.length - ende), anfang);
  const raus = mitte.filter((s) => s.art === "raus").length;
  const rein = mitte.filter((s) => s.art === "rein").length;
  if (raus === 0 && rein === 0) return "keine Änderung";

  // Je zusammenhängender Änderung eine Kopfzeile mit der Zeilennummer im neuen Stand
  const zeilen: string[] = [];
  let vorige: Schritt["art"] = "gleich";
  for (const schritt of mitte) {
    if (schritt.art === "gleich") {
      vorige = "gleich";
      continue;
    }
    if (vorige === "gleich") zeilen.push(`@ Zeile ${schritt.zeileNeu}`);
    zeilen.push(`${schritt.art === "raus" ? "-" : "+"} ${schritt.text}`);
    vorige = schritt.art;
  }
  const gekuerzt = zeilen.length > maxZeilen ? [...zeilen.slice(0, maxZeilen), `… (${zeilen.length - maxZeilen} weitere Zeilen)`] : zeilen;
  return `${raus} Zeilen raus, ${rein} rein\n${gekuerzt.join("\n")}`;
}
