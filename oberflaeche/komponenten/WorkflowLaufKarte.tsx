// Im Chat: Der Agent hat einen Workflow gestartet. Die Karte zeigt, wo der Lauf steht, und führt zur
// Lauf-Ansicht. Freigaben des Laufs erscheinen als eigene Karten im Chat (E-68).
import { useCallback, useEffect, useState } from "react";
import type { WorkflowLauf } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { useUebersicht } from "../live/useUebersicht.ts";
import { laufStatusText } from "./workflow/texte.ts";

interface Eigenschaften {
  laufNr: number;
  workflowName: string;
  zeigeLauf?: (nr: number) => void;
}

export function WorkflowLaufKarte({ laufNr, workflowName, zeigeLauf }: Eigenschaften) {
  const [lauf, setLauf] = useState<WorkflowLauf | null>(null);
  const lade = useCallback(() => {
    api.holeLauf(laufNr).then((l) => setLauf(l.lauf)).catch(() => {});
  }, [laufNr]);
  useEffect(lade, [lade]);
  useUebersicht("workflows", lade);

  return (
    <div className={`workflow-lauf-karte ${lauf?.status ?? ""}`}>
      <div className="workflow-lauf-kopf">
        <span>
          Workflow <strong>{workflowName}</strong> · Lauf #{laufNr}
        </span>
        {lauf && <span className={`lauf-status ${lauf.status}`}>{laufStatusText[lauf.status]}</span>}
      </div>
      {lauf?.aktuellerSchritt && <div className="hinweis">Schritt: {lauf.aktuellerSchritt}</div>}
      {lauf?.fehler && <div className="fehler-text">{lauf.fehler}</div>}
      {zeigeLauf && (
        <button className="karten-chat" onClick={() => zeigeLauf(laufNr)}>
          Lauf ansehen
        </button>
      )}
    </div>
  );
}
