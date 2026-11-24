// Ein Tool-Aufruf im Verlauf: zusammengeklappt nur Name und Ergebnis-Zustand, aufgeklappt alle Details.

export interface ToolAufrufDaten {
  aufrufId: string;
  toolName: string;
  argumente: unknown;
  /** Fehlt, solange das Tool noch läuft */
  ende?: { erfolgreich: boolean; ergebnis: string };
}

function zustand(aufruf: ToolAufrufDaten) {
  if (!aufruf.ende) return { text: "läuft …", klasse: "laeuft" };
  // Vom Tool-Gateway angehalten (Freigabe nötig oder verboten) – kein Fehler des Tools selbst
  if (!aufruf.ende.erfolgreich && aufruf.ende.ergebnis.startsWith("Nicht ausgeführt")) {
    return { text: "nicht ausgeführt", klasse: "angehalten" };
  }
  return aufruf.ende.erfolgreich ? { text: "erledigt", klasse: "ok" } : { text: "fehlgeschlagen", klasse: "fehlgeschlagen" };
}

export function ToolAufruf({ aufruf }: { aufruf: ToolAufrufDaten }) {
  const { text, klasse } = zustand(aufruf);
  return (
    <details className="tool-aufruf">
      <summary>
        <span className="tool-name">{aufruf.toolName}</span>
        <span className={`tool-zustand ${klasse}`}>{text}</span>
      </summary>
      <div className="tool-details">
        <div className="tool-ueberschrift">Argumente</div>
        <pre>{JSON.stringify(aufruf.argumente, null, 2)}</pre>
        {aufruf.ende && (
          <>
            <div className="tool-ueberschrift">Ergebnis</div>
            <pre>{aufruf.ende.ergebnis || "(leer)"}</pre>
          </>
        )}
      </div>
    </details>
  );
}
