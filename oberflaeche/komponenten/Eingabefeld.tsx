// Eingabe unten im Chat. Enter schickt ab, Umschalt+Enter macht eine neue Zeile.
import { useState, type KeyboardEvent } from "react";

interface Eigenschaften {
  arbeitet: boolean;
  sende: (text: string) => void;
  brecheAb: () => void;
}

export function Eingabefeld({ arbeitet, sende, brecheAb }: Eigenschaften) {
  const [text, setText] = useState("");

  function abschicken() {
    if (!text.trim() || arbeitet) return;
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
        placeholder={arbeitet ? "Der Agent arbeitet …" : "Nachricht an den Agenten"}
        rows={3}
      />
      {arbeitet ? (
        <button className="knopf" onClick={brecheAb}>
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
