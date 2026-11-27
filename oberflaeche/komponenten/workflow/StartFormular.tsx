// Manueller Start: Eingaben ausfüllen (vorbelegt mit den Standardwerten), dann starten.
import { useState } from "react";
import type { WorkflowDefinition } from "../../../gemeinsam/typen.ts";
import { wertTypText } from "./texte.ts";

interface Eigenschaften {
  definition: WorkflowDefinition;
  starte: (eingaben: Record<string, unknown>) => void;
  schliesse: () => void;
  beschaeftigt: boolean;
}

export function StartFormular({ definition, starte, schliesse, beschaeftigt }: Eigenschaften) {
  const [werte, setWerte] = useState<Record<string, string>>(Object.fromEntries(definition.eingaben.map((e) => [e.name, e.standard])));
  return (
    <form
      className="formular start-formular"
      onSubmit={(e) => {
        e.preventDefault();
        starte(werte);
      }}
    >
      {definition.eingaben.map((eingabe) => (
        <label key={eingabe.name}>
          <span>
            {eingabe.name}
            {eingabe.pflicht && " *"} <span className="hinweis">({wertTypText[eingabe.typ]}{eingabe.typ === "liste" ? ", eine Zeile oder ein Komma je Eintrag" : ""})</span>
          </span>
          {eingabe.beschreibung && <span className="hinweis">{eingabe.beschreibung}</span>}
          {eingabe.typ === "ja_nein" ? (
            <select value={werte[eingabe.name]} onChange={(e) => setWerte({ ...werte, [eingabe.name]: e.target.value })}>
              <option value="">–</option>
              <option value="ja">ja</option>
              <option value="nein">nein</option>
            </select>
          ) : eingabe.typ === "liste" ? (
            <textarea rows={3} value={werte[eingabe.name]} onChange={(e) => setWerte({ ...werte, [eingabe.name]: e.target.value })} />
          ) : (
            <input value={werte[eingabe.name]} onChange={(e) => setWerte({ ...werte, [eingabe.name]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="knopfreihe">
        <button type="submit" className="knopf haupt" disabled={beschaeftigt}>
          Starten
        </button>
        <button type="button" className="knopf" onClick={schliesse}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
