// Ein Gespräch mit dem Voice Agent im Browser: Mikrofon an den Server, Live-Ereignisse zurück,
// Sätze abspielen, bei Bedarf sofort verstummen. Die Seite zeigt nur an, was hier entsteht.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GespraechsZustand, SprachEreignis } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { starteMikrofon, type Mikrofon } from "./mikrofon.ts";
import { Wiedergabe } from "./wiedergabe.ts";

/** „spricht“ kommt vom Browser selbst (er spielt ab); „aus“ = kein Gespräch */
export type AnzeigeZustand = "aus" | "startet" | GespraechsZustand | "spricht";

export interface Beitrag {
  rolle: "du" | "agent";
  runde: number;
  text: string;
  /** Messwerte oder Hinweis, klein darunter */
  info: string;
}

/** Nach dem Abspielen kurz weghören: Der Nachhall aus dem Lautsprecher wäre sonst eine „Äußerung“. */
const nachhallMs = 300;

export function useGespraech() {
  const [zustand, setZustand] = useState<AnzeigeZustand>("aus");
  const [beitraege, setBeitraege] = useState<Beitrag[]>([]);
  const [pegel, setPegel] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [modell, setModell] = useState<string | null>(null);
  const [stumm, setStummState] = useState(false);
  /** Darf David den Agenten durch Sprechen unterbrechen? Ohne Headset hört das Mikrofon die Stimme mit. */
  const [unterbrechenErlaubt, setUnterbrechenErlaubt] = useState(false);

  const id = useRef<string | null>(null);
  const quelle = useRef<EventSource | null>(null);
  const mikrofon = useRef<Mikrofon | null>(null);
  const wiedergabe = useRef<Wiedergabe | null>(null);
  const serverZustand = useRef<GespraechsZustand>("hoert");
  const unterbrochenBis = useRef(0);
  const stilleSeit = useRef(0);
  const einstellungen = useRef({ stumm, unterbrechenErlaubt });
  einstellungen.current = { stumm, unterbrechenErlaubt };
  const puffer = useRef<Float32Array[]>([]);
  const sendet = useRef(false);

  const aendereBeitrag = useCallback((rolle: Beitrag["rolle"], runde: number, aendern: (b: Beitrag) => Beitrag) => {
    setBeitraege((liste) => {
      const stelle = liste.findIndex((b) => b.rolle === rolle && b.runde === runde);
      if (stelle < 0) return [...liste, aendern({ rolle, runde, text: "", info: "" })];
      return liste.map((b, i) => (i === stelle ? aendern(b) : b));
    });
  }, []);

  const verarbeite = useCallback(
    (ereignis: SprachEreignis) => {
      const alt = "runde" in ereignis && ereignis.runde <= unterbrochenBis.current;
      switch (ereignis.art) {
        case "zustand":
          serverZustand.current = ereignis.zustand;
          setZustand(wiedergabe.current?.spielt() ? "spricht" : ereignis.zustand);
          break;
        case "nutzer_spricht":
          if (wiedergabe.current?.spielt()) wiedergabe.current.verstumme();
          break;
        case "erkannt":
          if (ereignis.text) {
            const info = ereignis.dauerMs ? `erkannt in ${ereignis.dauerMs} ms` : "getippt";
            aendereBeitrag("du", ereignis.runde, (b) => ({ ...b, text: ereignis.text, info }));
          }
          break;
        case "antwort_teil":
          if (!alt) aendereBeitrag("agent", ereignis.runde, (b) => ({ ...b, text: b.text + ereignis.textTeil }));
          break;
        case "audio":
          if (!alt) {
            wiedergabe.current?.spieleAb(ereignis.wav);
            setZustand("spricht");
          }
          break;
        case "antwort_fertig":
          if (!alt) aendereBeitrag("agent", ereignis.runde, (b) => ({ ...b, text: ereignis.text }));
          break;
        case "zeiten": {
          const teile = [
            ereignis.ersterTextMs !== null && `erster Text nach ${ereignis.ersterTextMs} ms`,
            ereignis.ersterTonMs !== null && `erster Ton nach ${ereignis.ersterTonMs} ms`,
          ].filter(Boolean);
          aendereBeitrag("agent", ereignis.runde, (b) => ({ ...b, info: teile.join(" · ") }));
          break;
        }
        case "unterbrochen":
          unterbrochenBis.current = Math.max(unterbrochenBis.current, ereignis.runde);
          wiedergabe.current?.verstumme();
          setBeitraege((liste) =>
            liste.map((b) => (b.rolle === "agent" && b.runde === ereignis.runde ? { ...b, info: "unterbrochen" } : b)),
          );
          break;
        case "modell":
          setModell(ereignis.modell);
          break;
        case "fehler":
          setFehler(ereignis.meldung);
          break;
      }
    },
    [aendereBeitrag],
  );

  /** Schickt, was sich angesammelt hat – immer nur eine Anfrage zur Zeit, damit die Reihenfolge stimmt. */
  const sendeGesammelt = useCallback(async () => {
    if (sendet.current) return;
    sendet.current = true;
    try {
      while (puffer.current.length > 0 && id.current) {
        const stuecke = puffer.current.splice(0);
        const alles = new Float32Array(stuecke.reduce((summe, s) => summe + s.length, 0));
        let stelle = 0;
        for (const stueck of stuecke) {
          alles.set(stueck, stelle);
          stelle += stueck.length;
        }
        await api.sendeAudio(id.current, alles);
      }
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      sendet.current = false;
    }
  }, []);

  const beiAudio = useCallback(
    (samples: Float32Array) => {
      const { stumm, unterbrechenErlaubt } = einstellungen.current;
      if (stumm) return;
      // Ohne Unterbrechen: Während der Agent spricht (und kurz danach), hört das Mikrofon nicht zu.
      const spielt = wiedergabe.current?.spielt() || Date.now() - stilleSeit.current < nachhallMs;
      if (spielt && !unterbrechenErlaubt) return;
      puffer.current.push(samples);
      void sendeGesammelt();
    },
    [sendeGesammelt],
  );

  const beende = useCallback(() => {
    mikrofon.current?.stoppe();
    mikrofon.current = null;
    quelle.current?.close();
    quelle.current = null;
    wiedergabe.current?.schliesse();
    wiedergabe.current = null;
    if (id.current) void api.beendeGespraech(id.current).catch(() => {});
    id.current = null;
    puffer.current = [];
    setPegel(0);
    setZustand("aus");
  }, []);

  const starte = useCallback(
    async (tempo: number) => {
      setFehler(null);
      setBeitraege([]);
      setModell(null);
      unterbrochenBis.current = 0;
      setZustand("startet");
      // Im Klick anlegen: Nur dann darf die Seite später Ton abspielen.
      wiedergabe.current = new Wiedergabe(() => {
        stilleSeit.current = Date.now();
        setZustand(serverZustand.current);
      });
      wiedergabe.current.freischalten();
      try {
        const neu = await api.starteGespraech();
        id.current = neu.id;
        if (tempo !== 1) await api.setzeSprechTempo(neu.id, tempo);
        const live = new EventSource(api.gespraechLiveAdresse(neu.id));
        live.onmessage = (nachricht) => verarbeite(JSON.parse(nachricht.data));
        live.onerror = () => {
          // Der Server beendet das Gespräch, wenn die Verbindung abreißt – also hier auch.
          setFehler("Die Verbindung zum Gespräch ist abgerissen. Bitte neu starten.");
          beende();
        };
        quelle.current = live;
        mikrofon.current = await starteMikrofon(beiAudio, setPegel);
        serverZustand.current = "hoert";
        setZustand("hoert");
      } catch (e) {
        setFehler((e as Error).message);
        beende();
      }
    },
    [beende, beiAudio, verarbeite],
  );

  const unterbreche = useCallback(() => {
    wiedergabe.current?.verstumme();
    if (id.current) void api.unterbrecheGespraech(id.current).catch((e: Error) => setFehler(e.message));
  }, []);

  const schreibe = useCallback((text: string) => {
    if (!id.current) return;
    wiedergabe.current?.verstumme();
    void api.sendeGespraechsText(id.current, text).catch((e: Error) => setFehler(e.message));
  }, []);

  const setzeStumm = useCallback((an: boolean) => {
    setStummState(an);
    if (an) {
      setPegel(0);
      if (id.current) void api.schalteGespraechStumm(id.current).catch(() => {});
    }
  }, []);

  const setzeTempo = useCallback((tempo: number) => {
    if (id.current) void api.setzeSprechTempo(id.current, tempo).catch((e: Error) => setFehler(e.message));
  }, []);

  // Seite verlassen: Gespräch beenden, Mikrofon aus
  useEffect(() => beende, [beende]);

  return {
    zustand,
    beitraege,
    pegel: stumm ? 0 : pegel,
    fehler,
    modell,
    stumm,
    unterbrechenErlaubt,
    starte,
    beende,
    unterbreche,
    schreibe,
    setzeStumm,
    setzeTempo,
    setUnterbrechenErlaubt,
  };
}
