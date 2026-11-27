// Prüft den Voice Agent ohne echte Modelle: Sätze aus dem Strom, vorlesbarer Text, WAV, Vorschlag
// für ein schnelles Modell und den Ablauf eines Gesprächs mit Unterbrechen. npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Ereignis, ModellInfo, SprachEreignis } from "../../gemeinsam/typen.ts";
import { holeAgent } from "../datenbank/agenten.ts";
import type { AgentenSitzung } from "../laufzeit/laufzeit.ts";
import { aufbauen, warteBis } from "../testhilfe.ts";
import { loesche } from "../agenten/agenten-dienst.ts";
import { Gespraech } from "./gespraech.ts";
import { fuerSprache, SatzSammler } from "./saetze.ts";
import { richteSprachAgentenEin, schnellesModell, sprachAgentId } from "./sprach-agent.ts";
import { alsWav } from "./wav.ts";

test("Sätze kommen heraus, sobald sie fertig sind – Abkürzungen und Zahlen beenden keinen Satz", () => {
  const sammler = new SatzSammler();
  assert.deepEqual(sammler.nimm("Hallo Da"), []);
  assert.deepEqual(sammler.nimm("vid! Das geht z. B. am 3. Mai"), ["Hallo David!"]);
  assert.deepEqual(sammler.nimm(" um ca. acht Uhr. Pass"), ["Das geht z. B. am 3. Mai um ca. acht Uhr."]);
  assert.deepEqual(sammler.nimm("t das?"), []);
  assert.equal(sammler.rest(), "Passt das?");
  assert.equal(sammler.rest(), "");
  // Jahreszahl am Satzende: Ob der Satz endet, zeigt erst das nächste Wort.
  assert.deepEqual(sammler.nimm("Das war 2023. "), []);
  assert.deepEqual(sammler.nimm("Danach kam mehr. "), ["Das war 2023.", "Danach kam mehr."]);
  assert.deepEqual(sammler.nimm("Satz 0. "), []);
  assert.deepEqual(sammler.nimm("Satz 1"), ["Satz 0."]);
});

test("Lange Sätze ohne Punkt werden am Komma geteilt, damit das Sprechen früh beginnt", () => {
  const sammler = new SatzSammler();
  const lang = "Das ist ein ziemlich langer Satz, der immer weiter geht, ".repeat(4);
  const saetze = sammler.nimm(lang);
  assert.ok(saetze.length >= 1);
  assert.ok(saetze[0].endsWith(","));
});

test("Markdown wird vorlesbar: keine Sternchen, Listen, Links oder Code", () => {
  assert.equal(fuerSprache("**Wichtig:** Das ist `lokal`."), "Wichtig: Das ist lokal.");
  assert.equal(fuerSprache("- erstens\n- zweitens"), "erstens zweitens");
  assert.equal(fuerSprache("Siehe [Doku](https://example.org) 🚀"), "Siehe Doku");
  assert.equal(fuerSprache("Code:\n```abap\nWRITE 'x'.\n```\nFertig."), "Code: Fertig.");
});

test("WAV: richtiger Kopf und Länge", () => {
  const wav = alsWav(new Float32Array([0, 0.5, -1, 2]), 22050);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.length, 44 + 8);
  assert.equal(wav.readInt16LE(44 + 6), 32767, "zu laut wird begrenzt");
});

const modell = (id: string, multiplikator: number, denkStufen: string[] = []): ModellInfo => ({
  id,
  name: id,
  denkStufen,
  standardDenkStufe: null,
  kontextStandard: 128000,
  langerKontext: false,
  kontextLang: null,
  multiplikator,
});

test("Schnelles Modell: kleines, günstiges Modell mit niedrigstem Thinking Effort", () => {
  const wahl = schnellesModell([modell("gpt-5", 1), modell("gpt-5-mini", 0.33, ["low", "medium"]), modell("gemini-flash", 0.5)]);
  assert.deepEqual(wahl, { modell: "gpt-5-mini", denkaufwand: "low", kontext: "standard" });
  assert.equal(schnellesModell([modell("gpt-5", 1)]), null, "kein kleines Modell: automatisch bleibt");
});

test("Der Sprachassistent wird mitgeliefert und lässt sich nicht löschen", () => {
  const { db } = aufbauen();
  richteSprachAgentenEin(db);
  const agent = holeAgent(db, sprachAgentId);
  assert.equal(agent?.name, "Sprachassistent");
  assert.deepEqual(agent?.mcpServer, [], "ohne Tools");
  assert.throws(() => loesche(db, sprachAgentId), /nicht löschen/);
});

/**
 * Gespräch mit Platzhaltern: Die „Erkennung“ liest den Text aus einer Liste (Audio[0] = Index),
 * die Sitzung streamt die Antwort Wort für Wort und lässt sich abbrechen.
 */
