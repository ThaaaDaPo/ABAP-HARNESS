// Spielt die Sätze des Agenten nahtlos hintereinander ab und kann sofort verstummen (Unterbrechen).

export class Wiedergabe {
  private kontext = new AudioContext();
  private quellen = new Set<AudioBufferSourceNode>();
  /** Wann der zuletzt eingeplante Satz zu Ende ist (Zeit des AudioContext) */
  private ende = 0;
  /** Dekodieren ist asynchron; die Kette hält die Reihenfolge der Sätze */
  private kette: Promise<void> = Promise.resolve();
  /** Steigt bei jedem Verstummen: Was vorher eingereiht war, wird nicht mehr gespielt */
  private generation = 0;
  private beiStille: () => void;

  /** beiStille: Der letzte eingeplante Satz ist zu Ende gespielt. */
  constructor(beiStille: () => void) {
    this.beiStille = beiStille;
  }

  spieleAb(wavBase64: string): void {
    const generation = this.generation;
    const bytes = Uint8Array.from(atob(wavBase64), (zeichen) => zeichen.charCodeAt(0));
    this.kette = this.kette.then(async () => {
      // Der Browser hält den Ton an, bis die Seite einmal bedient wurde; der Start-Knopf zählt.
      if (this.kontext.state === "suspended") await this.kontext.resume();
      const puffer = await this.kontext.decodeAudioData(bytes.buffer);
      if (generation !== this.generation) return;
      const quelle = this.kontext.createBufferSource();
      quelle.buffer = puffer;
      quelle.connect(this.kontext.destination);
      const start = Math.max(this.kontext.currentTime + 0.02, this.ende);
      quelle.start(start);
      this.ende = start + puffer.duration;
      this.quellen.add(quelle);
      quelle.onended = () => {
        this.quellen.delete(quelle);
        if (this.quellen.size === 0 && generation === this.generation) this.beiStille();
      };
    });
  }

  spielt(): boolean {
    return this.quellen.size > 0;
  }

  verstumme(): void {
    this.generation++;
    for (const quelle of this.quellen) quelle.stop();
    this.quellen.clear();
    this.ende = 0;
  }

  /** Muss aus einem Klick heraus aufgerufen werden, sonst bleibt der Ton gesperrt. */
  freischalten(): void {
    void this.kontext.resume();
  }

  schliesse(): void {
    this.verstumme();
    void this.kontext.close();
  }
}
