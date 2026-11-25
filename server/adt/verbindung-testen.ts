// „Verbindung testen“ (Seite MCP-Server → ADT und Einrichtung): mit dem SSO-Cookie bei ADT anmelden
// und fragen, wer man ist. So sieht David vor dem ersten Agenten-Lauf, ob Adresse, Mandant und
// Anmeldung stimmen. Gleicher Weg wie im ADT-MCP (sap-gegenstelle.ts) und im Prüfpaket.
import type { AdtKonfiguration } from "../../gemeinsam/typen.ts";
import type { SsoAnmeldung } from "./sso-anmeldung.ts";

export async function testeVerbindung(konfiguration: AdtKonfiguration, sso: SsoAnmeldung): Promise<string> {
  if (konfiguration.gegenstelle === "simulation") return "Übungssystem – es gibt keine Verbindung zu testen.";
  const { ADTClient, createCookieSessionOptions } = await import("abap-adt-api");
  let cookie: string | undefined;
  const optionen = createCookieSessionOptions({
    id: "abap-harness-verbindungstest",
    loadCookies: async () => (cookie ??= await sso.cookie(null)),
    acquireCookies: async (kontext) => (cookie = await sso.cookie(kontext.reason === "expired" ? (cookie ?? null) : null)),
  });
  const client = new ADTClient(new URL(konfiguration.url).origin, "SSO", "", konfiguration.mandant, konfiguration.sprache, optionen);
  try {
    await client.login();
    const info = await client.getSystemInformation();
    const text = `Angemeldet als ${info.userName}${info.userFullName ? ` (${info.userFullName})` : ""} – System ${info.systemID}, Mandant ${info.client}.`;
    sso.bestaetige(text);
    return text;
  } finally {
    // Nur die Sitzung freigeben, nicht abmelden – sonst wäre das SSO-Ticket womöglich auch für die Agenten weg.
    await client.dropSession().catch(() => {});
  }
}
