// Erkennung, Stimme und Sprechpausen-Erkennung über sherpa-onnx – alles lokal auf der CPU.
// Die Bibliothek wird erst hier geladen: Klappt das am Firmenrechner nicht (z. B. weil eine
// Schutzsoftware die DLL sperrt), läuft der Rest der App trotzdem.
import type sherpaTyp from "sherpa-onnx-node";
import type { Vad } from "sherpa-onnx-node";
import { pfadVon } from "./modelle.ts";

/** Mit 16 kHz arbeiten Erkennung und VAD; so schickt der Browser das Mikrofon. */
export const abtastrate = 16000;

/** Zwei Threads je Modell: schnell genug und lässt dem Rechner Luft für den Rest. */
const threads = 2;

export interface Erkenner {
  /** Text zu einer Äußerung (16 kHz, mono) */
  erkenne(samples: Float32Array): Promise<string>;
}

export interface Sprecher {
  /** Ein Satz als Audio */
  sprich(text: string, tempo: number): Promise<{ samples: Float32Array; sampleRate: number }>;
}

/** Findet in einem Mikrofon-Strom die einzelnen Äußerungen. Eine je Gespräch, sie hat Zustand. */
export interface Sprachende {
  /** Nimmt Audio an und liefert die Äußerungen, die damit fertig geworden sind. */
  nimm(samples: Float32Array): Float32Array[];
  /** Spricht gerade jemand? */
  hoertSprache(): boolean;
  /** Vergisst, was angefangen war (z. B. nach dem Stummschalten) */
  zuruecksetzen(): void;
}

export interface Bausteine {
  erkenner: Erkenner;
  sprecher: Sprecher;
  erstelleSprachende: () => Sprachende;
}

/** Wie lange still sein, bis die Äußerung als fertig gilt. Kürzer = schneller, aber unterbricht eher. */
const pauseBisFertigSekunden = 0.6;

export async function ladeBausteine(modellOrdner: string): Promise<Bausteine> {
  const sherpa: typeof sherpaTyp = (await import("sherpa-onnx-node")).default;

  const erkennung = await sherpa.OfflineRecognizer.createAsync({
    featConfig: { sampleRate: abtastrate, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: pfadVon(modellOrdner, "erkennung", "encoder.int8.onnx"),
        decoder: pfadVon(modellOrdner, "erkennung", "decoder.int8.onnx"),
        joiner: pfadVon(modellOrdner, "erkennung", "joiner.int8.onnx"),
      },
      tokens: pfadVon(modellOrdner, "erkennung", "tokens.txt"),
      modelType: "nemo_transducer",
      numThreads: threads,
      provider: "cpu",
      debug: 0,
    },
  });

  const stimme = await sherpa.OfflineTts.createAsync({
    model: {
      vits: {
        model: pfadVon(modellOrdner, "stimme", "de_DE-thorsten-medium.onnx"),
        tokens: pfadVon(modellOrdner, "stimme", "tokens.txt"),
        dataDir: pfadVon(modellOrdner, "stimme", "espeak-ng-data"),
      },
      numThreads: threads,
      provider: "cpu",
      debug: 0,
    },
    maxNumSentences: 1,
  });

  const vadKonfiguration = {
    sileroVad: {
      model: pfadVon(modellOrdner, "sprachende"),
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: pauseBisFertigSekunden,
      windowSize: 512,
      maxSpeechDuration: 30,
    },
    sampleRate: abtastrate,
    numThreads: 1,
    provider: "cpu",
    debug: 0,
  };

  return {
    erkenner: {
      async erkenne(samples) {
        const strom = erkennung.createStream();
        strom.acceptWaveform({ samples, sampleRate: abtastrate });
        return (await erkennung.decodeAsync(strom)).text.trim();
      },
    },
    sprecher: {
      sprich: (text, tempo) => stimme.generateAsync({ text, sid: 0, speed: tempo }),
    },
    erstelleSprachende: () => erstelleSprachende(new sherpa.Vad(vadKonfiguration, 60), vadKonfiguration.sileroVad.windowSize),
  };
}

/** Die VAD will Stücke fester Größe; der Browser schickt beliebig lange. Der Rest wartet aufs nächste Mal. */
function erstelleSprachende(vad: Vad, fenster: number): Sprachende {
  let rest = new Float32Array(0);
  return {
    nimm(samples) {
      const alles = new Float32Array(rest.length + samples.length);
      alles.set(rest);
      alles.set(samples, rest.length);
      let start = 0;
      const fertig: Float32Array[] = [];
      for (; start + fenster <= alles.length; start += fenster) {
        vad.acceptWaveform(alles.subarray(start, start + fenster));
        while (!vad.isEmpty()) {
          // Kopieren: Der Speicher gehört der Bibliothek und ist nach pop() weg.
          fertig.push(new Float32Array(vad.front().samples));
          vad.pop();
        }
      }
      rest = alles.slice(start);
      return fertig;
    },
    hoertSprache: () => vad.isDetected(),
    zuruecksetzen() {
      rest = new Float32Array(0);
      vad.reset();
    },
  };
}
