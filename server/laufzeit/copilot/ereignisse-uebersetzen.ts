// Übersetzt die Ereignisse des Copilot SDK in die Ereignisse der App.
// Das SDK kennt über hundert Ereignisarten; die App braucht nur wenige davon.
import type { SessionEvent } from "@github/copilot-sdk";
import type { Ereignis } from "../../../gemeinsam/typen.ts";

export function uebersetze(ereignis: SessionEvent): Ereignis | null {
  switch (ereignis.type) {
    case "assistant.message_delta":
      // Unteragenten (parentToolCallId gesetzt) blenden wir aus, sonst mischt sich ihr Text ein.
      if (ereignis.data.parentToolCallId) return null;
      return { art: "agent_schreibt", textTeil: ereignis.data.deltaContent };

    case "assistant.message":
      if (ereignis.data.parentToolCallId || !ereignis.data.content.trim()) return null;
      return { art: "agent_nachricht", text: ereignis.data.content };

    case "tool.execution_start":
      return {
        art: "tool_start",
        aufrufId: ereignis.data.toolCallId,
        toolName: ereignis.data.toolName,
        argumente: ereignis.data.arguments ?? null,
      };

    case "tool.execution_complete":
      return {
        art: "tool_ende",
        aufrufId: ereignis.data.toolCallId,
        erfolgreich: ereignis.data.success,
        ergebnis: ereignis.data.result?.content ?? ereignis.data.error?.message ?? "",
      };

    case "session.error":
      return { art: "fehler", meldung: ereignis.data.message };

    default:
      return null;
  }
}
