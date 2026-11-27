// Chat-Seite: links die Chats, rechts der gewählte Chat mit Live-Verlauf.
// Über dem Chat: Agent (im laufenden Chat wechselbar, E-56), Modell und was der Chat bisher verbraucht hat.
// Vorschläge gibt David hier direkt frei, Rückfragen beantwortet er im Eingabefeld (E-52).
// Jeder Chat läuft für sich – auch während der Agent in einem anderen Chat arbeitet (E-57).
import { useCallback, useEffect, useState } from "react";
import type {
  Agent,
  Aufgabe,
  AufgabenStatus,
  Ereignis,
  ModellInfo,
  PostfachEintrag,
  VerbrauchSumme,
  ModellWahl as Wahl,
} from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ChatListe } from "../komponenten/ChatListe.tsx";
import { Eingabefeld } from "../komponenten/Eingabefeld.tsx";
import { ModellWahl } from "../komponenten/ModellWahl.tsx";
import type { PostfachAktionen } from "../komponenten/PostfachKarte.tsx";
import { Verlauf } from "../komponenten/Verlauf.tsx";
import { useLiveEreignisse } from "../live/useLiveEreignisse.ts";
import { useUebersicht } from "../live/useUebersicht.ts";
import { tokenText, creditText } from "../verbrauch-text.ts";

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
  const [agenten, setAgenten] = useState<Agent[]>([]);
  /** Was der gewählte Chat bisher verbraucht hat */
  const [verbrauch, setVerbrauch] = useState<VerbrauchSumme | null>(null);

  // Modelle und Agenten ändern sich nicht, während die Seite offen ist; einmal laden reicht.
  useEffect(() => {
    api.holeModelle().then(setModelle).catch((e) => setFehler(`Modelle: ${e.message}`));
    api.holeAgenten().then(setAgenten).catch((e) => setFehler(`Agenten: ${e.message}`));
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
    setVerbrauch(null);
    if (!gewaehlteId) return;
    api
      .holeAufgabe(gewaehlteId)
      .then(({ aufgabe, ereignisse, postfach, verbrauch }) => {
        setEreignisse(ereignisse);
        setEintraege(postfach);
        setStatus(aufgabe.status);
        setVerbrauch(verbrauch);
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
    // Ein Lauf ist fertig: Summe des Chats neu laden
    if (ereignis.art === "lauf_verbrauch" && gewaehlteId) api.holeVerbrauchDesChats(gewaehlteId).then(setVerbrauch).catch(() => {});
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
      // Der neue Chat bekommt den Agenten des gerade offenen Chats – meist will man mit ihm weitermachen.
      const aufgabe = await api.legeAufgabeAn(aktuell?.agentId);
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

  async function wechsleAgent(agentId: string) {
    if (!gewaehlteId) return;
    setFehler(null);
    try {
      const geaendert = await api.setzeAgentDesChats(gewaehlteId, agentId);
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
      ? "Änderungswunsch zum Vorschlag – oder oben freigeben bzw. verwerfen"
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
              <div className="modell-wahl">
                <label>
                  Agent
                  <select value={aktuell.agentId} onChange={(e) => wechsleAgent(e.target.value)}>
                    {agenten.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <ModellWahl
                  modelle={modelle}
                  wahl={aktuell.modellWahl}
                  aendere={aendereModell}
                  agentArbeitet={status === "arbeitet"}
                  standardText={standardModellText(agenten.find((a) => a.id === aktuell.agentId), modelle)}
                />
                {verbrauch && verbrauch.aufrufe > 0 && (
                  <span className="modell-info chat-verbrauch" title={`${verbrauch.aufrufe} Modellaufrufe in diesem Chat`}>
                    Chat bisher: {tokenText(verbrauch.eingabeTokens + verbrauch.ausgabeTokens)} Tokens · {creditText(verbrauch)}
                  </span>
                )}
              </div>
            )}
            <Verlauf
              aufgabeId={gewaehlteId}
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

/** „Standard des Agenten (Modellname)“ – damit klar ist, welches Modell ohne eigene Wahl gilt. */
function standardModellText(agent: Agent | undefined, modelle: ModellInfo[]): string {
  const id = agent?.modellWahl.modell;
  if (!id) return "Standard des Agenten (automatisch)";
  return `Standard des Agenten (${modelle.find((m) => m.id === id)?.name ?? id})`;
}
