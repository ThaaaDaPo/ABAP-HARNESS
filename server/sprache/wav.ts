// Audio als WAV-Datei (16 Bit, mono) – das spielt jeder Browser ohne Zusatz ab.

export function alsWav(samples: Float32Array, sampleRate: number): Buffer {
  const datenBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + datenBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + datenBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16); // Länge des fmt-Teils
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28); // Bytes je Sekunde
  wav.writeUInt16LE(2, 32); // Bytes je Abtastwert
  wav.writeUInt16LE(16, 34); // Bit je Abtastwert
  wav.write("data", 36);
  wav.writeUInt32LE(datenBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    const wert = Math.max(-1, Math.min(1, samples[i]));
    wav.writeInt16LE(Math.round(wert * 32767), 44 + i * 2);
  }
  return wav;
}
