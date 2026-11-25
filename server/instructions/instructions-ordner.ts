// Der Ordner mit Instructions und Skills (E-30, E-58). Die Dateien darin bleiben die Wahrheit:
// Die App liest sie bei Bedarf neu, legt an und speichert – eine Kopie in der Datenbank gibt es nicht.
//
// - Instructions: Dateien *.instructions.md (auch in Unterordnern). Zugeordnete Instructions werden
//   an den Auftrag des Agenten gehängt.
// - Skills: Ordner mit einer SKILL.md. Copilot lädt sie selbst (skillDirectories); was dem Agenten
//   nicht zugeordnet ist, wird abgeschaltet (disabledSkills).
import fs from "node:fs";
import path from "node:path";
import { Fehler } from "../fehler.ts";
import { leseFrontmatter } from "./frontmatter.ts";

const instructionEndung = ".instructions.md";
const skillDatei = "SKILL.md";
/** Tiefer wird nicht gesucht – ein falsch eingetragener Ordner (z. B. C:\) soll nicht ewig dauern. */
const maxTiefe = 6;
const uebersprungen = new Set(["node_modules", ".git"]);

export interface GefundeneInstruction {
  pfad: string;
  beschreibung: string;
  applyTo: string;
}

export interface GefundenerSkill {
  pfad: string;
  name: string;
  beschreibung: string;
  dateien: string[];
}

/** Pfad relativ zum Ordner, immer mit / – so ist er unter Windows und macOS gleich. */
function relativ(ordner: string, absolut: string): string {
  return path.relative(ordner, absolut).split(path.sep).join("/");
}

/** Liest den Ordner. Wirft einen verständlichen Fehler, wenn es ihn nicht gibt. */
export function durchsuche(ordner: string): { instructions: GefundeneInstruction[]; skills: GefundenerSkill[] } {
  if (!fs.existsSync(ordner)) throw new Fehler(404, `Der Instructions-Ordner ${ordner} existiert nicht.`);
  const instructions: GefundeneInstruction[] = [];
  const skills: GefundenerSkill[] = [];

  function besuche(verzeichnis: string, tiefe: number) {
    let eintraege: fs.Dirent[];
    try {
      eintraege = fs.readdirSync(verzeichnis, { withFileTypes: true });
    } catch (fehler) {
      // Ein nicht lesbarer Unterordner soll nicht die ganze Liste verhindern.
      if (tiefe === 0) throw new Fehler(500, `Der Instructions-Ordner ist nicht lesbar: ${(fehler as Error).message}`);
      return;
    }
    // Ein Ordner mit SKILL.md ist ein Skill; darin wird nicht weiter gesucht.
    if (tiefe > 0 && eintraege.some((e) => e.isFile() && e.name === skillDatei)) {
      const { kopf } = leseFrontmatter(fs.readFileSync(path.join(verzeichnis, skillDatei), "utf8"));
      skills.push({
        pfad: relativ(ordner, verzeichnis),
        name: kopf.name || path.basename(verzeichnis),
        beschreibung: kopf.description ?? "",
        dateien: eintraege.filter((e) => e.name !== skillDatei).map((e) => (e.isDirectory() ? `${e.name}/` : e.name)),
      });
      return;
    }
    for (const eintrag of eintraege) {
      const voll = path.join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory() && tiefe < maxTiefe && !uebersprungen.has(eintrag.name)) besuche(voll, tiefe + 1);
      else if (eintrag.isFile() && eintrag.name.endsWith(instructionEndung)) {
        const { kopf } = leseFrontmatter(fs.readFileSync(voll, "utf8"));
        instructions.push({ pfad: relativ(ordner, voll), beschreibung: kopf.description ?? "", applyTo: kopf.applyTo ?? "" });
      }
    }
  }

  besuche(ordner, 0);
  instructions.sort((a, b) => a.pfad.localeCompare(b.pfad));
  skills.sort((a, b) => a.pfad.localeCompare(b.pfad));
  return { instructions, skills };
}

/**
 * Macht aus dem Pfad, den die Oberfläche schickt, einen absoluten Pfad – aber nur für Dateien, die die
 * App bearbeiten darf: *.instructions.md oder SKILL.md, und nur innerhalb des Ordners.
 */
