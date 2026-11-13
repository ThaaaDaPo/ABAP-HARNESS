// Rahmen der Anwendung: Navigation links, gewählte Seite rechts.
import { useEffect, useState } from "react";
import type { StatusAntwort } from "../gemeinsam/typen.ts";
import { holeStatus } from "./api.ts";
import { Navigation, type SeitenName } from "./komponenten/Navigation.tsx";
import { ChatSeite } from "./seiten/ChatSeite.tsx";
import { McpSeite } from "./seiten/McpSeite.tsx";

export function Anwendung() {
  const [seite, setSeite] = useState<SeitenName>("chat");
  const [status, setStatus] = useState<StatusAntwort | null>(null);

  useEffect(() => {
    holeStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  return (
    <div className="anwendung">
      <Navigation aktiv={seite} waehle={setSeite} status={status} />
      <main className="inhalt">
        {seite === "chat" && <ChatSeite />}
        {seite === "mcp" && <McpSeite />}
      </main>
    </div>
  );
}
