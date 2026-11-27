// Rahmen der Anwendung: Navigation links, gewählte Seite rechts.
// Der gewählte Chat und der gewählte Workflow-Lauf stehen hier und nicht in den Seiten, damit Postfach
// und Chat direkt zu einem Chat bzw. Lauf springen können.
import { useCallback, useEffect, useState } from "react";
import type { StatusAntwort } from "../gemeinsam/typen.ts";
import { holeAnzahlOffen, holeStatus } from "./api.ts";
import { Navigation, type SeitenName } from "./komponenten/Navigation.tsx";
import { useUebersicht } from "./live/useUebersicht.ts";
import { AgentenSeite } from "./seiten/AgentenSeite.tsx";
import { ChatSeite } from "./seiten/ChatSeite.tsx";
import { EinrichtungSeite } from "./seiten/EinrichtungSeite.tsx";
import { InstructionsSeite } from "./seiten/InstructionsSeite.tsx";
import { McpSeite } from "./seiten/McpSeite.tsx";
import { PostfachSeite } from "./seiten/PostfachSeite.tsx";
import { SprechenSeite } from "./seiten/SprechenSeite.tsx";
import { VerbrauchSeite } from "./seiten/VerbrauchSeite.tsx";
import { WorkflowsSeite } from "./seiten/WorkflowsSeite.tsx";

export function Anwendung() {
  const [seite, setSeite] = useState<SeitenName>("chat");
  const [chatId, setChatId] = useState<string | null>(null);
  const [laufNr, setLaufNr] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusAntwort | null>(null);
  const [offenImPostfach, setOffenImPostfach] = useState(0);

  useEffect(() => {
    holeStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const zaehle = useCallback(() => {
    holeAnzahlOffen().then(({ anzahl }) => setOffenImPostfach(anzahl)).catch(() => {});
  }, []);
  useEffect(zaehle, [zaehle]);
  useUebersicht("postfach", zaehle);

  function zeigeChat(id: string) {
    setChatId(id);
    setSeite("chat");
  }

  function zeigeLauf(nr: number) {
    setLaufNr(nr);
    setSeite("workflows");
  }

  return (
    <div className="anwendung">
      <Navigation aktiv={seite} waehle={setSeite} status={status} offenImPostfach={offenImPostfach} />
      <main className="inhalt">
        {seite === "chat" && <ChatSeite gewaehlteId={chatId} waehle={setChatId} zeigeLauf={zeigeLauf} />}
        {seite === "sprechen" && <SprechenSeite />}
        {seite === "workflows" && <WorkflowsSeite laufNr={laufNr} waehleLauf={setLaufNr} zeigeChat={zeigeChat} />}
        {seite === "agenten" && <AgentenSeite />}
        {seite === "instructions" && <InstructionsSeite />}
        {seite === "mcp" && <McpSeite />}
        {seite === "verbrauch" && <VerbrauchSeite />}
        {seite === "einrichtung" && <EinrichtungSeite />}
        {seite === "postfach" && <PostfachSeite zeigeChat={zeigeChat} zeigeLauf={zeigeLauf} />}
      </main>
    </div>
  );
}
