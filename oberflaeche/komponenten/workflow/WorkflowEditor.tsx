// Editor eines Workflows: Name, Beschreibung, Startwege (E-66), Eingaben, Schritte, Ergebnis und
// Credit-Limit (E-69). Gespeichert wird mit „Speichern“ in die JSON-Datei; „Als JSON“ zeigt die Datei
// zum Kopieren oder Bearbeiten.
import { useState } from "react";
import type { WertTyp, WorkflowDefinition, WorkflowEingabe, Zeitplan } from "../../../gemeinsam/typen.ts";
import { SchrittListe } from "./SchrittListe.tsx";
import type { EditorKontext } from "./SchrittFelder.tsx";
import { variablenNamen, wertTypText, wochentage } from "./texte.ts";

interface Eigenschaften {
  definition: WorkflowDefinition;
  kontext: EditorKontext;
  speichere: (definition: WorkflowDefinition) => void;
  beschaeftigt: boolean;
}

export function WorkflowEditor({ definition, kontext, speichere, beschaeftigt }: Eigenschaften) {
  const [entwurf, setEntwurf] = useState<WorkflowDefinition>(definition);
  const [json, setJson] = useState<string | null>(null);
  const [jsonFehler, setJsonFehler] = useState<string | null>(null);
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(definition);
  const setze = (teil: Partial<WorkflowDefinition>) => setEntwurf((bisher) => ({ ...bisher, ...teil }));
  const setzeStart = (teil: Partial<WorkflowDefinition["start"]>) => setze({ start: { ...entwurf.start, ...teil } });

  function uebernimmJson() {
    try {
      setEntwurf(JSON.parse(json ?? ""));
      setJson(null);
      setJsonFehler(null);
    } catch (fehler) {
      setJsonFehler(`Kein gültiges JSON: ${(fehler as Error).message}`);
    }
  }

  const platzhalter = [...entwurf.eingaben.map((e) => `eingaben.${e.name}`), ...variablenNamen(entwurf.schritte)].filter(Boolean);

  return (
    <form
      className="formular workflow-editor"
      onSubmit={(e) => {
        e.preventDefault();
        speichere(entwurf);
      }}
    >
      <div className="knopfreihe">
        <button type="submit" className="knopf haupt" disabled={beschaeftigt || !geaendert || json !== null}>
          Speichern
        </button>
        {geaendert && (
          <button type="button" className="knopf" onClick={() => setEntwurf(definition)} disabled={beschaeftigt}>
            Verwerfen
          </button>
        )}
        <button type="button" className="knopf" onClick={() => setJson(json === null ? JSON.stringify(entwurf, null, 2) : null)}>
          {json === null ? "Als JSON" : "Zurück zur Schrittliste"}
        </button>
        {geaendert && <span className="hinweis">Ungespeicherte Änderungen. Laufende Läufe arbeiten mit dem Stand, mit dem sie gestartet sind.</span>}
      </div>

      {json !== null ? (
        <>
          <textarea className="editor" value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
          {jsonFehler && <span className="fehler-text">{jsonFehler}</span>}
          <div className="knopfreihe">
            <button type="button" className="knopf" onClick={uebernimmJson}>
              JSON übernehmen
            </button>
          </div>
        </>
      ) : (
        <>
          <label>
            Name
            <input value={entwurf.name} onChange={(e) => setze({ name: e.target.value })} />
          </label>
          <label>
            Beschreibung
            <span className="hinweis">Wofür der Workflow da ist. Bei „Start durch Agent“ liest der Agent das und entscheidet danach.</span>
            <textarea className="lesbar" rows={2} value={entwurf.beschreibung} onChange={(e) => setze({ beschreibung: e.target.value })} />
          </label>

          <fieldset className="feld">
            <legend className="feld-titel">Start</legend>
            <label className="haken">
              <input type="checkbox" checked={entwurf.start.manuell} onChange={(e) => setzeStart({ manuell: e.target.checked })} />
              Manuell (Knopf „Starten“)
            </label>
            <label className="haken">
              <input type="checkbox" checked={entwurf.start.durchAgent} onChange={(e) => setzeStart({ durchAgent: e.target.checked })} />
              Durch einen Agenten – wenn er ihm auf der Agenten-Seite zugeordnet ist
              {kontext.workflows.find((w) => w.id === kontext.eigeneId)?.agenten.length ? (
                <span className="hinweis">Zugeordnet: {kontext.workflows.find((w) => w.id === kontext.eigeneId)!.agenten.join(", ")}</span>
              ) : null}
            </label>
            <label className="haken">
              <input
                type="checkbox"
                checked={!!entwurf.start.zeitplan}
                onChange={(e) => setzeStart({ zeitplan: e.target.checked ? { art: "uhrzeit", uhrzeit: "07:00", wochentage: [1, 2, 3, 4, 5] } : null })}
              />
              Zeitgesteuert
            </label>
            {entwurf.start.zeitplan && <ZeitplanFelder zeitplan={entwurf.start.zeitplan} aendere={(zeitplan) => setzeStart({ zeitplan })} />}
          </fieldset>

          <EingabenFelder eingaben={entwurf.eingaben} aendere={(eingaben) => setze({ eingaben })} />

          <div className="feld">
            <span className="feld-titel">Schritte</span>
            {platzhalter.length > 0 && (
              <span className="hinweis">
                Platzhalter: {platzhalter.map((p) => <code key={p}>{`{{${p}}}`} </code>)}
              </span>
            )}
            <SchrittListe schritte={entwurf.schritte} aendere={(schritte) => setze({ schritte })} kontext={kontext} />
          </div>

          <label>
            Ergebnis
            <span className="hinweis">Was der Aufrufer am Ende bekommt (z. B. der Agent, der den Workflow gestartet hat). Leer = nichts Besonderes.</span>
            <textarea className="code" rows={2} value={entwurf.ergebnis} onChange={(e) => setze({ ergebnis: e.target.value })} />
          </label>
          <label className="schmal">
            Credit-Limit je Lauf
            <input type="number" min={1} value={entwurf.creditLimit} onChange={(e) => setze({ creditLimit: Number(e.target.value) })} />
            <span className="hinweis">AI-Credits. Verbrauchen die KI-Schritte eines Laufs mehr, bricht er ab.</span>
          </label>
        </>
      )}
    </form>
  );
}

