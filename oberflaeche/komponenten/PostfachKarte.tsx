// Ein Eintrag im Postfach: was der Agent vorschlägt, fragt oder gemeldet hat, und die passenden Aktionen.
// Unter den Knöpfen steht jeweils, was passiert – damit klar ist, wann die KI wieder ins Spiel kommt.
import { useState } from "react";
import type { PostfachEintrag, PostfachStatus } from "../../gemeinsam/typen.ts";

export interface PostfachAktionen {
  freigeben: () => void;
  verwerfen: () => void;
  zurKenntnis: () => void;
  antworten: (text: string) => void;
  /** Nur auf der Postfach-Seite */
  zeigeChat?: () => void;
}

interface Eigenschaften {
  eintrag: PostfachEintrag;
  aktionen: PostfachAktionen;
  /** Eine Aktion für diesen Eintrag läuft gerade (Freigeben kann dauern) */
  beschaeftigt: boolean;
  /** Im Chat: ohne Verweis auf den Chat, und Antworten geht über das normale Eingabefeld */
  imChat?: boolean;
}

const statusTexte: Record<PostfachStatus, string> = {
  offen: "offen",
  fehlgeschlagen: "Ausführung fehlgeschlagen",
  freigegeben: "freigegeben",
  verworfen: "verworfen",
  aenderung_angefordert: "Änderung angefordert",
  beantwortet: "beantwortet",
  zur_kenntnis: "zur Kenntnis genommen",
};

function artText(eintrag: PostfachEintrag): string {
  if (eintrag.art === "rueckfrage") return "Rückfrage";
  if (eintrag.art === "meldung") return "Meldung";
  return eintrag.weiterNachFreigabe ? "Freigabe zum Weitermachen" : "Freigabe zum Abschluss";
}

export function PostfachKarte({ eintrag, aktionen, beschaeftigt, imChat = false }: Eigenschaften) {
  const offen = eintrag.status === "offen" || eintrag.status === "fehlgeschlagen";
  const [antwortOffen, setAntwortOffen] = useState(false);
  const [text, setText] = useState("");

  function schickeAntwort() {
    if (!text.trim()) return;
    aktionen.antworten(text.trim());
    setText("");
    setAntwortOffen(false);
  }

  function verwirf() {
    if (confirm(`Eintrag #${eintrag.nr} verwerfen? Die Aufgabe „${eintrag.aufgabeTitel}“ wird damit abgebrochen.`)) aktionen.verwerfen();
  }

  // Bei offenen Freigaben und Rückfragen ist das Antwortfeld immer da, sonst auf Knopfdruck.
  const antwortImmerDa = offen && eintrag.art !== "meldung";
  const antwortKnopf = eintrag.art === "freigabe" && offen ? "Änderungen anfordern" : "Antworten";

  return (
    <article className={`postfach-karte${offen ? " offen" : ""}${imChat ? " im-chat" : ""}`}>
      <header className="karten-kopf">
        <span className="karten-nr">{eintrag.art === "freigabe" ? "Vorschlag " : ""}#{eintrag.nr}</span>
        <span className={`karten-art ${eintrag.art}`}>{artText(eintrag)}</span>
        <span className={`karten-status ${eintrag.status}`}>{statusTexte[eintrag.status]}</span>
        <span className="karten-zeit">{new Date(eintrag.erstelltAm).toLocaleString("de-DE")}</span>
      </header>

      {aktionen.zeigeChat && (
        <button className="karten-chat" onClick={aktionen.zeigeChat} title="Zum Chat">
          Chat: {eintrag.aufgabeTitel}
        </button>
      )}

      {eintrag.art === "rueckfrage" ? (
        <p className="karten-frage">{String((eintrag.argumente as { frage?: string })?.frage ?? "")}</p>
      ) : (
        <>
          <div className="tool-ueberschrift">
            Tool <span className="tool-name">{`${eintrag.server}-${eintrag.tool}`}</span>
          </div>
          <pre>{JSON.stringify(eintrag.argumente, null, 2)}</pre>
        </>
      )}

      {eintrag.ergebnis && (
        <>
          <div className="tool-ueberschrift">{eintrag.status === "fehlgeschlagen" ? "Fehler bei der Ausführung" : "Ergebnis"}</div>
          <pre>{eintrag.ergebnis}</pre>
        </>
      )}
      {eintrag.antwort && (
        <>
          <div className="tool-ueberschrift">Deine Antwort</div>
          <p className="karten-antwort">{eintrag.antwort}</p>
        </>
      )}

      {/* Aktionen */}
      {offen && eintrag.art === "freigabe" && (
        <>
          <div className="knopfreihe">
            <button className="knopf haupt" onClick={aktionen.freigeben} disabled={beschaeftigt}>
              {beschaeftigt ? "Wird ausgeführt …" : eintrag.status === "fehlgeschlagen" ? "Erneut freigeben" : "Freigeben"}
            </button>
            <button className="knopf" onClick={verwirf} disabled={beschaeftigt}>
              Verwerfen
            </button>
          </div>
          <p className="hinweis">
            {eintrag.weiterNachFreigabe
              ? "Freigeben führt den Aufruf aus; danach macht der Agent mit dem Ergebnis weiter, sobald er frei ist."
              : "Freigeben führt den Aufruf aus, ohne KI – danach ist die Aufgabe erledigt."}{" "}
            Verwerfen bricht die Aufgabe ab. Bei Änderungswünschen überarbeitet der Agent den Vorschlag.
          </p>
        </>
      )}
      {offen && eintrag.art === "rueckfrage" && (
        <div className="knopfreihe">
          <button className="knopf" onClick={verwirf} disabled={beschaeftigt}>
            Verwerfen (Aufgabe abbrechen)
          </button>
        </div>
      )}
      {offen && eintrag.art === "meldung" && (
        <div className="knopfreihe">
          <button className="knopf" onClick={aktionen.zurKenntnis} disabled={beschaeftigt}>
            Zur Kenntnis genommen
          </button>
          <button className="knopf" onClick={() => setAntwortOffen(true)} disabled={beschaeftigt}>
            Antworten
          </button>
        </div>
      )}
      {!offen && !antwortOffen && !imChat && (
        <div className="knopfreihe">
          <button className="knopf" onClick={() => setAntwortOffen(true)}>
            Antworten
          </button>
        </div>
      )}

      {(antwortImmerDa || antwortOffen) && (
        <div className="karten-eingabe">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={eintrag.art === "freigabe" && offen ? "Was soll der Agent ändern?" : "Antwort an den Agenten"}
          />
          <button className="knopf" onClick={schickeAntwort} disabled={!text.trim() || beschaeftigt}>
            {antwortKnopf}
          </button>
        </div>
      )}
    </article>
  );
}
