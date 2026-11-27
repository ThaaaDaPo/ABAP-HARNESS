// Beispiel, das beim allerersten Start im Workflow-Ordner entsteht. Läuft mit dem Jira-Stellvertreter
// in der Simulation und zeigt alle wichtigen Bausteine: Tool-Schritt, Bedingung, Schleife,
// KI-Schritt mit festen Ergebnisfeldern, Tool-Schritt mit Freigabe und eine Variable, die mitwächst.
import type { WorkflowDefinition } from "../../gemeinsam/typen.ts";

export const beispielWorkflow: WorkflowDefinition = {
  name: "Tickets einschätzen",
  beschreibung:
    "Sucht Jira-Tickets mit einem Status, lässt jedes von der KI einschätzen und setzt umsetzbare nach Freigabe auf „In Arbeit“. " +
    "Ergebnis: je Ticket eine kurze Einschätzung.",
  start: { manuell: true, durchAgent: true, zeitplan: null },
  eingaben: [{ name: "status", beschreibung: "Status der Tickets, die eingeschätzt werden", typ: "text", pflicht: false, standard: "Offen" }],
  schritte: [
    {
      id: "suchen",
      titel: "Tickets suchen",
      art: "tool",
      server: "jira",
      tool: "tickets_suchen",
      argumente: { status: "{{eingaben.status}}", format: "json" },
      regel: "erlauben",
      ergebnis: "tickets",
      beiFehler: "abbrechen",
    },
    {
      id: "keine",
      titel: "Keine Tickets?",
      art: "wenn",
      bedingung: { links: "{{tickets}}", vergleich: "leer", rechts: "" },
      dann: [{ id: "nichts", titel: "Nichts zu tun", art: "beenden", ergebnis: "Keine Tickets mit Status {{eingaben.status}}." }],
      sonst: [],
    },
    {
      id: "je_ticket",
      titel: "Je Ticket",
      art: "fuer_jedes",
      liste: "{{tickets}}",
      als: "ticket",
      hoechstens: 10,
      schritte: [
        {
          id: "einschaetzen",
          titel: "Ticket einschätzen",
          art: "ki",
          agentId: "standard",
          auftrag:
            "Schätze das Jira-Ticket {{ticket.schluessel}} ein: „{{ticket.titel}}“.\n\nBeschreibung:\n{{ticket.beschreibung}}\n\n" +
            "Ist es ohne Rückfrage umsetzbar?",
          felder: [
            { name: "umsetzbar", typ: "ja_nein", beschreibung: "Ohne Rückfrage umsetzbar" },
            { name: "begruendung", typ: "text", beschreibung: "Kurze Begründung, ein bis zwei Sätze" },
          ],
          ergebnis: "einschaetzung",
        },
        {
          id: "umsetzbar",
          titel: "Umsetzbar?",
          art: "wenn",
          bedingung: { links: "{{einschaetzung.umsetzbar}}", vergleich: "wahr", rechts: "" },
          dann: [
            {
              id: "verschieben",
              titel: "Auf „In Arbeit“ setzen",
              art: "tool",
              server: "jira",
              tool: "ticket_verschieben",
              argumente: { schluessel: "{{ticket.schluessel}}", status: "In Arbeit" },
              regel: "freigabe",
              ergebnis: "",
              beiFehler: "weiter",
            },
          ],
          sonst: [],
        },
        { id: "merken", titel: "Einschätzung merken", art: "setzen", name: "bericht", wert: "{{bericht}}\n- {{ticket.schluessel}}: {{einschaetzung.begruendung}}" },
      ],
    },
  ],
  ergebnis: "Eingeschätzt:{{bericht}}",
  creditLimit: 500,
};
