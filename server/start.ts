// Einstieg: npm start
import { richteAdtEin } from "./adt/adt-einrichten.ts";
import { ladeKonfiguration } from "./adt/adt-konfiguration.ts";
import { SsoAnmeldung } from "./adt/sso-anmeldung.ts";
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
// ADT-MCP (mcp/adt/) als eingebauter Server; er bekommt keinen Agenten automatisch.
const adtSchluessel = await richteAdtEin(db, einstellungen);
// Die SSO-Anmeldung am SAP-System gibt es einmal für alle ADT-MCP-Prozesse.
const sso = new SsoAnmeldung(() => ladeKonfiguration(db));
// Ruft MCP-Tools ohne Agent auf: in der Simulation und beim Freigeben im Postfach
const aufrufer = new McpAufrufer();
const laufzeit = await erstelleLaufzeit(einstellungen, aufrufer);
const chat = new ChatDienst(db, laufzeit, einstellungen);
const postfach = new PostfachDienst(db, chat, aufrufer);
const { app, vite } = await erstelleHttpServer(einstellungen, db, laufzeit, chat, postfach, { sso, schluessel: adtSchluessel });

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
