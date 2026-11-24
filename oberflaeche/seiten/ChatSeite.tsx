// Chat-Seite: links die Chats, rechts der gewählte Chat mit Live-Verlauf.
// Vorschläge gibt David hier direkt frei, Rückfragen beantwortet er im Eingabefeld (E-52).
import { useCallback, useEffect, useState } from "react";
import type { Aufgabe, AufgabenStatus, Ereignis, ModellInfo, PostfachEintrag, ModellWahl as Wahl } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ChatListe } from "../komponenten/ChatListe.tsx";
import { Eingabefeld } from "../komponenten/Eingabefeld.tsx";
import { ModellWahl } from "../komponenten/ModellWahl.tsx";
import type { PostfachAktionen } from "../komponenten/PostfachKarte.tsx";
import { Verlauf } from "../komponenten/Verlauf.tsx";
import { useLiveEreignisse } from "../live/useLiveEreignisse.ts";
import { useUebersicht } from "../live/useUebersicht.ts";

interface Eigenschaften {
  gewaehlteId: string | null;
  waehle: (id: string | null) => void;
}

export function ChatSeite({ gewaehlteId, waehle }: Eigenschaften) {
  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [ereignisse, setEreignisse] = useState<Ereignis[]>([]);
  const [laufenderText, setLaufenderText] = useState("");
  const [status, setStatus] = useState<AufgabenStatus>("bereit");
  const [fehler, setFehler] = useState<string | null>(null);
  const [modelle, setModelle] = useState<ModellInfo[]>([]);
  /** Vorschläge und Rückfragen des gewählten Chats */
  const [eintraege, setEintraege] = useState<PostfachEintrag[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState<number | null>(null);

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
    setEintraege([]);
    setLaufenderText("");
    setFehler(null);
    if (!gewaehlteId) return;
    api
      .holeAufgabe(gewaehlteId)
      .then(({ aufgabe, ereignisse, postfach }) => {
        setEreignisse(ereignisse);
        setEintraege(postfach);
        setStatus(aufgabe.status);
      })
      .catch((e) => setFehler(e.message));
  }, [gewaehlteId]);

  const ladeEintraege = useCallback(() => {
    if (!gewaehlteId) return;
    api.holePostfachDerAufgabe(gewaehlteId).then(setEintraege).catch((e) => setFehler(e.message));
  }, [gewaehlteId]);

  // Live-Ereignisse in die Anzeige übernehmen
  useLiveEreignisse(gewaehlteId, (ereignis) => {
    // Neue Vorschläge, Freigaben und Statuswechsel (z. B. Rückfrage beantwortet) ändern die Karten
    if (ereignis.art === "postfach" || ereignis.art === "postfach_aktion" || ereignis.art === "status") ladeEintraege();
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

  /** Aktion an einem Vorschlag im Chat; danach zeigen die Karten den neuen Stand. */
  async function handle(nr: number, aktion: () => Promise<unknown>) {
    setBeschaeftigt(nr);
    setFehler(null);
    try {
      await aktion();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(null);
      ladeEintraege();
    }
  }

  const aktionen = (eintrag: PostfachEintrag): PostfachAktionen => ({
    freigeben: () => handle(eintrag.nr, () => api.freigeben(eintrag.nr)),
    verwerfen: () => handle(eintrag.nr, () => api.verwerfen(eintrag.nr)),
    zurKenntnis: () => handle(eintrag.nr, () => api.zurKenntnis(eintrag.nr)),
    antworten: (text) => handle(eintrag.nr, () => api.antworten(eintrag.nr, text)),
  });

  const aktuell = aufgaben.find((a) => a.id === gewaehlteId) ?? null;
  const offen = (art: PostfachEintrag["art"]) => eintraege.some((e) => e.art === art && (e.status === "offen" || e.status === "fehlgeschlagen"));
  const hinweisEingabe = offen("rueckfrage")
    ? "Deine Antwort auf die Rückfrage"
    : offen("freigabe")
      ? "Vorschlag oben freigeben oder verwerfen – oder schreib dem Agenten"
      : undefined;

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
            <Verlauf
              ereignisse={ereignisse}
              laufenderText={laufenderText}
              status={status}
              eintraege={eintraege}
              aktionen={aktionen}
              beschaeftigt={beschaeftigt}
            />
            {fehler && <div className="fehlerleiste">{fehler}</div>}
            <Eingabefeld status={status} hinweis={hinweisEingabe} sende={sende} brecheAb={() => api.brecheAb(gewaehlteId)} />
          </>
        ) : (
          <div className="leer mitte">Wähle links einen Chat oder lege einen neuen an.</div>
        )}
      </section>
    </div>
  );
}
