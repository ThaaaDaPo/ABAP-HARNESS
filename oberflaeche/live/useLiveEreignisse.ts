// Hört auf die Live-Ereignisse einer Aufgabe (Server-Sent Events).
// Der Browser baut die Verbindung bei Abbruch selbst wieder auf.
import { useEffect, useRef } from "react";
import type { Ereignis } from "../../gemeinsam/typen.ts";
import { liveAdresse } from "../api.ts";

export function useLiveEreignisse(aufgabeId: string | null, beiEreignis: (ereignis: Ereignis) => void) {
  // Immer die aktuelle Funktion aufrufen, ohne die Verbindung neu aufzubauen
  const beiEreignisRef = useRef(beiEreignis);
  beiEreignisRef.current = beiEreignis;

  useEffect(() => {
    if (!aufgabeId) return;
    const quelle = new EventSource(liveAdresse(aufgabeId));
    quelle.onmessage = (nachricht) => beiEreignisRef.current(JSON.parse(nachricht.data));
    return () => quelle.close();
  }, [aufgabeId]);
}