function dateiPfad(ordner: string, pfad: string): string {
  const absolut = path.resolve(ordner, pfad);
  const rel = path.relative(ordner, absolut);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Fehler(400, "Der Pfad liegt nicht im Instructions-Ordner.");
  const name = path.basename(absolut);
  if (!name.endsWith(instructionEndung) && name !== skillDatei) {
    throw new Fehler(400, `Bearbeiten lassen sich nur *${instructionEndung} und ${skillDatei}.`);
  }
  return absolut;
}

export function liesDatei(ordner: string, pfad: string): string {
  const absolut = dateiPfad(ordner, pfad);
  if (!fs.existsSync(absolut)) throw new Fehler(404, `${pfad} gibt es nicht (mehr).`);
  return fs.readFileSync(absolut, "utf8");
}

/** Speichert nur Dateien, die es schon gibt (neue entstehen über legeInstructionAn / legeSkillAn). */
export function schreibeDatei(ordner: string, pfad: string, inhalt: string): void {
  const absolut = dateiPfad(ordner, pfad);
  if (!fs.existsSync(absolut)) throw new Fehler(404, `${pfad} gibt es nicht (mehr).`);
  // Zeilenenden so lassen, wie sie waren: Der Browser liefert immer \n, Windows-Dateien haben oft \r\n.
  const vorher = fs.readFileSync(absolut, "utf8");
  const text = vorher.includes("\r\n") ? inhalt.replace(/\r?\n/g, "\r\n") : inhalt;
  fs.writeFileSync(absolut, text, "utf8");
}

const namensMuster = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const namensRegel = "Der Name darf nur Kleinbuchstaben, Ziffern, - und _ enthalten, z. B. abap-klassen.";

/** Legt <name>.instructions.md oben im Ordner an und gibt den Pfad zurück. */
export function legeInstructionAn(ordner: string, name: string): string {
  if (!namensMuster.test(name)) throw new Fehler(400, namensRegel);
  const pfad = `${name}${instructionEndung}`;
  const absolut = path.join(ordner, pfad);
  if (fs.existsSync(absolut)) throw new Fehler(409, `${pfad} gibt es schon.`);
  fs.writeFileSync(absolut, `---\ndescription: \napplyTo: "**"\n---\n\n# ${name}\n\n`, "utf8");
  return pfad;
}

/** Legt den Ordner <name> mit einer SKILL.md an und gibt den Pfad des Ordners zurück. */
export function legeSkillAn(ordner: string, name: string): string {
  if (!namensMuster.test(name)) throw new Fehler(400, namensRegel);
  const absolut = path.join(ordner, name);
  if (fs.existsSync(absolut)) throw new Fehler(409, `Den Ordner ${name} gibt es schon.`);
  fs.mkdirSync(absolut);
  fs.writeFileSync(
    path.join(absolut, skillDatei),
    `---\nname: ${name}\ndescription: Wann der Agent diesen Skill benutzen soll\n---\n\n# ${name}\n\n`,
    "utf8",
  );
  return name;
}

/**
 * Die zugeordneten Instructions als Text für den Auftrag. Fehlt eine Datei inzwischen, wird sie
 * übergangen (die Agenten-Seite zeigt das an).
 */
export function instructionsText(ordner: string, pfade: string[]): string {
  const teile: string[] = [];
  for (const pfad of pfade) {
    try {
      const { inhalt } = leseFrontmatter(liesDatei(ordner, pfad));
      teile.push(`## ${pfad}\n\n${inhalt.trim()}`);
    } catch {
      // Datei fehlt oder ist nicht lesbar – übergehen
    }
  }
  if (teile.length === 0) return "";
  return `# Instructions\n\nDiese Anweisungen gelten zusätzlich zu deinem Auftrag.\n\n${teile.join("\n\n")}`;
}

/**
 * Was Copilot über Skills wissen muss: die Ordner, in denen Skills liegen (je der Ordner über einem
 * Skill-Ordner), und die Namen der Skills, die dieser Agent nicht benutzen soll.
 */
export function skillsFuerSitzung(ordner: string, zugeordnet: string[]): { ordner: string[]; abgeschaltet: string[] } {
  let skills: GefundenerSkill[];
  try {
    skills = durchsuche(ordner).skills;
  } catch {
    return { ordner: [], abgeschaltet: [] };
  }
  const oberordner = new Set(skills.map((s) => path.dirname(path.resolve(ordner, s.pfad))));
  return {
    ordner: [...oberordner],
    abgeschaltet: skills.filter((s) => !zugeordnet.includes(s.pfad)).map((s) => s.name),
  };
}