function gespraechMitPlatzhaltern(antworten: Record<string, string>, wortPauseMs = 5) {
  const ereignisse: SprachEreignis[] = [];
  const gesendet: string[] = [];
  const verbrauch: number[] = [];
  const texte = ["", "Wie spät ist es?", "Halt, was anderes."];
  let empfaenger: (ereignis: Ereignis) => void = () => {};
  let abgebrochen = false;
  const sitzung: AgentenSitzung = {
    id: "s1",
    async sende(text) {
      gesendet.push(text);
      abgebrochen = false;
      for (const wort of (antworten[text] ?? "Okay.").split(/(?<= )/)) {
        if (abgebrochen) return;
        empfaenger({ art: "agent_schreibt", textTeil: wort });
        await new Promise((weiter) => setTimeout(weiter, wortPauseMs));
      }
      empfaenger({ art: "verbrauch", modell: "m", eingabeTokens: 1, ausgabeTokens: 1, cacheTokens: 0, nanoAiu: 1, kostenfaktor: 1 });
    },
    async abbrechen() {
      abgebrochen = true;
    },
    async trennen() {},
  };
  const gespraech = new Gespraech("g1", {
    erkenner: { erkenne: async (samples) => texte[samples[0]] },
    sprecher: { sprich: async () => ({ samples: new Float32Array(10), sampleRate: 22050 }) },
    sprachende: {
      nimm: (samples) => (samples[0] > 0 ? [samples] : []),
      hoertSprache: () => false,
      zuruecksetzen: () => {},
    },
    sitzung: async (neuerEmpfaenger) => {
      empfaenger = neuerEmpfaenger;
      return sitzung;
    },
    melde: (ereignis) => ereignisse.push(ereignis),
    verbrauch: (_ereignis, runde) => verbrauch.push(runde),
  });
  return { gespraech, ereignisse, gesendet, verbrauch };
}

const vonArt = <A extends SprachEreignis["art"]>(liste: SprachEreignis[], art: A) =>
  liste.filter((e): e is Extract<SprachEreignis, { art: A }> => e.art === art);

test("Gespräch: Äußerung → erkannt → Antwort in Sätzen als Audio → fertig, mit Messwerten", async () => {
  const { gespraech, ereignisse, gesendet, verbrauch } = gespraechMitPlatzhaltern({ "Wie spät ist es?": "Es ist acht Uhr. Noch etwas?" });
  gespraech.nimmAudio(new Float32Array([1]));
  await warteBis(() => vonArt(ereignisse, "antwort_fertig").length === 1);

  assert.deepEqual(gesendet, ["Wie spät ist es?"]);
  assert.equal(vonArt(ereignisse, "erkannt")[0].text, "Wie spät ist es?");
  assert.deepEqual(vonArt(ereignisse, "audio").map((a) => a.text), ["Es ist acht Uhr.", "Noch etwas?"]);
  assert.equal(vonArt(ereignisse, "antwort_fertig")[0].text, "Es ist acht Uhr. Noch etwas?");
  assert.deepEqual(verbrauch, [1]);
  const zeiten = vonArt(ereignisse, "zeiten")[0];
  assert.ok(zeiten.ersterTextMs !== null && zeiten.ersterTonMs !== null);
  await warteBis(() => ereignisse.at(-1)?.art === "zustand");
  assert.deepEqual(ereignisse.at(-1), { art: "zustand", zustand: "hoert" });
});

test("Gespräch: Stille ergibt keine Runde, Geräusch ohne Text wird übergangen", async () => {
  const { gespraech, ereignisse, gesendet } = gespraechMitPlatzhaltern({});
  gespraech.nimmAudio(new Float32Array([0]));
  assert.equal(ereignisse.length, 0);
  // Index 0 als Äußerung ist nicht möglich (0 = Stille); leerer Text kommt über die Erkennung
  gespraech.nimmText("   ");
  await warteBis(() => vonArt(ereignisse, "erkannt").length === 1);
  assert.deepEqual(gesendet, [], "leerer Text geht nicht an den Agenten");
});

test("Gespräch: Neue Äußerung unterbricht die laufende Antwort – deren Rest wird verworfen", async () => {
  const lang = Array.from({ length: 40 }, (_, i) => `Satz ${i}.`).join(" ");
  const { gespraech, ereignisse, gesendet } = gespraechMitPlatzhaltern({ "Wie spät ist es?": lang, "Halt, was anderes.": "Gern." }, 10);
  gespraech.nimmAudio(new Float32Array([1]));
  await warteBis(() => vonArt(ereignisse, "audio").length >= 1);
  gespraech.nimmAudio(new Float32Array([2]));
  await warteBis(() => vonArt(ereignisse, "antwort_fertig").length === 1);

  assert.deepEqual(gesendet, ["Wie spät ist es?", "Halt, was anderes."]);
  assert.deepEqual(vonArt(ereignisse, "unterbrochen").map((e) => e.runde), [1]);
  const fertig = vonArt(ereignisse, "antwort_fertig");
  assert.deepEqual(fertig.map((e) => [e.runde, e.text]), [[3, "Gern."]], "nur die neue Runde wird fertig");
  const nachUnterbrechung = ereignisse.slice(ereignisse.findIndex((e) => e.art === "unterbrochen"));
  assert.ok(!vonArt(nachUnterbrechung, "audio").some((a) => a.runde === 1), "kein Audio der alten Runde mehr");
});
