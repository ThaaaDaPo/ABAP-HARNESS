// Aus dem gestreamten Text des Modells werden Sätze, damit der erste Satz schon gesprochen wird,
// während der Rest noch entsteht. Vor dem Sprechen fliegt heraus, was vorgelesen stört (Markdown).

/** Abkürzungen, hinter deren Punkt kein Satz endet. Einzelne Buchstaben („z. B.“, „d. h.“) gelten immer als Abkürzung. */
const abkuerzungen = new Set(["bzw", "ca", "evtl", "ggf", "inkl", "nr", "dr", "usw", "etc", "vgl", "bspw", "max", "min", "zzgl", "abs"]);

/** Hinter „3.“ geht es mit einem Monat oder kleingeschrieben weiter („am 3. Mai“, „der 2. versuch“) */
const monate = /^(jan|feb|mär|apr|mai|jun|jul|aug|sep|okt|nov|dez)/i;

/** Ab dieser Länge wird auch an einem Komma getrennt, damit lange Sätze nicht warten lassen */
const langerSatz = 160;

export class SatzSammler {
  private text = "";

  /** Nimmt ein Stück Text und gibt die Sätze zurück, die damit fertig sind. */
  nimm(teil: string): string[] {
    this.text += teil;
    const saetze: string[] = [];
    let ende: number;
    while ((ende = this.findeEnde()) > 0) {
      saetze.push(this.text.slice(0, ende).trim());
      this.text = this.text.slice(ende);
    }
    return saetze.filter(Boolean);
  }

  /** Was am Schluss übrig ist */
  rest(): string {
    const rest = this.text.trim();
    this.text = "";
    return rest;
  }

  /** Stelle hinter dem ersten fertigen Satz, 0 = noch keiner fertig */
  private findeEnde(): number {
    const muster = /[.!?…:;]+["“”»)]?(?=\s)|\n/g;
    let treffer: RegExpExecArray | null;
    while ((treffer = muster.exec(this.text))) {
      const ende = treffer.index + treffer[0].length;
      if (treffer[0] === "\n" || !treffer[0].startsWith(".")) return ende;
      const urteil = this.punktBeendetSatz(treffer.index, ende);
      if (urteil === "warten") return 0;
      if (urteil) return ende;
    }
    if (this.text.length > langerSatz) {
      const komma = this.text.lastIndexOf(", ", langerSatz);
      if (komma > 40) return komma + 1;
    }
    return 0;
  }

  /** Endet hier ein Satz? „warten“: Das hängt vom nächsten Wort ab, und das ist noch nicht da. */
  private punktBeendetSatz(punkt: number, ende: number): boolean | "warten" {
    const wort = this.text.slice(0, punkt).match(/[\p{L}\d]+$/u)?.[0] ?? "";
    if (/^\p{L}$/u.test(wort) || abkuerzungen.has(wort.toLowerCase())) return false;
    if (!/^\d+$/.test(wort)) return true;
    const danach = this.text.slice(ende).trimStart();
    if (!danach) return "warten";
    return !(monate.test(danach) || /^\p{Ll}/u.test(danach));
  }
}

/** Macht aus Markdown vorlesbaren Text. Code wird nicht vorgelesen. */
export function fuerSprache(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "ein Link")
    .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~#>|]/g, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
