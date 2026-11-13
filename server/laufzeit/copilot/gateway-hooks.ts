// Verbindet das Tool-Gateway mit den Hooks des Copilot SDK.
// Lehre aus Schritt 1: Regeln im Hook onPreToolUse durchsetzen, denn nicht jeder Aufruf
// läuft über die Berechtigungsprüfung. Die Berechtigungsprüfung (berechtigungen.ts) sperrt
// zusätzlich und unabhängig davon alles, was das Gateway nicht erlaubt.
import type { SessionHooks } from "@github/copilot-sdk";
import type { ToolGateway } from "../../gateway/gateway.ts";
import { shellSperre } from "./berechtigungen.ts";

type Hooks = Required<Pick<SessionHooks, "onPreToolUse" | "onPostToolUse">>;

export function erstelleGatewayHooks(gateway: ToolGateway): Hooks {
  return {
    onPreToolUse: async (eingabe, aufruf) => {
      const shell = await shellSperre(eingabe, aufruf);
      if (shell) return shell;

      // Kein MCP-Tool eines eingetragenen Servers: eingebautes Werkzeug, dafür ist die
      // Berechtigungsprüfung zuständig (Dateien nur im Workspace usw.).
      const adresse = gateway.zerlege(eingabe.toolName);
      if (!adresse) return undefined;

      const entscheidung = gateway.vorAufruf(adresse, eingabe.toolArgs);
      if (!entscheidung.ausfuehren) {
        return { permissionDecision: "deny", permissionDecisionReason: entscheidung.grund };
      }
      // Bewusst nicht "allow": Die Berechtigungsprüfung soll trotzdem noch gefragt werden.
      return undefined;
    },

    // Läuft nur nach erfolgreichen Aufrufen. Bei Regel "melden" entsteht hier der Postfach-Eintrag.
    onPostToolUse: async (eingabe) => {
      const adresse = gateway.zerlege(eingabe.toolName);
      if (adresse) gateway.nachAufruf(adresse, eingabe.toolArgs, eingabe.toolResult?.textResultForLlm ?? "");
      return undefined;
    },
  };
}
