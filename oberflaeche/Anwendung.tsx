// Rahmen der Anwendung: Navigation links, gewählte Seite rechts.
// Der gewählte Chat steht hier und nicht in der Chat-Seite, damit das Postfach direkt zu einem Chat springen kann.
import { useCallback, useEffect, useState } from "react";
import type { StatusAntwort } from "../gemeinsam/typen.ts";
import { holeAnzahlOffen, holeStatus } from "./api.ts";
import { Navigation, type SeitenName } from "./komponenten/Navigation.tsx";
import { useUebersicht } from "./live/useUebersicht.ts";
import { ChatSeite } from "./seiten/ChatSeite.tsx";
import { McpSeite } from "./seiten/McpSeite.tsx";
import { PostfachSeite } from "./seiten/PostfachSeite.tsx";

export function Anwendung() {
  const [seite, setSeite] = useState<SeitenName>("chat");
  const [chatId, setChatId] = useState<string | null>(null);
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

  return (
    <div className="anwendung">
      <Navigation aktiv={seite} waehle={setSeite} status={status} offenImPostfach={offenImPostfach} />
      <main className="inhalt">
        {seite === "chat" && <ChatSeite gewaehlteId={chatId} waehle={setChatId} />}
        {seite === "mcp" && <McpSeite />}
        {seite === "postfach" && <PostfachSeite zeigeChat={zeigeChat} />}
      </main>
    </div>
  );
}
