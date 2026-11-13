// Entscheidet vor jeder Aktion des Agenten, ob sie erlaubt ist.
// Grundregel: Dateien nur im Workspace-Ordner, keine Shell, kein Internet.
// Das ist technisch erzwungen – der Agent kann es nicht per Prompt umgehen.
// Die Regeln je Tool (erlauben / melden / Freigabe / verbieten) kommen mit dem Tool-Gateway in Schritt 2.
import path from "node:path";
import type { PermissionHandler, PermissionRequestResult } from "@github/copilot-sdk";

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
