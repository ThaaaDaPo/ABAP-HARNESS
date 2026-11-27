// Die Schrittliste des Editors (E-66): Schritte untereinander, Bedingungen und Schleifen mit
// eingerückten Unterschritten. Jeder Schritt lässt sich verschieben, zuklappen und entfernen.
import { useState } from "react";
import type { SchrittArt, WorkflowSchritt } from "../../../gemeinsam/typen.ts";
import { BedingungFelder, BeendenFelder, KiFelder, SetzenFelder, ToolFelder, WorkflowFelder, type EditorKontext } from "./SchrittFelder.tsx";
import { artErklaerung, artText, neuerSchritt } from "./texte.ts";

interface ListenEigenschaften {
  schritte: WorkflowSchritt[];
  aendere: (schritte: WorkflowSchritt[]) => void;
  kontext: EditorKontext;
}

export function SchrittListe({ schritte, aendere, kontext }: ListenEigenschaften) {
  const setze = (index: number, schritt: WorkflowSchritt) => aendere(schritte.map((s, i) => (i === index ? schritt : s)));
  const verschiebe = (index: number, nach: number) => {
    const neu = [...schritte];
    const [schritt] = neu.splice(index, 1);
    neu.splice(nach, 0, schritt);
    aendere(neu);
  };
  const entferne = (index: number) => {
    const schritt = schritte[index];
    const mitUnterschritten = (schritt.art === "wenn" && schritt.dann.length + schritt.sonst.length > 0) || (schritt.art === "fuer_jedes" && schritt.schritte.length > 0);
    if (mitUnterschritten && !confirm("Diesen Schritt mit allen Unterschritten entfernen?")) return;
    aendere(schritte.filter((_, i) => i !== index));
  };

  return (
    <div className="schritt-liste">
      {schritte.map((schritt, index) => (
        <SchrittKarte
          key={schritt.id}
          schritt={schritt}
          aendere={(neu) => setze(index, neu)}
          kontext={kontext}
          hoch={index > 0 ? () => verschiebe(index, index - 1) : undefined}
          runter={index < schritte.length - 1 ? () => verschiebe(index, index + 1) : undefined}
          entferne={() => entferne(index)}
        />
      ))}
      <NeuerSchritt fuegeHinzu={(art) => aendere([...schritte, neuerSchritt(art)])} />
    </div>
  );
}

function NeuerSchritt({ fuegeHinzu }: { fuegeHinzu: (art: SchrittArt) => void }) {
  return (
    <select
      className="neuer-schritt"
      value=""
      onChange={(e) => {
        if (e.target.value) fuegeHinzu(e.target.value as SchrittArt);
      }}
    >
      <option value="">+ Schritt hinzufügen …</option>
      {(Object.keys(artText) as SchrittArt[]).map((art) => (
        <option key={art} value={art}>
          {artText[art]} – {artErklaerung[art]}
        </option>
      ))}
    </select>
  );
}

interface KartenEigenschaften {
  schritt: WorkflowSchritt;
  aendere: (schritt: WorkflowSchritt) => void;
  kontext: EditorKontext;
  hoch?: () => void;
  runter?: () => void;
  entferne: () => void;
}

function SchrittKarte({ schritt, aendere, kontext, hoch, runter, entferne }: KartenEigenschaften) {
  const [zu, setZu] = useState(false);
  return (
    <div className={`schritt-karte art-${schritt.art}`}>
      <div className="schritt-kopf">
        <button type="button" className="knopf-klein" onClick={() => setZu(!zu)} title={zu ? "Aufklappen" : "Zuklappen"}>
          {zu ? "▸" : "▾"}
        </button>
        <span className="schritt-art">{artText[schritt.art]}</span>
        <input className="schritt-titel" value={schritt.titel} onChange={(e) => aendere({ ...schritt, titel: e.target.value })} placeholder="Titel (optional)" />
        <code className="schritt-id" title="Kennung des Schritts – daran hängt das Protokoll">
          {schritt.id}
        </code>
        <button type="button" className="knopf-klein" onClick={hoch} disabled={!hoch} title="Nach oben">
          ↑
        </button>
        <button type="button" className="knopf-klein" onClick={runter} disabled={!runter} title="Nach unten">
          ↓
        </button>
        <button type="button" className="knopf-klein" onClick={entferne} title="Entfernen">
          ×
        </button>
      </div>
      {!zu && (
        <div className="schritt-inhalt">
          <SchrittInhalt schritt={schritt} aendere={aendere} kontext={kontext} />
        </div>
      )}
    </div>
  );
}

function SchrittInhalt({ schritt, aendere, kontext }: { schritt: WorkflowSchritt; aendere: (schritt: WorkflowSchritt) => void; kontext: EditorKontext }) {
  switch (schritt.art) {
    case "tool":
      return <ToolFelder schritt={schritt} aendere={aendere} kontext={kontext} />;
    case "ki":
      return <KiFelder schritt={schritt} aendere={aendere} kontext={kontext} />;
    case "setzen":
      return <SetzenFelder schritt={schritt} aendere={aendere} kontext={kontext} />;
    case "workflow":
      return <WorkflowFelder schritt={schritt} aendere={aendere} kontext={kontext} />;
    case "beenden":
      return <BeendenFelder schritt={schritt} aendere={aendere} kontext={kontext} />;
    case "wenn":
      return (
        <>
          <BedingungFelder bedingung={schritt.bedingung} aendere={(bedingung) => aendere({ ...schritt, bedingung })} />
          <div className="unterschritte">
            <div className="unterschritte-titel">Dann</div>
            <SchrittListe schritte={schritt.dann} aendere={(dann) => aendere({ ...schritt, dann })} kontext={kontext} />
            <div className="unterschritte-titel">Sonst</div>
            <SchrittListe schritte={schritt.sonst} aendere={(sonst) => aendere({ ...schritt, sonst })} kontext={kontext} />
          </div>
        </>
      );
    case "fuer_jedes":
      return (
        <>
          <div className="formular-zeile">
            <label>
              Liste
              <input className="code" value={schritt.liste} onChange={(e) => aendere({ ...schritt, liste: e.target.value })} placeholder="{{tickets}}" />
              <span className="hinweis">Eine Liste, JSON-Liste oder Text mit einem Eintrag je Zeile.</span>
            </label>
            <label className="schmal">
              Name je Eintrag
              <input className="code" value={schritt.als} onChange={(e) => aendere({ ...schritt, als: e.target.value.trim() })} />
              <span className="hinweis">
                {`{{${schritt.als || "eintrag"}}}`} und {`{{${schritt.als || "eintrag"}_nr}}`}
              </span>
            </label>
            <label className="schmal">
              Höchstens
              <input type="number" min={1} max={100} value={schritt.hoechstens} onChange={(e) => aendere({ ...schritt, hoechstens: Number(e.target.value) })} />
            </label>
          </div>
          <div className="unterschritte">
            <div className="unterschritte-titel">Je Eintrag</div>
            <SchrittListe schritte={schritt.schritte} aendere={(schritte) => aendere({ ...schritt, schritte })} kontext={kontext} />
          </div>
        </>
      );
  }
}
