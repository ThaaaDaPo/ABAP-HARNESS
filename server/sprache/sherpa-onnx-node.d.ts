// Typen für das Paket sherpa-onnx-node (es bringt keine mit) – nur der Teil, den die App benutzt.
// Quelle: node_modules/sherpa-onnx-node/types.js und die Beispiele von sherpa-onnx.
declare module "sherpa-onnx-node" {
  export interface Welle {
    samples: Float32Array;
    sampleRate: number;
  }

  export class OfflineStream {
    acceptWaveform(welle: Welle): void;
  }

  export class OfflineRecognizer {
    static createAsync(konfiguration: object): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decodeAsync(strom: OfflineStream): Promise<{ text: string }>;
  }

  export class OfflineTts {
    static createAsync(konfiguration: object): Promise<OfflineTts>;
    readonly sampleRate: number;
    generateAsync(anfrage: { text: string; sid: number; speed: number }): Promise<Welle>;
  }

  export class Vad {
    constructor(konfiguration: object, pufferSekunden: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    front(): { samples: Float32Array; start: number };
    pop(): void;
    flush(): void;
    reset(): void;
  }

  const sherpa: {
    OfflineRecognizer: typeof OfflineRecognizer;
    OfflineTts: typeof OfflineTts;
    Vad: typeof Vad;
  };
  export default sherpa;
}
