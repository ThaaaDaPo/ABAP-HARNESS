// Liste aller Chats mit Knopf für einen neuen.
import type { Aufgabe } from "../../gemeinsam/typen.ts";

interface Eigenschaften {
  aufgaben: Aufgabe[];
  gewaehlteId: string | null;
  waehle: (id: string) => void;
  neu: () => void;
}

export function ChatListe({ aufgaben, gewaehlteId, waehle, neu }: Eigenschaften) {
  return (
    <aside className="chat-liste">
      <button className="knopf haupt" onClick={neu}>
        Neuer Chat
      </button>

      {aufgaben.length === 0 && <p className="leer">Noch keine Chats.</p>}

      {aufgaben.map((aufgabe) => (
        <button
          key={aufgabe.id}
          className={aufgabe.id === gewaehlteId ? "chat-eintrag aktiv" : "chat-eintrag"}
          onClick={() => waehle(aufgabe.id)}
        >
          <span className="chat-titel">{aufgabe.titel}</span>
          {aufgabe.status === "arbeitet" && <span className="arbeitet-punkt" title="Agent arbeitet" />}
        </button>
      ))}
    </aside>
  );
}
