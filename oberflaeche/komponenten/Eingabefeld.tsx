// Eingabe unten im Chat. Enter schickt ab, Umschalt+Enter macht eine neue Zeile.
// Solange der Agent an diesem Chat arbeitet oder er eingereiht ist, gibt es statt Senden „Abbrechen“.
import { useState, type KeyboardEvent } from "react";
import type { AufgabenStatus } from "../../gemeinsam/typen.ts";

interface Eigenschaften {
  status: AufgabenStatus;
  /** Platzhalter, wenn der Chat auf eine Freigabe oder Antwort wartet */
  hinweis?: string;
  sende: (text: string) => void;
  brecheAb: () => void;
}

const platzhalter: Partial<Record<AufgabenStatus, string>> = {
  arbeitet: "Der Agent arbeitet …",
  eingereiht: "Eingereiht – kommt gleich dran",
};

export function Eingabefeld({ status, hinweis, sende, brecheAb }: Eigenschaften) {
  const [text, setText] = useState("");
  const beschaeftigt = status === "arbeitet" || status === "eingereiht";

  function abschicken() {
    if (!text.trim() || beschaeftigt) return;
    sende(text.trim());
    setText("");
  }

  function beiTaste(taste: KeyboardEvent<HTMLTextAreaElement>) {
    if (taste.key === "Enter" && !taste.shiftKey) {
      taste.preventDefault();
      abschicken();
    }
  }

  return (
    <div className="eingabe">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={beiTaste}
        placeholder={platzhalter[status] ?? hinweis ?? "Nachricht an den Agenten"}
        rows={3}
      />
      {beschaeftigt ? (
        <button className="knopf" onClick={brecheAb} title={status === "eingereiht" ? "Aus der Warteschlange nehmen" : undefined}>
          Abbrechen
        </button>
      ) : (
        <button className="knopf haupt" onClick={abschicken} disabled={!text.trim()}>
          Senden
        </button>
      )}
    </div>
  );
}
