// Die Eingabefelder je Schrittart (ohne Unterschritte – die stehen in SchrittListe.tsx).
// Platzhalter wie {{tickets}} oder {{eingaben.status}} sind überall erlaubt, wo Text steht.
import type { Agent, Bedingung, ErgebnisFeld, McpServer, ToolSchrittDaten, KiSchrittDaten, WorkflowInfo, WorkflowSchritt } from "../../../gemeinsam/typen.ts";
import { ohneRechts, regelText, vergleichText, wertTypText } from "./texte.ts";

export interface EditorKontext {
  agenten: Agent[];
  server: McpServer[];
  workflows: WorkflowInfo[];
  /** Kennung des Workflows, der gerade bearbeitet wird (ruft sich nicht selbst auf) */
  eigeneId: string;
}

type Art<A extends WorkflowSchritt["art"]> = Extract<WorkflowSchritt, { art: A }>;

interface Eigenschaften<S> {
  schritt: S;
  aendere: (schritt: S) => void;
  kontext: EditorKontext;
}

/** Name der Variablen, in die das Ergebnis kommt */
function ErgebnisFeldName({ wert, aendere, hinweis }: { wert: string; aendere: (wert: string) => void; hinweis?: string }) {
  return (
    <label>
      Ergebnis speichern in
      <input className="code" value={wert} onChange={(e) => aendere(e.target.value.trim())} placeholder="Variablenname, z. B. tickets (leer = nicht speichern)" />
      {hinweis && <span className="hinweis">{hinweis}</span>}
    </label>
  );
}

