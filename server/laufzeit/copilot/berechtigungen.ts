// Entscheidet vor jeder Aktion des Agenten, ob sie erlaubt ist.
// Grundregel: Dateien nur im Workspace-Ordner, keine Shell, kein Internet.
// Das ist technisch erzwungen – der Agent kann es nicht per Prompt umgehen.
// Die Regeln je Tool (erlauben / melden / Freigabe / verbieten) kommen mit dem Tool-Gateway in Schritt 2.
import path from "node:path";
import type { PermissionHandler, PermissionRequestResult, SessionHooks } from "@github/copilot-sdk";

/** Das SDK exportiert den Typ des Hooks nicht einzeln, deshalb hier abgeleitet. */
type PreToolUseHandler = NonNullable<SessionHooks["onPreToolUse"]>;

// ---------------------------------------------------------------------------------------------
// Sperre 1: Shell-Werkzeuge
// Copilot führt einfache Befehle wie `dir` teils aus, ohne die Berechtigungsprüfung zu fragen
// (am Firmenrechner beobachtet). Deshalb werden Shell-Werkzeuge doppelt gesperrt:
// gar nicht erst angeboten (shellWerkzeuge) und vor jeder Ausführung abgelehnt (shellSperre).
// ---------------------------------------------------------------------------------------------

/** Eingebaute Shell-Werkzeuge von Copilot. Namen, die es nicht gibt, schaden nicht. */
export const shellWerkzeuge = ["bash", "powershell", "pwsh"].flatMap((name) =>
  [name, `read_${name}`, `write_${name}`, `stop_${name}`, `list_${name}`].map((w) => `builtin:${w}`),
);

/** Erkennt Shell-Werkzeuge am Namen, auch wenn Copilot sie anders nennt als erwartet. */
export function istShellWerkzeug(toolName: string): boolean {
  return /bash|powershell|pwsh|shell|terminal|cmd\.exe/i.test(toolName);
}

/** Läuft vor jedem Werkzeug-Aufruf, unabhängig von der Berechtigungsprüfung. */
export const shellSperre: PreToolUseHandler = async (eingabe) => {
  if (istShellWerkzeug(eingabe.toolName)) {
    return { permissionDecision: "deny", permissionDecisionReason: "Shell-Befehle sind in dieser Umgebung abgeschaltet." };
  }
  return undefined;
};

// ---------------------------------------------------------------------------------------------
// Sperre 2: Berechtigungsprüfung für Dateien, Internet und alles Übrige
// ---------------------------------------------------------------------------------------------

const erlaubt: PermissionRequestResult = { kind: "approve-once" };

function abgelehnt(grund: string): PermissionRequestResult {
  return { kind: "reject", feedback: grund };
}

/** Liegt der Pfad im Ordner (oder ist er der Ordner selbst)? Unter Windows ohne Groß-/Kleinschreibung. */
export function liegtImOrdner(ordner: string, pfad: string): boolean {
  const relativ = path.relative(path.resolve(ordner), path.resolve(ordner, pfad));
  return relativ === "" || (!relativ.startsWith("..") && !path.isAbsolute(relativ));
}

export function erstelleBerechtigungsPruefung(workspaceOrdner: string): PermissionHandler {
  return (anfrage) => {
    switch (anfrage.kind) {
      case "read":
        return liegtImOrdner(workspaceOrdner, anfrage.resolvedPath ?? anfrage.path)
          ? erlaubt
          : abgelehnt(`Lesen ist nur im Workspace-Ordner ${workspaceOrdner} erlaubt.`);

      case "write":
        return liegtImOrdner(workspaceOrdner, anfrage.resolvedPath ?? anfrage.fileName)
          ? erlaubt
          : abgelehnt(`Schreiben ist nur im Workspace-Ordner ${workspaceOrdner} erlaubt.`);

      case "shell":
        return abgelehnt("Shell-Befehle sind in dieser Umgebung abgeschaltet.");

      case "url":
        return abgelehnt("Internetzugriff ist in dieser Umgebung abgeschaltet.");

      case "mcp":
      case "custom-tool":
        // Vorerst erlaubt. Ab Schritt 2 entscheidet hier das Tool-Gateway nach den Regeln je Tool.
        return erlaubt;

      default:
        return abgelehnt(`Aktionen der Art "${anfrage.kind}" sind nicht erlaubt.`);
    }
  };
}
