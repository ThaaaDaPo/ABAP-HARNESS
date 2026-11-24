// Chat-Seite: links die Chats, rechts der gewählte Chat mit Live-Verlauf.
import { useCallback, useEffect, useState } from "react";
import type { Aufgabe, AufgabenStatus, Ereignis, ModellInfo, ModellWahl as Wahl } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ChatListe } from "../komponenten/ChatListe.tsx";
import { Eingabefeld } from "../komponenten/Eingabefeld.tsx";
import { ModellWahl } from "../komponenten/ModellWahl.tsx";
import { Verlauf } from "../komponenten/Verlauf.tsx";
import { useLiveEreignisse } from "../live/useLiveEreignisse.ts";
import { useUebersicht } from "../live/useUebersicht.ts";

interface Eigenschaften {
  gewaehlteId: string | null;
  waehle: (id: string | null) => void;
  zeigePostfach: () => void;
}

export function ChatSeite({ gewaehlteId, waehle, zeigePostfach }: Eigenschaften) {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [laufenderText, setLaufenderText] = useState("");
  const [status, setStatus] = useState<AufgabenStatus>("bereit");
  const [fehler, setFehler] = useState<string | null>(null);
  const [modelle, setModelle] = useState<ModellInfo[]>([]);

  // Die Modellliste ändert sich nicht während der Sitzung; einmal laden reicht.
  useEffect(() => {
    api.holeModelle().then(setModelle).catch((e) => setFehler(`Modelle: ${e.message}`));
  }, []);

  const ladeListe = useCallback(() => {
    api.holeAufgaben().then(setAufgaben).catch((e) => setFehler(e.message));
  }, []);

  useEffect(ladeListe, [ladeListe]);
  // Titel und Status aller Chats aktuell halten – der Agent arbeitet auch in anderen Chats
  useUebersicht("aufgaben", ladeListe);

  // Beim Wechsel des Chats den gespeicherten Verlauf laden
  useEffect(() => {
    setEreignisse([]);
    setLaufenderText("");
    setFehler(null);
    if (!gewaehlteId) return;
    api
      .holeAufgabe(gewaehlteId)
      .then(({ aufgabe, ereignisse }) => {
        setEreignisse(ereignisse);
        setStatus(aufgabe.status);
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
        setStatus(ereignis.status);
        if (ereignis.status !== "arbeitet") setLaufenderText("");
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
      waehle(aufgabe.id);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function loesche(aufgabe: Aufgabe) {
    // Leere Chats ohne Rückfrage, alle anderen mit
    const leer = aufgabe.id === gewaehlteId ? ereignisse.length === 0 : false;
    if (!leer && !confirm(`Chat „${aufgabe.titel}“ löschen? Verlauf und offene Postfach-Einträge dieses Chats gehen verloren.`)) return;
    try {
      await api.loescheAufgabe(aufgabe.id);
      if (aufgabe.id === gewaehlteId) waehle(null);
      ladeListe();
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  async function aendereModell(wahl: Wahl) {
    if (!gewaehlteId) return;
    setFehler(null);
    try {
      const geaendert = await api.setzeModellWahl(gewaehlteId, wahl);
      setAufgaben((liste) => liste.map((a) => (a.id === geaendert.id ? geaendert : a)));
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  const aktuell = aufgaben.find((a) => a.id === gewaehlteId) ?? null;

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
      <ChatListe aufgaben={aufgaben} gewaehlteId={gewaehlteId} waehle={waehle} neu={neuerChat} loesche={loesche} />

      <section className="chat">
        {gewaehlteId ? (
          <>
            {aktuell && (
              <ModellWahl modelle={modelle} wahl={aktuell.modellWahl} aendere={aendereModell} agentArbeitet={status === "arbeitet"} />
            )}
            <Verlauf ereignisse={ereignisse} laufenderText={laufenderText} status={status} zeigePostfach={zeigePostfach} />
            {fehler && <div className="fehlerleiste">{fehler}</div>}
            <Eingabefeld status={status} sende={sende} brecheAb={() => api.brecheAb(gewaehlteId)} />
          </>
        ) : (
          <div className="leer mitte">Wähle links einen Chat oder lege einen neuen an.</div>
        )}
      </section>
    </div>
  );
}
