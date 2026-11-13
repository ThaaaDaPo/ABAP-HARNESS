// Fehler mit HTTP-Statuscode, damit die Routen die passende Antwort schicken können.
export class Fehler extends Error {
  status: number;
  constructor(status: number, meldung: string) {
    super(meldung);
    this.status = status;
  }
}
