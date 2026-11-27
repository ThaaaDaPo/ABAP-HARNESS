// Was ein Speichern oder Anlegen des ADT-MCP im System geändert hat, direkt im Chat (E-31):
// Vergleich nebeneinander je Quelltext-Teil und der Knopf „Rückgängig“ (bzw. „Objekt löschen“ bei
// einem neu angelegten Objekt). Rückgängig läuft ohne KI; der Agent erfährt es mit der nächsten Nachricht.
import { useEffect, useState } from "react";
import type { AdtAenderung } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { Nebeneinander } from "./Nebeneinander.tsx";

interface Eigenschaften {
  id: string;
  aufgabeId: string;
  /** Der Agent arbeitet gerade in diesem Chat – dann nicht gleichzeitig zurückschreiben */
  gesperrt: boolean;
  /** Im Verlauf steht, dass die Änderung zurückgenommen wurde – dann neu laden (z. B. aus einem anderen Fenster) */
  zurueckgenommen: boolean;
}

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export function AenderungsKarte({ id, aufgabeId, gesperrt, zurueckgenommen }: Eigenschaften) {
  const [aenderung, setAenderung] = useState<AdtAenderung | null>(null);
  const [fehler, setFehler] = useState("");
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    api.holeAenderung(id).then(setAenderung, (f: Error) => setFehler(f.message));
  }, [id, zurueckgenommen]);

  if (!aenderung) return fehler ? <div className="aenderungs-karte"><div className="hinweis">{fehler}</div></div> : null;

  const { objekt } = aenderung;
  const angelegt = aenderung.art === "angelegt";

  async function nimmZurueck() {
    const frage = angelegt
      ? `${objekt.name} im SAP-System löschen?\n\nDas lässt sich nicht rückgängig machen. Spätere Änderungen an ${objekt.name} gehen mit verloren.`
      : `Den Stand von ${objekt.name} vor dieser Änderung (${uhrzeit(aenderung!.zeit)}) zurückschreiben und aktivieren?`;
    if (!confirm(frage)) return;
    setLaeuft(true);
    setFehler("");
    try {
      setAenderung(await api.nimmAenderungZurueck(id, aufgabeId));
    } catch (f) {
      setFehler((f as Error).message);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <article className={`aenderungs-karte${aenderung.zurueckgenommen ? " zurueckgenommen" : ""}`}>
      <header className="karten-kopf">
        <span>
          {angelegt ? "Neu angelegt" : "Geändert"}: <span className="tool-name">{objekt.name}</span>
        </span>
        <span className="karten-zeit">
          Paket {objekt.paket} · {uhrzeit(aenderung.zeit)}
        </span>
        {aenderung.zurueckgenommen && <span className="karten-status zurueckgenommen">{angelegt ? "gelöscht" : "rückgängig gemacht"}</span>}
      </header>

      {!angelegt && aenderung.teile.map((t) => <Nebeneinander key={t.teil} titel={`${t.datei} (${t.beschreibung})`} vorher={t.vorher} nachher={t.nachher} />)}

      {aenderung.zurueckgenommen ? (
        <div className="hinweis">{aenderung.zurueckgenommen.text}</div>
      ) : (
        <div className="knopfreihe">
          <button className="knopf" onClick={nimmZurueck} disabled={gesperrt || laeuft} title={gesperrt ? "Geht, sobald der Agent fertig ist" : undefined}>
            {laeuft ? "Läuft …" : angelegt ? "Objekt löschen" : "Rückgängig"}
          </button>
          <span className="hinweis">
            {gesperrt
              ? "Geht, sobald der Agent fertig ist."
              : angelegt
                ? "Löscht das Objekt im SAP-System, ohne KI."
                : "Schreibt den alten Stand zurück und aktiviert ihn, ohne KI. Der Agent erfährt es mit deiner nächsten Nachricht."}
          </span>
        </div>
      )}
      {fehler && <div className="fehlerleiste">{fehler}</div>}
    </article>
  );
}
