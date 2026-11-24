// Liste aller Chats mit Knopf für einen neuen. Rechts am Eintrag steht, wo der Chat gerade steht,
// und beim Überfahren erscheint ein Knopf zum Löschen.
import type { Aufgabe, AufgabenStatus } from "../../gemeinsam/typen.ts";

interface Eigenschaften {
  aufgaben: Aufgabe[];
  gewaehlteId: string | null;
  waehle: (id: string) => void;
  neu: () => void;
  loesche: (aufgabe: Aufgabe) => void;
}

/** Kurzer Text für alles außer "bereit" (das ist der Normalfall und bekommt keine Marke). */
const marken: Partial<Record<AufgabenStatus, string>> = {
  eingereiht: "eingereiht",
  wartet: "wartet auf dich",
  erledigt: "erledigt",
  abgebrochen: "abgebrochen",
};

export function ChatListe({ aufgaben, gewaehlteId, waehle, neu, loesche }: Eigenschaften) {
  return (
    <aside className="chat-liste">
      <button className="knopf haupt" onClick={neu}>
        Neuer Chat
      </button>

      {aufgaben.length === 0 && <p className="leer">Noch keine Chats.</p>}

      {aufgaben.map((aufgabe) => (
        <div key={aufgabe.id} className={aufgabe.id === gewaehlteId ? "chat-eintrag aktiv" : "chat-eintrag"}>
          <button className="chat-auswahl" onClick={() => waehle(aufgabe.id)}>
            <span className="chat-titel">{aufgabe.titel}</span>
            {aufgabe.status === "arbeitet" && <span className="arbeitet-punkt" title="Agent arbeitet" />}
            {marken[aufgabe.status] && <span className={`status-marke ${aufgabe.status}`}>{marken[aufgabe.status]}</span>}
          </button>
          {aufgabe.status !== "arbeitet" && (
            <button className="chat-loeschen" onClick={() => loesche(aufgabe)} title="Chat löschen" aria-label="Chat löschen">
              ×
            </button>
          )}
        </div>
      ))}
    </aside>
  );
}
