// Hört auf die Live-Hinweise „Aufgaben oder Postfach haben sich geändert“.
// So bleiben Chat-Liste, Postfach und der Zähler in der Navigation aktuell, auch wenn der Agent
// gerade in einem anderen Chat arbeitet.
import { useEffect, useRef } from "react";
import type { UebersichtsEreignis } from "../../gemeinsam/typen.ts";
import { uebersichtAdresse } from "../api.ts";

export function useUebersicht(bereich: UebersichtsEreignis["bereich"], beiAenderung: () => void) {
  const beiAenderungRef = useRef(beiAenderung);
  beiAenderungRef.current = beiAenderung;

  useEffect(() => {
    const quelle = new EventSource(uebersichtAdresse);
    quelle.onmessage = (nachricht) => {
      const ereignis: UebersichtsEreignis = JSON.parse(nachricht.data);
      if (ereignis.bereich === bereich) beiAenderungRef.current();
    };
    // Nach einem Verbindungsabbruch (z. B. Server neu gestartet) einmal neu laden
    quelle.onopen = () => beiAenderungRef.current();
    return () => quelle.close();
  }, [bereich]);
}
