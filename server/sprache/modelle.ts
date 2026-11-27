// Die Modelle für Erkennung, Stimme und Sprachende: wo sie liegen, ob sie da sind, und sie laden.
// Sie kommen aus den Veröffentlichungen von sherpa-onnx (GitHub) und werden einmal in den
// Modell-Ordner entpackt. Danach läuft alles ohne Internet.
//
// Am Firmenrechner sind Downloads schwierig: Klappt das Laden nicht, lassen sich dieselben Dateien
// von Hand holen und in den Modell-Ordner entpacken (Adresse und Ordner zeigt die Seite „Sprechen“).
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { SprachModellStand } from "../../gemeinsam/typen.ts";

const fuehreAus = promisify(execFile);
const veroeffentlichungen = "https://github.com/k2-fsa/sherpa-onnx/releases/download";

interface ModellAngabe {
  name: SprachModellStand["name"];
  titel: string;
  groesseMb: number;
  adresse: string;
  /** Ordner bzw. Datei im Modell-Ordner, so wie sie nach dem Entpacken heißen */
  ziel: string;
  /** Diese Dateien müssen im Ziel liegen, damit das Modell als vorhanden gilt */
  dateien: string[];
}

export const modellAngaben: ModellAngabe[] = [
  {
    // NVIDIA Parakeet TDT 0.6B v3: 25 europäische Sprachen, darunter Deutsch. Schnell auf der CPU
    // und erfindet bei Geräuschen kaum Text (anders als Whisper).
    name: "erkennung",
    titel: "Spracherkennung (Parakeet v3)",
    groesseMb: 465,
    adresse: `${veroeffentlichungen}/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    ziel: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
    dateien: ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"],
  },
  {
    // Piper-Stimme Thorsten (de_DE-thorsten-medium), von sherpa-onnx samt espeak-Daten verpackt.
    name: "stimme",
    titel: "Stimme (Piper Thorsten, medium)",
    groesseMb: 64,
    adresse: `${veroeffentlichungen}/tts-models/vits-piper-de_DE-thorsten-medium.tar.bz2`,
    ziel: "vits-piper-de_DE-thorsten-medium",
    dateien: ["de_DE-thorsten-medium.onnx", "tokens.txt", "espeak-ng-data"],
  },
  {
    // Silero VAD: erkennt, wann jemand spricht und wann er fertig ist.
    name: "sprachende",
    titel: "Sprechpausen-Erkennung (Silero VAD)",
    groesseMb: 1,
    adresse: `${veroeffentlichungen}/asr-models/silero_vad.onnx`,
    ziel: "silero_vad.onnx",
    dateien: [],
  },
];

export function pfadVon(modellOrdner: string, name: SprachModellStand["name"], datei = ""): string {
  const angabe = modellAngaben.find((m) => m.name === name)!;
  return path.join(modellOrdner, angabe.ziel, datei);
}

function istVorhanden(modellOrdner: string, angabe: ModellAngabe): boolean {
  const ziel = path.join(modellOrdner, angabe.ziel);
  if (angabe.dateien.length === 0) return fs.existsSync(ziel);
  return angabe.dateien.every((datei) => fs.existsSync(path.join(ziel, datei)));
}

/**
 * Windows bringt seit Version 10 ein tar mit, das bz2 kann. Ausdrücklich dieses nehmen: Ein tar aus
 * Git Bash im PATH hielte „C:“ für einen fremden Rechner.
 */
function tarProgramm(): string {
  if (process.platform !== "win32") return "tar";
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
}

/** Lädt und entpackt fehlende Modelle, eins nach dem anderen. Merkt sich den Stand für die Anzeige. */
export class ModellLader {
  private modellOrdner: string;
  private stand = new Map<SprachModellStand["name"], Pick<SprachModellStand, "zustand" | "geladenMb" | "fehler">>();
  private laeuft: Promise<void> | null = null;

  constructor(modellOrdner: string) {
    this.modellOrdner = modellOrdner;
  }

  staende(): SprachModellStand[] {
    return modellAngaben.map((angabe) => {
      const vorhanden = istVorhanden(this.modellOrdner, angabe);
      const stand = this.stand.get(angabe.name);
      return {
        name: angabe.name,
        titel: angabe.titel,
        groesseMb: angabe.groesseMb,
        adresse: angabe.adresse,
        ordner: path.join(this.modellOrdner, angabe.ziel),
        zustand: vorhanden ? "vorhanden" : (stand?.zustand ?? "fehlt"),
        geladenMb: stand?.geladenMb ?? 0,
        fehler: vorhanden ? null : (stand?.fehler ?? null),
      };
    });
  }

  alleVorhanden(): boolean {
    return modellAngaben.every((angabe) => istVorhanden(this.modellOrdner, angabe));
  }

  /** Startet das Laden, falls etwas fehlt. Läuft es schon, wird nichts doppelt gestartet. */
  ladeFehlende(): Promise<void> {
    if (!this.laeuft) {
      this.laeuft = this.ladeNacheinander().finally(() => {
        this.laeuft = null;
      });
    }
    return this.laeuft;
  }

  private async ladeNacheinander(): Promise<void> {
    fs.mkdirSync(this.modellOrdner, { recursive: true });
    for (const angabe of modellAngaben) {
      if (istVorhanden(this.modellOrdner, angabe)) continue;
      try {
        await this.lade(angabe);
      } catch (fehler) {
        this.stand.set(angabe.name, { zustand: "fehler", geladenMb: 0, fehler: (fehler as Error).message });
      }
    }
  }

  private async lade(angabe: ModellAngabe): Promise<void> {
    const setze = (zustand: SprachModellStand["zustand"], geladenMb: number) =>
      this.stand.set(angabe.name, { zustand, geladenMb, fehler: null });
    setze("laedt", 0);

    const antwort = await fetch(angabe.adresse).catch((fehler: Error) => {
      throw new Error(`Download nicht möglich (${(fehler.cause as Error)?.message ?? fehler.message}).`);
    });
    if (!antwort.ok || !antwort.body) throw new Error(`Download fehlgeschlagen: HTTP ${antwort.status}.`);

    // Erst unter anderem Namen speichern: Ein abgebrochener Download gilt so nie als vorhanden.
    const archiv = angabe.adresse.endsWith(".tar.bz2");
    const zwischendatei = path.join(this.modellOrdner, `${angabe.ziel}${archiv ? ".tar.bz2" : ""}.teil`);
    let bytes = 0;
    const strom = Readable.fromWeb(antwort.body as import("node:stream/web").ReadableStream);
    strom.on("data", (stueck: Buffer) => {
      bytes += stueck.length;
      setze("laedt", Math.round(bytes / 1e6));
    });
    await pipeline(strom, fs.createWriteStream(zwischendatei));

    if (!archiv) {
      fs.renameSync(zwischendatei, path.join(this.modellOrdner, angabe.ziel));
      return;
    }
    setze("entpackt", Math.round(bytes / 1e6));
    try {
      await fuehreAus(tarProgramm(), ["-xjf", zwischendatei, "-C", this.modellOrdner]);
    } finally {
      fs.rmSync(zwischendatei, { force: true });
    }
    if (!istVorhanden(this.modellOrdner, angabe)) throw new Error("Nach dem Entpacken fehlen Dateien. Bitte erneut laden.");
  }
}
