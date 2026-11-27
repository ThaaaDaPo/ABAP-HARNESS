// Einstieg: npm start
import { richteAdtEin } from "./adt/adt-einrichten.ts";
import { AenderungenDienst } from "./adt/aenderungen-dienst.ts";
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
import { WorkflowDienst } from "./workflows/workflow-dienst.ts";
import { richteOrdnerEin } from "./workflows/workflow-ordner.ts";
import { Zeitsteuerung } from "./workflows/zeitsteuerung.ts";

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
// Workflows (Phase 4): Dateien im Workflow-Ordner, Läufe in der Datenbank, Start auch nach Zeitplan
richteOrdnerEin(einstellungen.workflowOrdner);
const workflows = new WorkflowDienst(db, einstellungen.workflowOrdner, chat, aufrufer);
const zeitsteuerung = new Zeitsteuerung(workflows.zeitplanQuelle());
// Vergleich und Rückgängig für Änderungen des ADT-MCP im Chat
const aenderungen = new AenderungenDienst(db, einstellungen, chat, aufrufer);
const { app, vite } = await erstelleHttpServer(einstellungen, db, laufzeit, chat, postfach, { sso, schluessel: adtSchluessel, aenderungen }, workflows);

// Nur auf diesem Rechner erreichbar (127.0.0.1), nicht im Netzwerk.
const server = app.listen(einstellungen.port, "127.0.0.1", () => {
  console.log(`ABAP-HARNESS läuft: http://localhost:${einstellungen.port}`);
  console.log(`Modus: ${laufzeit.name}   Workspace: ${einstellungen.workspaceOrdner}`);
  // Läufe, die beim Beenden liefen, sind unterbrochen (lassen sich fortsetzen); ihre offenen
  // Freigaben sind hinfällig. Danach kommt dran, was im Chat noch in der Warteschlange lag.
  workflows.raeumeNachNeustartAuf();
  chat.starte();
  zeitsteuerung.starte();
});

async function herunterfahren() {
  console.log("\nFahre herunter …");
  server.close();
  zeitsteuerung.beende();
  await chat.beenden();
  await aufrufer.schliesseAlle();
  await vite.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", herunterfahren);
process.on("SIGTERM", herunterfahren);
