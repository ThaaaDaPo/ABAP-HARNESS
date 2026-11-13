// Prüft die Berechtigungsregeln. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import type { PermissionHandler } from "@github/copilot-sdk";
import { erstelleBerechtigungsPruefung, istShellWerkzeug, liegtImOrdner, shellSperre } from "./berechtigungen.ts";

const workspace = path.resolve("/tmp/harness-test/workspace");
// Stellvertreter fürs Gateway: nur jira-ticket_lesen ist erlaubt.
const gateway = { darfAusfuehren: (a: { server: string; tool: string }) => a.server === "jira" && a.tool === "ticket_lesen" };
const pruefe = erstelleBerechtigungsPruefung(workspace, gateway);

type Anfrage = Parameters<PermissionHandler>[0];
const aufruf = { sessionId: "test" } as Parameters<PermissionHandler>[1];

/** Ruft die Prüfung auf und liefert nur die Entscheidung ("approve-once" oder "reject"). */
async function entscheidung(anfrage: object): Promise<string> {
  const ergebnis = await pruefe(anfrage as Anfrage, aufruf);
  return (ergebnis as { kind: string }).kind;
}

test("Pfade im Workspace-Ordner werden erkannt", () => {
  assert.equal(liegtImOrdner(workspace, path.join(workspace, "a.txt")), true);
  assert.equal(liegtImOrdner(workspace, path.join(workspace, "unter", "b.txt")), true);
  assert.equal(liegtImOrdner(workspace, "relativ.txt"), true);
  assert.equal(liegtImOrdner(workspace, workspace), true);
});

test("Pfade außerhalb werden erkannt, auch mit ..", () => {
  assert.equal(liegtImOrdner(workspace, path.resolve("/tmp/anderswo.txt")), false);
  assert.equal(liegtImOrdner(workspace, path.join(workspace, "..", "daneben.txt")), false);
  assert.equal(liegtImOrdner(workspace, "../daneben.txt"), false);
  // Ein Ordner, der nur gleich anfängt, ist nicht derselbe Ordner
  assert.equal(liegtImOrdner(workspace, workspace + "-kopie/x.txt"), false);
});

test("Lesen und Schreiben nur im Workspace", async () => {
  assert.equal(await entscheidung({ kind: "read", path: path.join(workspace, "a.txt") }), "approve-once");
  assert.equal(await entscheidung({ kind: "read", path: "/etc/passwd" }), "reject");
  assert.equal(await entscheidung({ kind: "write", fileName: path.join(workspace, "a.txt") }), "approve-once");
  assert.equal(await entscheidung({ kind: "write", fileName: path.join(workspace, "..", "b.txt") }), "reject");
});

test("Der aufgelöste Pfad zählt, nicht der angegebene", async () => {
  // Z. B. eine Verknüpfung im Workspace, die nach draußen zeigt
  const anfrage = { kind: "write", fileName: path.join(workspace, "link.txt"), resolvedPath: "/etc/passwd" };
  assert.equal(await entscheidung(anfrage), "reject");
});

test("Shell, Internet und Unbekanntes sind gesperrt", async () => {
  assert.equal(await entscheidung({ kind: "shell", fullCommandText: "dir" }), "reject");
  assert.equal(await entscheidung({ kind: "url", url: "https://example.com" }), "reject");
  assert.equal(await entscheidung({ kind: "irgendwas-neues" }), "reject");
});

test("Shell-Werkzeuge werden am Namen erkannt", () => {
  for (const name of ["powershell", "read_powershell", "bash", "pwsh", "run_shell", "terminal"]) {
    assert.equal(istShellWerkzeug(name), true, name);
  }
  for (const name of ["view", "edit", "create", "glob", "sap-objekt_lesen", "jira-ticket_lesen"]) {
    assert.equal(istShellWerkzeug(name), false, name);
  }
});

test("Die Shell-Sperre lehnt Shell-Werkzeuge vor der Ausführung ab", async () => {
  type Eingabe = Parameters<typeof shellSperre>[0];
  const aufrufInfo = { sessionId: "test" } as Parameters<typeof shellSperre>[1];
  const shell = await shellSperre({ toolName: "powershell", toolArgs: { command: "dir" } } as Eingabe, aufrufInfo);
  assert.equal(shell?.permissionDecision, "deny");
  const datei = await shellSperre({ toolName: "view", toolArgs: {} } as Eingabe, aufrufInfo);
  assert.equal(datei, undefined);
});

test("MCP-Tools nur, wenn das Gateway sie erlaubt", async () => {
  assert.equal(await entscheidung({ kind: "mcp", serverName: "jira", toolName: "ticket_lesen" }), "approve-once");
  assert.equal(await entscheidung({ kind: "mcp", serverName: "jira", toolName: "seite_anlegen" }), "reject");
  assert.equal(await entscheidung({ kind: "mcp", serverName: "fremd", toolName: "ticket_lesen" }), "reject");
});

test("Eigene Tools der App sind erlaubt", async () => {
  assert.equal(await entscheidung({ kind: "custom-tool", toolName: "y" }), "approve-once");
});
