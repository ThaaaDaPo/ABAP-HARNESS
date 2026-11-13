// Chat-Seite: links die Chats, rechts der gewählte Chat mit Live-Verlauf.
import { useCallback, useEffect, useState } from "react";
import type { Aufgabe, Ereignis } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ChatListe } from "../komponenten/ChatListe.tsx";
import { Eingabefeld } from "../komponenten/Eingabefeld.tsx";
import { Verlauf } from "../komponenten/Verlauf.tsx";
import { useLiveEreignisse } from "../live/useLiveEreignisse.ts";

export function ChatSeite() {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [gewaehlteId, setGewaehlteId] = useState<string | null>(null);
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [laufenderText, setLaufenderText] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeListe = useCallback(() => {
    api.holeAufgaben().then(setAufgaben).catch((e) => setFehler(e.message));
  }, []);

  useEffect(ladeListe, [ladeListe]);

  // Beim Wechsel des Chats den gespeicherten Verlauf laden
  useEffect(() => {
    setEreignisse([]);
    setLaufenderText("");
    if (!gewaehlteId) return;
    api
      .holeAufgabe(gewaehlteId)
      .then(({ aufgabe, ereignisse }) => {
        setEreignisse(ereignisse);
        setArbeitet(aufgabe.status === "arbeitet");
      })
      .catch((e) => setFehler(e.message));
  }, [gewaehlteId]);

  // Live-Ereignisse in die Anzeige übernehmen
  useLiveEreignisse(gewaehlteId, (ereignis) => {
    switch (ereignis.art) {
      case "agent_schreibt":
        setLaufenderText((bisher) => bisher + ereignis.textTeil);
        break;
      case "status":
        setArbeitet(ereignis.status === "arbeitet");
        if (ereignis.status === "bereit") setLaufenderText("");
        ladeListe(); // Titel und Status in der Liste aktualisieren
        break;
      default:
        // Eine fertige Nachricht ersetzt den Text, der bis dahin live mitlief
        if (ereignis.art === "agent_nachricht") setLaufenderText("");
        setEreignisse((bisher) => [...bisher, ereignis]);
    }
  });

  async function neuerChat() {
    try {
      const aufgabe = await api.legeAufgabeAn();
      ladeListe();
      setGewaehlteId(aufgabe.id);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function sende(text: string) {
    if (!gewaehlteId) return;
    setFehler(null);
    try {
      await api.sendeNachricht(gewaehlteId, text);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  return (
    <div className="chat-seite">
      <ChatListe aufgaben={aufgaben} gewaehlteId={gewaehlteId} waehle={setGewaehlteId} neu={neuerChat} />

      <section className="chat">
        {gewaehlteId ? (
          <>
            <Verlauf ereignisse={ereignisse} laufenderText={laufenderText} arbeitet={arbeitet} />
            {fehler && <div className="fehlerleiste">{fehler}</div>}
            <Eingabefeld arbeitet={arbeitet} sende={sende} brecheAb={() => api.brecheAb(gewaehlteId)} />
          </>
        ) : (
          <div className="leer mitte">Wähle links einen Chat oder lege einen neuen an.</div>
        )}
      </section>
    </div>
  );
}
