// Formular zum Eintragen oder Ändern eines MCP-Servers.
// Argumente und Umgebungsvariablen stehen je in einer Zeile – so lassen sich Windows-Pfade
// mit \ einfach hineinkopieren, ohne JSON-Schreibweise.
import { useState } from "react";
import type { McpServerDaten } from "../../gemeinsam/typen.ts";

interface Eigenschaften {
  /** Fehlt bei einem neuen Server */
  vorhanden?: McpServerDaten;
  speichere: (daten: McpServerDaten) => void;
  abbrechen: () => void;
  beschaeftigt: boolean;
}

const zeilen = (text: string) => text.split(/\r?\n/).map((z) => z.trim()).filter(Boolean);

/** "NAME=wert" je Zeile → { NAME: "wert" }. Getrennt wird am ersten =, der Wert darf selbst = enthalten. */
function leseUmgebung(text: string): Record<string, string> {
  return Object.fromEntries(
    zeilen(text)
      .filter((z) => z.includes("="))
      .map((z) => [z.slice(0, z.indexOf("=")).trim(), z.slice(z.indexOf("=") + 1).trim()]),
  );
}

export function McpServerFormular({ vorhanden, speichere, abbrechen, beschaeftigt }: Eigenschaften) {
  const [schluessel, setSchluessel] = useState(vorhanden?.schluessel ?? "");
  const [name, setName] = useState(vorhanden?.name ?? "");
  const [befehl, setBefehl] = useState(vorhanden?.befehl ?? "");
  const [argumente, setArgumente] = useState((vorhanden?.argumente ?? []).join("\n"));
  const [umgebung, setUmgebung] = useState(
    Object.entries(vorhanden?.umgebung ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  const [arbeitsordner, setArbeitsordner] = useState(vorhanden?.arbeitsordner ?? "");

  function absenden() {
    speichere({
      schluessel: schluessel.trim(),
      name: name.trim(),
      befehl: befehl.trim(),
      argumente: zeilen(argumente),
      umgebung: leseUmgebung(umgebung),
      arbeitsordner: arbeitsordner.trim(),
    });
  }

  return (
    <div className="formular">
      <label>
        Schlüssel
        <input value={schluessel} onChange={(e) => setSchluessel(e.target.value)} disabled={!!vorhanden} placeholder="z. B. jira" />
        <span className="hinweis">
          Kurz, Kleinbuchstaben, Ziffern und _, kein Bindestrich. Steht vor jedem Tool-Namen (jira-ticket_lesen) und lässt sich
          später nicht ändern.
        </span>
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Jira/Confluence" />
      </label>
      <label>
        Startbefehl
        <input value={befehl} onChange={(e) => setBefehl(e.target.value)} placeholder="z. B. node oder npx" />
      </label>
      <label>
        Argumente
        <textarea value={argumente} onChange={(e) => setArgumente(e.target.value)} rows={3} placeholder={"eines je Zeile, z. B.\nD:\\mcp\\jira\\server.js"} />
      </label>
      <label>
        Umgebungsvariablen
        <textarea value={umgebung} onChange={(e) => setUmgebung(e.target.value)} rows={2} placeholder="NAME=wert, eine je Zeile (optional)" />
      </label>
      <label>
        Arbeitsordner
        <input value={arbeitsordner} onChange={(e) => setArbeitsordner(e.target.value)} placeholder="leer = Projektordner" />
      </label>

      <div className="knopfreihe">
        <button className="knopf haupt" onClick={absenden} disabled={beschaeftigt}>
          {vorhanden ? "Speichern" : "Eintragen und Tools auslesen"}
        </button>
        <button className="knopf" onClick={abbrechen} disabled={beschaeftigt}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
