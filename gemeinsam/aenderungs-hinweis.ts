// Wie die Nummer eines Änderungssatzes (AdtAenderung) im Ergebnis von adt-speichern bzw. adt-anlegen
// steht. Der ADT-MCP schreibt den Satz, die Oberfläche findet daran den Vergleich und „Rückgängig“.

export const aenderungsHinweis = (id: string) => `Änderung ${id} (Vergleich und Rückgängig in der App).`;

const muster = /Änderung (\d{8}-\d{6}-[0-9a-f]{4}) \(Vergleich/;

/** Die Nummer des Änderungssatzes aus einem Tool-Ergebnis, sonst null */
export function findeAenderungsId(ergebnis: string): string | null {
  return ergebnis.match(muster)?.[1] ?? null;
}
