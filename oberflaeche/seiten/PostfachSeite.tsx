// Postfach-Seite: Freigaben, Rückfragen und Meldungen aus Workflows, die ohne David laufen (E-52),
// offene zuerst. Freigaben aus Chats erledigt David im Chat. Bis es Workflows gibt (Phase 4), ist die
// Seite in der Navigation ausgegraut.
import { useCallback, useEffect, useState } from "react";
import type { PostfachEintrag } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { PostfachKarte } from "../komponenten/PostfachKarte.tsx";
import { useUebersicht } from "../live/useUebersicht.ts";

export function PostfachSeite({ zeigeChat }: { zeigeChat: (aufgabeId: string) => void }) {
  const [eintraege, setEintraege] = useState<PostfachEintrag[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState<number | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const lade = useCallback(() => {
    api.holePostfach().then(setEintraege).catch((e) => setFehler(e.message));
  }, []);
  useEffect(lade, [lade]);
  useUebersicht("postfach", lade);

  /** Führt eine Aktion aus; der Server antwortet mit der aktuellen Liste. */
  async function handle(nr: number, aktion: () => Promise<PostfachEintrag[]>) {
    setBeschaeftigt(nr);
    setFehler(null);
    try {
      setEintraege(await aktion());
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(null);
    }
  }

  const anzahlOffen = eintraege.filter((e) => e.status === "offen" || e.status === "fehlgeschlagen").length;

  return (
    <div className="detail postfach-seite">
      <h2>Postfach</h2>
      <p className="hinweis">
        {anzahlOffen === 0 ? "Nichts offen." : `${anzahlOffen} offen.`} Freigaben, Rückfragen und Meldungen aus Workflows.
        Was in einem Chat entsteht, erledigst du direkt im Chat.
      </p>
      {fehler && <div className="fehlerleiste">{fehler}</div>}
      {eintraege.length === 0 && <p className="leer">Noch keine Einträge.</p>}

      {eintraege.map((eintrag) => (
        <PostfachKarte
          key={eintrag.nr}
          eintrag={eintrag}
          beschaeftigt={beschaeftigt === eintrag.nr}
          aktionen={{
            freigeben: () => handle(eintrag.nr, () => api.freigeben(eintrag.nr)),
            verwerfen: () => handle(eintrag.nr, () => api.verwerfen(eintrag.nr)),
            zurKenntnis: () => handle(eintrag.nr, () => api.zurKenntnis(eintrag.nr)),
            antworten: (text) => handle(eintrag.nr, () => api.antworten(eintrag.nr, text)),
            zeigeChat: () => zeigeChat(eintrag.aufgabeId),
          }}
        />
      ))}
    </div>
  );
}
