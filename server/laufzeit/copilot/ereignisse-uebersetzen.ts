// Übersetzt die Ereignisse des Copilot SDK in die Ereignisse der App.
// Das SDK kennt über hundert Ereignisarten; die App braucht nur wenige davon.
// Ein SDK-Ereignis kann mehrere Ereignisse der App ergeben (assistant.usage: Modell und Verbrauch).
import type { SessionEvent } from "@github/copilot-sdk";
import type { Ereignis } from "../../../gemeinsam/typen.ts";

export function uebersetze(ereignis: SessionEvent): Ereignis[] {
  switch (ereignis.type) {
    case "assistant.message_delta":
      // Unteragenten (parentToolCallId gesetzt) blenden wir aus, sonst mischt sich ihr Text ein.
      if (ereignis.data.parentToolCallId) return [];
      return [{ art: "agent_schreibt", textTeil: ereignis.data.deltaContent }];

    case "assistant.message":
      if (ereignis.data.parentToolCallId || !ereignis.data.content.trim()) return [];
      return [{ art: "agent_nachricht", text: ereignis.data.content }];

    case "tool.execution_start":
      return [
        {
          art: "tool_start",
          aufrufId: ereignis.data.toolCallId,
          toolName: ereignis.data.toolName,
          argumente: ereignis.data.arguments ?? null,
        },
      ];

    case "tool.execution_complete":
      return [
        {
          art: "tool_ende",
          aufrufId: ereignis.data.toolCallId,
          erfolgreich: ereignis.data.success,
          ergebnis: ereignis.data.result?.content ?? ereignis.data.error?.message ?? "",
        },
      ];

    // Nach jedem Modellaufruf: welches Modell geantwortet hat (wichtig bei automatischer Auswahl)
    // und was der Aufruf verbraucht hat. Verbrauch zählt auch bei Unteragenten – er kostet ja.
    case "assistant.usage": {
      const daten = ereignis.data;
      const verbrauch: Ereignis = {
        art: "verbrauch",
        modell: daten.model,
        eingabeTokens: daten.inputTokens ?? 0,
        ausgabeTokens: daten.outputTokens ?? 0,
        cacheTokens: daten.cacheReadTokens ?? 0,
        nanoAiu: daten.copilotUsage?.totalNanoAiu ?? null,
        kostenfaktor: daten.cost ?? null,
      };
      if (daten.parentToolCallId) return [verbrauch];
      return [{ art: "modell", modell: daten.model }, verbrauch];
    }

    case "session.error":
      return [{ art: "fehler", meldung: ereignis.data.message }];

    default:
      return [];
  }
}
