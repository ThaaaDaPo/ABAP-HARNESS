// Prüft das Lesen des Instructions-Ordners, den Dateikopf und dass nur erlaubte Dateien bearbeitet
// werden können (kein Ausbruch aus dem Ordner). npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { leseFrontmatter } from "./frontmatter.ts";
import { durchsuche, legeInstructionAn, legeSkillAn, liesDatei, schreibeDatei } from "./instructions-ordner.ts";

const neuerOrdner = () => fs.mkdtempSync(path.join(os.tmpdir(), "harness-instructions-"));

test("Frontmatter: einfache Schlüssel, Anführungszeichen, BOM und Windows-Zeilenenden", () => {
  const { kopf, inhalt } = leseFrontmatter('﻿---\r\napplyTo: "**/*.abap"\r\ndescription: Regeln\r\n---\r\nText\r\n');
  assert.deepEqual(kopf, { applyTo: "**/*.abap", description: "Regeln" });
  assert.equal(inhalt, "Text\r\n");
  assert.deepEqual(leseFrontmatter("Ohne Kopf"), { kopf: {}, inhalt: "Ohne Kopf" });
});

test("Ordner: Instructions auch in Unterordnern, Skills als Ordner mit SKILL.md", () => {
  const ordner = neuerOrdner();
  fs.mkdirSync(path.join(ordner, "instructions"));
  fs.writeFileSync(path.join(ordner, "instructions", "abap.instructions.md"), "---\ndescription: ABAP\napplyTo: '**'\n---\n");
  fs.writeFileSync(path.join(ordner, "notiz.md"), "keine Instruction");
  fs.mkdirSync(path.join(ordner, "skills", "review", "beispiele"), { recursive: true });
  fs.writeFileSync(path.join(ordner, "skills", "review", "SKILL.md"), "---\nname: code-review\ndescription: Prüft Code\n---\n");
  // Innerhalb eines Skills wird nicht weiter gesucht
  fs.writeFileSync(path.join(ordner, "skills", "review", "beispiele", "x.instructions.md"), "");

  const { instructions, skills } = durchsuche(ordner);
  assert.deepEqual(instructions, [{ pfad: "instructions/abap.instructions.md", beschreibung: "ABAP", applyTo: "**" }]);
  assert.deepEqual(skills, [{ pfad: "skills/review", name: "code-review", beschreibung: "Prüft Code", dateien: ["beispiele/"] }]);
  assert.throws(() => durchsuche(path.join(ordner, "gibtsnicht")), /existiert nicht/);
});

test("Anlegen und Bearbeiten nur für erlaubte Dateien im Ordner", () => {
  const ordner = neuerOrdner();
  const pfad = legeInstructionAn(ordner, "abap-klassen");
  assert.equal(pfad, "abap-klassen.instructions.md");
  assert.equal(legeSkillAn(ordner, "export"), "export");
  assert.throws(() => legeInstructionAn(ordner, "abap-klassen"), /gibt es schon/);
  assert.throws(() => legeInstructionAn(ordner, "../raus"), /Kleinbuchstaben/);

  schreibeDatei(ordner, pfad, "neu");
  assert.equal(liesDatei(ordner, pfad), "neu");
  schreibeDatei(ordner, "export/SKILL.md", "Skill");
  assert.equal(liesDatei(ordner, "export/SKILL.md"), "Skill");

  // Kein Ausbruch aus dem Ordner, keine anderen Dateien, keine neuen Dateien über Speichern
  assert.throws(() => liesDatei(ordner, "../../etc/passwd"), /nicht im Instructions-Ordner/);
  assert.throws(() => liesDatei(ordner, path.join(ordner, "..", "x.instructions.md")), /nicht im Instructions-Ordner/);
  assert.throws(() => schreibeDatei(ordner, "einstellungen.json", "{}"), /Bearbeiten lassen sich nur/);
  assert.throws(() => schreibeDatei(ordner, "neu.instructions.md", "x"), /gibt es nicht/);
});

test("Windows-Zeilenenden bleiben beim Speichern erhalten", () => {
  const ordner = neuerOrdner();
  fs.writeFileSync(path.join(ordner, "win.instructions.md"), "eins\r\nzwei\r\n");
  schreibeDatei(ordner, "win.instructions.md", "eins\nzwei\ndrei\n");
  assert.equal(fs.readFileSync(path.join(ordner, "win.instructions.md"), "utf8"), "eins\r\nzwei\r\ndrei\r\n");
});