function ZeitplanFelder({ zeitplan, aendere }: { zeitplan: Zeitplan; aendere: (zeitplan: Zeitplan) => void }) {
  return (
    <div className="zeitplan">
      <select
        value={zeitplan.art}
        onChange={(e) => aendere(e.target.value === "intervall" ? { art: "intervall", minuten: 60 } : { art: "uhrzeit", uhrzeit: "07:00", wochentage: [1, 2, 3, 4, 5] })}
      >
        <option value="uhrzeit">zur Uhrzeit</option>
        <option value="intervall">alle … Minuten</option>
      </select>
      {zeitplan.art === "uhrzeit" ? (
        <>
          <input type="time" value={zeitplan.uhrzeit} onChange={(e) => aendere({ ...zeitplan, uhrzeit: e.target.value })} />
          {wochentage.map(({ tag, kurz }) => (
            <label key={tag} className="haken">
              <input
                type="checkbox"
                checked={zeitplan.wochentage.includes(tag)}
                onChange={(e) => aendere({ ...zeitplan, wochentage: e.target.checked ? [...zeitplan.wochentage, tag] : zeitplan.wochentage.filter((t) => t !== tag) })}
              />
              {kurz}
            </label>
          ))}
        </>
      ) : (
        <input type="number" min={1} value={zeitplan.minuten} onChange={(e) => aendere({ ...zeitplan, minuten: Number(e.target.value) })} />
      )}
      <span className="hinweis">Nur solange die App läuft. Verpasste Zeitpunkte werden nicht nachgeholt.</span>
    </div>
  );
}

function EingabenFelder({ eingaben, aendere }: { eingaben: WorkflowEingabe[]; aendere: (eingaben: WorkflowEingabe[]) => void }) {
  const setze = (index: number, eingabe: WorkflowEingabe | null) =>
    aendere(eingabe ? eingaben.map((e, i) => (i === index ? eingabe : e)) : eingaben.filter((_, i) => i !== index));
  return (
    <div className="feld">
      <span className="feld-titel">Eingaben</span>
      <span className="hinweis">Werte, die beim Start mitkommen – in Schritten als {"{{eingaben.name}}"}. Zeitgesteuerte Läufe nehmen den Standardwert.</span>
      {eingaben.map((eingabe, index) => (
        <div key={index} className="zeile-klein">
          <input className="code" value={eingabe.name} onChange={(e) => setze(index, { ...eingabe, name: e.target.value.trim() })} placeholder="name" />
          <select value={eingabe.typ} onChange={(e) => setze(index, { ...eingabe, typ: e.target.value as WertTyp })}>
            {Object.entries(wertTypText).map(([typ, text]) => (
              <option key={typ} value={typ}>
                {text}
              </option>
            ))}
          </select>
          <input value={eingabe.standard} onChange={(e) => setze(index, { ...eingabe, standard: e.target.value })} placeholder="Standardwert" />
          <input value={eingabe.beschreibung} onChange={(e) => setze(index, { ...eingabe, beschreibung: e.target.value })} placeholder="Beschreibung" />
          <label className="haken">
            <input type="checkbox" checked={eingabe.pflicht} onChange={(e) => setze(index, { ...eingabe, pflicht: e.target.checked })} />
            Pflicht
          </label>
          <button type="button" className="knopf-klein" onClick={() => setze(index, null)}>
            ×
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="knopf-klein" onClick={() => aendere([...eingaben, { name: "", beschreibung: "", typ: "text", pflicht: false, standard: "" }])}>
          + Eingabe
        </button>
      </div>
    </div>
  );
}