export function ToolFelder({ schritt, aendere, kontext }: Eigenschaften<ToolSchrittDaten>) {
  const server = kontext.server.find((s) => s.schluessel === schritt.server);
  const tool = server?.tools.find((t) => t.name === schritt.tool);
  const bekannte = tool?.parameter ?? [];
  const weitere = Object.keys(schritt.argumente).filter((n) => !bekannte.some((p) => p.name === n));
  const setzeArgument = (name: string, wert: string | null) => {
    const argumente = { ...schritt.argumente };
    if (wert === null) delete argumente[name];
    else argumente[name] = wert;
    aendere({ ...schritt, argumente });
  };

  return (
    <>
      <div className="formular-zeile">
        <label>
          MCP-Server
          <select value={schritt.server} onChange={(e) => aendere({ ...schritt, server: e.target.value, tool: "" })}>
            <option value="">– wählen –</option>
            {kontext.server.map((s) => (
              <option key={s.schluessel} value={s.schluessel}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tool
          {server && server.tools.length > 0 ? (
            <select value={schritt.tool} onChange={(e) => aendere({ ...schritt, tool: e.target.value })}>
              <option value="">– wählen –</option>
              {server.tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <input className="code" value={schritt.tool} onChange={(e) => aendere({ ...schritt, tool: e.target.value.trim() })} placeholder="Tools noch nicht ausgelesen" />
          )}
        </label>
        <label>
          Regel
          <select value={schritt.regel} onChange={(e) => aendere({ ...schritt, regel: e.target.value as ToolSchrittDaten["regel"] })}>
            {Object.entries(regelText).map(([regel, text]) => (
              <option key={regel} value={regel}>
                {text}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tool?.beschreibung && <span className="hinweis">{tool.beschreibung}</span>}

      <div className="feld">
        <span className="feld-titel">Argumente</span>
        {bekannte.length === 0 && weitere.length === 0 && (
          <span className="hinweis">
            {tool && !tool.parameter ? "Parameter unbekannt – unter MCP-Server die Tools neu lesen oder unten von Hand eintragen." : "Keine Argumente."}
          </span>
        )}
        {bekannte.map((p) => (
          <label key={p.name} className="argument">
            <span>
              <code>{p.name}</code>
              {p.pflicht && " *"} <span className="hinweis">{[p.typ, p.beschreibung].filter(Boolean).join(" – ")}</span>
            </span>
            <input className="code" value={schritt.argumente[p.name] ?? ""} onChange={(e) => setzeArgument(p.name, e.target.value)} />
          </label>
        ))}
        {weitere.map((name) => (
          <label key={name} className="argument">
            <span>
              <code>{name}</code>{" "}
              <button type="button" className="knopf-klein" onClick={() => setzeArgument(name, null)}>
                entfernen
              </button>
            </span>
            <input className="code" value={schritt.argumente[name]} onChange={(e) => setzeArgument(name, e.target.value)} />
          </label>
        ))}
        <div>
          <button
            type="button"
            className="knopf-klein"
            onClick={() => {
              const name = prompt("Name des Arguments:")?.trim();
              if (name) setzeArgument(name, schritt.argumente[name] ?? "");
            }}
          >
            + Argument
          </button>
        </div>
      </div>

      <div className="formular-zeile">
        <ErgebnisFeldName wert={schritt.ergebnis} aendere={(ergebnis) => aendere({ ...schritt, ergebnis })} hinweis="JSON-Ergebnisse lassen sich mit {{name.feld}} lesen." />
        <label>
          Bei Fehler
          <select value={schritt.beiFehler} onChange={(e) => aendere({ ...schritt, beiFehler: e.target.value as ToolSchrittDaten["beiFehler"] })}>
            <option value="abbrechen">Lauf abbrechen</option>
            <option value="weiter">weitermachen (Ergebnis: {"{ fehler }"})</option>
          </select>
        </label>
      </div>
    </>
  );
}

export function KiFelder({ schritt, aendere, kontext }: Eigenschaften<KiSchrittDaten>) {
  const setzeFeld = (index: number, feld: ErgebnisFeld | null) =>
    aendere({ ...schritt, felder: feld ? schritt.felder.map((f, i) => (i === index ? feld : f)) : schritt.felder.filter((_, i) => i !== index) });

  return (
    <>
      <label>
        Agent
        <select value={schritt.agentId} onChange={(e) => aendere({ ...schritt, agentId: e.target.value })}>
          {kontext.agenten.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="hinweis">Arbeitet in einer eigenen Sitzung mit seinen Regeln je Tool. Freigaben kommen ins Postfach bzw. in den Chat.</span>
      </label>
      <label>
        Auftrag
        <textarea className="lesbar" rows={4} value={schritt.auftrag} onChange={(e) => aendere({ ...schritt, auftrag: e.target.value })} />
      </label>
      <div className="feld">
        <span className="feld-titel">Ergebnisfelder</span>
        <span className="hinweis">
          Ohne Felder ist das Ergebnis die Antwort als Text. Mit Feldern meldet der Agent sie über das Tool ergebnis_melden – die App prüft jeden Typ.
        </span>
        {schritt.felder.map((feld, index) => (
          <div key={index} className="zeile-klein">
            <input className="code" value={feld.name} onChange={(e) => setzeFeld(index, { ...feld, name: e.target.value.trim() })} placeholder="name" />
            <select value={feld.typ} onChange={(e) => setzeFeld(index, { ...feld, typ: e.target.value as ErgebnisFeld["typ"] })}>
              {Object.entries(wertTypText).map(([typ, text]) => (
                <option key={typ} value={typ}>
                  {text}
                </option>
              ))}
            </select>
            <input value={feld.beschreibung} onChange={(e) => setzeFeld(index, { ...feld, beschreibung: e.target.value })} placeholder="Was soll drinstehen?" />
            <button type="button" className="knopf-klein" onClick={() => setzeFeld(index, null)}>
              ×
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="knopf-klein" onClick={() => aendere({ ...schritt, felder: [...schritt.felder, { name: "", typ: "text", beschreibung: "" }] })}>
            + Feld
          </button>
        </div>
      </div>
      <ErgebnisFeldName wert={schritt.ergebnis} aendere={(ergebnis) => aendere({ ...schritt, ergebnis })} />
    </>
  );
}

export function BedingungFelder({ bedingung, aendere }: { bedingung: Bedingung; aendere: (b: Bedingung) => void }) {
  return (
    <div className="formular-zeile">
      <label>
        Wert
        <input className="code" value={bedingung.links} onChange={(e) => aendere({ ...bedingung, links: e.target.value })} placeholder="{{einschaetzung.umsetzbar}}" />
      </label>
      <label className="schmal">
        Vergleich
        <select value={bedingung.vergleich} onChange={(e) => aendere({ ...bedingung, vergleich: e.target.value as Bedingung["vergleich"] })}>
          {Object.entries(vergleichText).map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      </label>
      {!ohneRechts.includes(bedingung.vergleich) && (
        <label>
          mit
          <input className="code" value={bedingung.rechts} onChange={(e) => aendere({ ...bedingung, rechts: e.target.value })} />
        </label>
      )}
    </div>
  );
}

export function SetzenFelder({ schritt, aendere }: Eigenschaften<Art<"setzen">>) {
  return (
    <div className="formular-zeile">
      <label className="schmal">
        Variable
        <input className="code" value={schritt.name} onChange={(e) => aendere({ ...schritt, name: e.target.value.trim() })} />
      </label>
      <label>
        Wert
        <textarea className="code" rows={2} value={schritt.wert} onChange={(e) => aendere({ ...schritt, wert: e.target.value })} placeholder="Text mit Platzhaltern" />
      </label>
    </div>
  );
}

export function WorkflowFelder({ schritt, aendere, kontext }: Eigenschaften<Art<"workflow">>) {
  const andere = kontext.workflows.filter((w) => w.id !== kontext.eigeneId && w.definition);
  const ziel = andere.find((w) => w.id === schritt.workflowId)?.definition;
  return (
    <>
      <label>
        Workflow
        <select value={schritt.workflowId} onChange={(e) => aendere({ ...schritt, workflowId: e.target.value, eingaben: {} })}>
          <option value="">– wählen –</option>
          {andere.map((w) => (
            <option key={w.id} value={w.id}>
              {w.definition!.name}
            </option>
          ))}
        </select>
      </label>
      {ziel?.eingaben.map((eingabe) => (
        <label key={eingabe.name} className="argument">
          <span>
            <code>{eingabe.name}</code>
            {eingabe.pflicht && " *"} <span className="hinweis">{eingabe.beschreibung}</span>
          </span>
          <input
            className="code"
            value={schritt.eingaben[eingabe.name] ?? ""}
            onChange={(e) => aendere({ ...schritt, eingaben: { ...schritt.eingaben, [eingabe.name]: e.target.value } })}
            placeholder={eingabe.standard ? `Standard: ${eingabe.standard}` : ""}
          />
        </label>
      ))}
      <ErgebnisFeldName wert={schritt.ergebnis} aendere={(ergebnis) => aendere({ ...schritt, ergebnis })} />
    </>
  );
}

export function BeendenFelder({ schritt, aendere }: Eigenschaften<Art<"beenden">>) {
  return (
    <label>
      Ergebnis
      <textarea className="code" rows={2} value={schritt.ergebnis} onChange={(e) => aendere({ ...schritt, ergebnis: e.target.value })} placeholder="Was der Aufrufer bekommt (leer = nichts)" />
    </label>
  );
}
