// Mikrofon im Browser: 16 kHz mono mit Echo- und Rauschunterdrückung des Browsers. Liefert Stücke
// von 100 ms und den Pegel (für die Anzeige). Edge und Chrome rechnen die Abtastrate selbst um.

/** Vite liefert die Datei unter dieser Adresse aus. */
const worklet = new URL("./mikrofon-worklet.js", import.meta.url);

export interface Mikrofon {
  stoppe(): void;
}

export async function starteMikrofon(beiAudio: (samples: Float32Array) => void, beiPegel: (pegel: number) => void): Promise<Mikrofon> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Dieser Browser gibt das Mikrofon nicht frei.");
  const strom = await navigator.mediaDevices
    .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    .catch((fehler: Error) => {
      throw new Error(
        fehler.name === "NotAllowedError"
          ? "Das Mikrofon ist nicht freigegeben. Bitte in der Adressleiste das Mikrofon für diese Seite erlauben."
          : `Mikrofon nicht verfügbar: ${fehler.message}`,
      );
    });

  const kontext = new AudioContext({ sampleRate: 16000 });
  await kontext.audioWorklet.addModule(worklet);
  const quelle = kontext.createMediaStreamSource(strom);
  const sammler = new AudioWorkletNode(kontext, "mikrofon-sammler");
  sammler.port.onmessage = (nachricht: MessageEvent<Float32Array>) => {
    const samples = nachricht.data;
    let summe = 0;
    for (const wert of samples) summe += wert * wert;
    beiPegel(Math.min(1, Math.sqrt(summe / samples.length) * 6));
    beiAudio(samples);
  };
  // Stumm an den Ausgang hängen: Erst dann verarbeitet der Browser den Knoten verlässlich.
  const stumm = kontext.createGain();
  stumm.gain.value = 0;
  quelle.connect(sammler).connect(stumm).connect(kontext.destination);

  return {
    stoppe() {
      for (const spur of strom.getTracks()) spur.stop();
      void kontext.close();
    },
  };
}
