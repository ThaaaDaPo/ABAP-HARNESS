// Läuft im Audio-Thread des Browsers: sammelt das Mikrofon (schon auf 16 kHz) in Stücken von
// 100 ms und schickt sie an die Seite. Plain JavaScript, weil der Browser die Datei direkt lädt.
const stueckLaenge = 1600;

class MikrofonSammler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.puffer = new Float32Array(stueckLaenge);
    this.anzahl = 0;
  }

  process(eingaenge) {
    const kanal = eingaenge[0]?.[0];
    if (kanal) {
      for (let i = 0; i < kanal.length; i++) {
        this.puffer[this.anzahl++] = kanal[i];
        if (this.anzahl === stueckLaenge) {
          this.port.postMessage(this.puffer.slice());
          this.anzahl = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("mikrofon-sammler", MikrofonSammler);
