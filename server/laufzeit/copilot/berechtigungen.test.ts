// Prüft die Berechtigungsregeln. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import type { PermissionHandler } from "@github/copilot-sdk";
import { erstelleBerechtigungsPruefung, liegtImOrdner } from "./berechtigungen.ts";

const workspace = path.resolve("/tmp/harness-test/workspace");
const pruefe = erstelleBerechtigungsPruefung(workspace);

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

test("MCP- und eigene Tools sind vorerst erlaubt", async () => {
  assert.equal(await entscheidung({ kind: "mcp", toolName: "x" }), "approve-once");
  assert.equal(await entscheidung({ kind: "custom-tool", toolName: "y" }), "approve-once");
});
