// Verlauf eines KI-Schritts in der Lauf-Ansicht – derselbe Verlauf wie im Chat, live aktualisiert.
// Freigaben stehen in der Zeile des Schritts darüber; hier wird nur gelesen.
import { useEffect, useState } from "react";
import type { AufgabenStatus, Ereignis, PostfachEintrag } from "../../../gemeinsam/typen.ts";
import * as api from "../../api.ts";
import { useLiveEreignisse } from "../../live/useLiveEreignisse.ts";
import { Verlauf } from "../Verlauf.tsx";

const nurLesen = { freigeben: () => {}, verwerfen: () => {}, zurKenntnis: () => {}, antworten: () => {} };

export function KiVerlauf({ aufgabeId }: { aufgabeId: string }) {
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [eintraege, setEintraege] = useState<PostfachEintrag[]>([]);
  const [status, setStatus] = useState<AufgabenStatus>("bereit");
  const [laufenderText, setLaufenderText] = useState("");

  useEffect(() => {
    api
      .holeAufgabe(aufgabeId)
      .then((daten) => {
        setEreignisse(daten.ereignisse);
        setEintraege(daten.postfach);
        setStatus(daten.aufgabe.status);
      })
      .catch(() => {});
  }, [aufgabeId]);

  useLiveEreignisse(aufgabeId, (ereignis) => {
    if (ereignis.art === "agent_schreibt") return setLaufenderText((bisher) => bisher + ereignis.textTeil);
    if (ereignis.art === "status") return setStatus(ereignis.status);
    if (ereignis.art === "postfach" || ereignis.art === "postfach_aktion") api.holePostfachDerAufgabe(aufgabeId).then(setEintraege).catch(() => {});
    if (ereignis.art === "agent_nachricht") setLaufenderText("");
    setEreignisse((bisher) => [...bisher, ereignis]);
  });

  return (
    <div className="ki-verlauf">
      <Verlauf
        aufgabeId={aufgabeId}
        ereignisse={ereignisse}
        laufenderText={laufenderText}
        status={status}
        // Offene Freigaben und Rückfragen erledigt David in der Zeile des Schritts; hier steht nur Erledigtes.
        eintraege={eintraege.filter((e) => e.status !== "offen" && e.status !== "fehlgeschlagen")}
        aktionen={() => nurLesen}
        beschaeftigt={null}
      />
    </div>
  );
}
