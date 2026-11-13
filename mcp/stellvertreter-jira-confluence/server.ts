// Stellvertreter für den Jira/Confluence-MCP: feste Beispieldaten im Speicher, damit sich
// Gateway und Chat auf dem Privatrechner prüfen lassen. Änderungen gelten nur, solange der
// Prozess läuft. Die Tool-Namen sind ausgedacht; der echte Server hat eigene.
import { starteMcpServer, ToolFehler } from "../gemeinsam/mini-server.ts";

const tickets: Record<string, { titel: string; status: string; beschreibung: string }> = {
  "ABAP-123": {
    titel: "Kundengruppe in GET_KUNDE",
    status: "In Arbeit",
    beschreibung: "Methode GET_KUNDE in ZCL_KUNDEN_SERVICE soll zusätzlich die Kundengruppe zurückgeben.",
  },
  "ABAP-124": {
    titel: "Doku für Kundenservice",
    status: "Offen",
    beschreibung: "Für ZCL_KUNDEN_SERVICE eine Confluence-Seite mit Zweck und Methoden anlegen.",
  },
};

const statusWerte = ["Offen", "In Arbeit", "Review", "Erledigt"];

const seiten: { id: number; bereich: string; titel: string; inhalt: string }[] = [
  { id: 1, bereich: "ABAP", titel: "Namenskonventionen", inhalt: "Klassen beginnen mit ZCL_, Interfaces mit ZIF_." },
];

function ticket(schluessel: unknown) {
  const id = String(schluessel ?? "").toUpperCase();
  const gefunden = tickets[id];
  if (!gefunden) throw new ToolFehler(`Ticket ${id || "(ohne Schlüssel)"} nicht gefunden`);
  return { id, ...gefunden };
}

starteMcpServer("stellvertreter-jira-confluence", [
  {
    name: "ticket_lesen",
    beschreibung: "Liest ein Jira-Ticket mit Titel, Status und Beschreibung.",
    nurLesend: true,
    parameter: {
      type: "object",
      properties: { schluessel: { type: "string", description: "Ticket-Schlüssel, z. B. ABAP-123" } },
      required: ["schluessel"],
    },
    ausfuehren: ({ schluessel }) => {
      const t = ticket(schluessel);
      return `${t.id}: ${t.titel}\nStatus: ${t.status}\n\n${t.beschreibung}`;
    },
  },
  {
    name: "tickets_suchen",
    beschreibung: "Listet Jira-Tickets, optional nur mit einem bestimmten Status.",
    nurLesend: true,
    parameter: { type: "object", properties: { status: { type: "string", description: "z. B. Offen" } } },
    ausfuehren: ({ status }) => {
      const liste = Object.entries(tickets).filter(([, t]) => !status || t.status === status);
      return liste.map(([id, t]) => `${id}  [${t.status}]  ${t.titel}`).join("\n") || "Keine Tickets.";
    },
  },
  {
    name: "ticket_verschieben",
    beschreibung: `Setzt den Status eines Jira-Tickets. Mögliche Status: ${statusWerte.join(", ")}.`,
    nurLesend: false,
    parameter: {
      type: "object",
      properties: { schluessel: { type: "string" }, status: { type: "string", enum: statusWerte } },
      required: ["schluessel", "status"],
    },
    ausfuehren: ({ schluessel, status }) => {
      const t = ticket(schluessel);
      if (!statusWerte.includes(status)) throw new ToolFehler(`Unbekannter Status ${status}`);
      const vorher = t.status;
      tickets[t.id].status = status;
      return `${t.id} von „${vorher}“ nach „${status}“ verschoben.`;
    },
  },
  {
    name: "seite_lesen",
    beschreibung: "Sucht Confluence-Seiten, deren Titel den Suchbegriff enthält, und liefert ihren Inhalt.",
    nurLesend: true,
    parameter: { type: "object", properties: { suchbegriff: { type: "string" } }, required: ["suchbegriff"] },
    ausfuehren: ({ suchbegriff }) => {
      const begriff = String(suchbegriff ?? "").toLowerCase();
      const treffer = seiten.filter((s) => s.titel.toLowerCase().includes(begriff));
      return treffer.map((s) => `[${s.bereich}] ${s.titel}\n${s.inhalt}`).join("\n\n") || "Keine Seite gefunden.";
    },
  },
  {
    name: "seite_anlegen",
    beschreibung: "Legt eine neue Confluence-Seite an.",
    nurLesend: false,
    parameter: {
      type: "object",
      properties: {
        bereich: { type: "string", description: "Confluence-Bereich, z. B. ABAP" },
        titel: { type: "string" },
        inhalt: { type: "string", description: "Inhalt der Seite" },
      },
      required: ["bereich", "titel", "inhalt"],
    },
    ausfuehren: ({ bereich, titel, inhalt }) => {
      const seite = { id: seiten.length + 1, bereich: String(bereich), titel: String(titel), inhalt: String(inhalt) };
      seiten.push(seite);
      return `Seite ${seite.id} „${seite.titel}“ im Bereich ${seite.bereich} angelegt.`;
    },
  },
]);
