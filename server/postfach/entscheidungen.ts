// Wartende Entscheidungen im Chat (E-54): Der Agent hat ein Tool aufgerufen, das eine Freigabe
// braucht, oder eine Rückfrage gestellt – und wartet im laufenden Aufruf, bis David entscheidet.
// Hier liegen nur die offenen Versprechen im Speicher. Geht die App vorher aus, bleibt der
// Postfach-Eintrag offen und wird ohne wartenden Agenten erledigt (siehe postfach-dienst.ts).

/** Was David mit einem Vorschlag oder einer Rückfrage macht. */
export type NutzerEntscheidung =
  | { art: "freigegeben" }
  | { art: "verworfen" }
  /** Bei einem Vorschlag: Änderungswunsch. Bei einer Rückfrage: die Antwort. */
  | { art: "antwort"; text: string };

interface Wartend {
  aufgabeId: string;
  loese: (entscheidung: NutzerEntscheidung) => void;
}

export class WartendeEntscheidungen {
  private wartend = new Map<number, Wartend>();

  /** Wird erfüllt, sobald David über den Eintrag entschieden hat. */
  warte(nr: number, aufgabeId: string): Promise<NutzerEntscheidung> {
    return new Promise((loese) => this.wartend.set(nr, { aufgabeId, loese }));
  }

  /** Nimmt den wartenden Agenten heraus. Null, wenn keiner wartet (z. B. nach einem Neustart). */
  nimm(nr: number): Wartend | null {
    const wartend = this.wartend.get(nr) ?? null;
    this.wartend.delete(nr);
    return wartend;
  }

  /** Nummern, auf die der Agent in dieser Aufgabe gerade wartet. */
  vonAufgabe(aufgabeId: string): number[] {
    return [...this.wartend].filter(([, w]) => w.aufgabeId === aufgabeId).map(([nr]) => nr);
  }
}
