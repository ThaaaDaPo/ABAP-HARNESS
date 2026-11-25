// Einstieg: npm start
import { richteStandardAgentenEin } from "./agenten/agenten-dienst.ts";
import { ChatDienst } from "./chat/chat-dienst.ts";
import { oeffneDatenbank } from "./datenbank/datenbank.ts";
import { ladeEinstellungen } from "./einstellungen.ts";
import { erstelleHttpServer } from "./http/http-server.ts";
import { erstelleLaufzeit } from "./laufzeit/laufzeit.ts";
import { McpAufrufer } from "./mcp/mcp-aufrufer.ts";
import { richteStellvertreterEin } from "./mcp/stellvertreter.ts";
import { PostfachDienst } from "./postfach/postfach-dienst.ts";

const einstellungen = ladeEinstellungen();
const db = oeffneDatenbank(einstellungen.datenOrdner);
await richteStellvertreterEin(db);
// Danach, damit der Standard-Agent beim allerersten Start auch die Stellvertreter bekommt.
richteStandardAgentenEin(db, einstellungen);
// Ruft MCP-Tools ohne Agent auf: in der Simulation und beim Freigeben im Postfach
const aufrufer = new McpAufrufer();
const laufzeit = await erstelleLaufzeit(einstellungen, aufrufer);
const chat = new ChatDienst(db, laufzeit, einstellungen);
const postfach = new PostfachDienst(db, chat, aufrufer);
const { app, vite } = await erstelleHttpServer(einstellungen, db, laufzeit, chat, postfach);

// Nur auf diesem Rechner erreichbar (127.0.0.1), nicht im Netzwerk.
const server = app.listen(einstellungen.port, "127.0.0.1", () => {
  console.log(`ABAP-HARNESS läuft: http://localhost:${einstellungen.port}`);
  console.log(`Modus: ${laufzeit.name}   Workspace: ${einstellungen.workspaceOrdner}`);
  // Was beim letzten Beenden noch in der Warteschlange lag, kommt jetzt dran.
  chat.starte();
});

async function herunterfahren() {
  console.log("\nFahre herunter …");
  server.close();
  await chat.beenden();
  await aufrufer.schliesseAlle();
  await vite.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", herunterfahren);
process.on("SIGTERM", herunterfahren);
