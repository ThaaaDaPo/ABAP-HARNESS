// Einstieg: npm start
import { ChatDienst } from "./chat/chat-dienst.ts";
import { oeffneDatenbank } from "./datenbank/datenbank.ts";
import { ladeEinstellungen } from "./einstellungen.ts";
import { erstelleHttpServer } from "./http/http-server.ts";
import { erstelleLaufzeit } from "./laufzeit/laufzeit.ts";

const einstellungen = ladeEinstellungen();
const db = oeffneDatenbank(einstellungen.datenOrdner);
const laufzeit = await erstelleLaufzeit(einstellungen);
const chat = new ChatDienst(db, laufzeit, einstellungen);
const { app, vite } = await erstelleHttpServer(einstellungen, db, chat);

// Nur auf diesem Rechner erreichbar (127.0.0.1), nicht im Netzwerk.
const server = app.listen(einstellungen.port, "127.0.0.1", () => {
  console.log(`ABAP-HARNESS läuft: http://localhost:${einstellungen.port}`);
  console.log(`Modus: ${laufzeit.name}   Workspace: ${einstellungen.workspaceOrdner}`);
});

async function herunterfahren() {
  console.log("\nFahre herunter …");
  server.close();
  await chat.beenden();
  await vite.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", herunterfahren);
process.on("SIGTERM", herunterfahren);
