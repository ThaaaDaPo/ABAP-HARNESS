// Zeilenweiser Vergleich zweier Texte über die längste gemeinsame Folge. Gebraucht vom ADT-MCP
// (Vorher/Nachher als Text für den Agenten) und von der Oberfläche (Vergleich nebeneinander im Chat).
// Ein eigener kleiner Vergleich statt eines Diff-Pakets – Quelltexte von ABAP-Objekten sind dafür klein genug.

/** Eine Zeile im Vergleich mit ihrer Nummer im alten bzw. neuen Stand (0 = gibt es dort nicht). */
export interface Schritt {
  art: "gleich" | "raus" | "rein";
  text: string;
  zeileAlt: number;
  zeileNeu: number;
}

/** Darüber wird nicht mehr zeilenweise verglichen, sondern der geänderte Bereich am Stück gezeigt. */
const maxZellen = 4_000_000;

/** Vergleicht die Zeilen ab den Nummern `versatzAlt`/`versatzNeu` (für die abgeschnittenen gleichen Zeilen davor). */
function mitte(alt: string[], neu: string[], versatzAlt: number, versatzNeu: number): Schritt[] {
  const n = alt.length;
  const m = neu.length;
  const raus = (text: string, i: number): Schritt => ({ art: "raus", text, zeileAlt: versatzAlt + i + 1, zeileNeu: 0 });
  const rein = (text: string, j: number): Schritt => ({ art: "rein", text, zeileAlt: 0, zeileNeu: versatzNeu + j + 1 });
  if (n * m > maxZellen) return [...alt.map(raus), ...neu.map(rein)];

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
      ergebnis.push({ art: "gleich", text: neu[j], zeileAlt: versatzAlt + i + 1, zeileNeu: versatzNeu + j + 1 });
      i++;
      j++;
    } else if (i < n && (j === m || laenge[i + 1][j] >= laenge[i][j + 1])) {
      // Bei Gleichstand zuerst die alte Zeile raus, dann die neue rein – so liest man es gewohnt
      ergebnis.push(raus(alt[i], i));
      i++;
    } else {
      ergebnis.push(rein(neu[j], j));
      j++;
    }
  }
  return ergebnis;
}

/** Alle Zeilen beider Stände in Reihenfolge, gleiche und geänderte. */
export function vergleicheZeilen(vorher: string, nachher: string): Schritt[] {
  const alt = vorher === "" ? [] : vorher.split("\n");
  const neu = nachher === "" ? [] : nachher.split("\n");
  // Gleiche Zeilen vorne und hinten abschneiden – das hält den Vergleich klein.
  let anfang = 0;
  while (anfang < alt.length && anfang < neu.length && alt[anfang] === neu[anfang]) anfang++;
  let ende = 0;
  while (ende < alt.length - anfang && ende < neu.length - anfang && alt[alt.length - 1 - ende] === neu[neu.length - 1 - ende]) ende++;

  const gleich = (text: string, i: number, j: number): Schritt => ({ art: "gleich", text, zeileAlt: i + 1, zeileNeu: j + 1 });
  return [
    ...alt.slice(0, anfang).map((text, i) => gleich(text, i, i)),
    ...mitte(alt.slice(anfang, alt.length - ende), neu.slice(anfang, neu.length - ende), anfang, anfang),
    ...alt.slice(alt.length - ende).map((text, k) => gleich(text, alt.length - ende + k, neu.length - ende + k)),
  ];
}
