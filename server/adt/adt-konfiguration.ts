// Die ADT-Konfiguration, wie David sie in der App einstellt (Seite MCP-Server → ADT).
// Liegt in der Datenbank (app_einstellungen), nicht in einstellungen.json – so lässt sie sich in der
// App ändern. Benutzer und Passwort gibt es bewusst nicht: angemeldet wird nur per SSO (E-63).
import type { AdtKonfiguration } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { Fehler } from "../fehler.ts";

const schluessel = "adt";

export const standardKonfiguration: AdtKonfiguration = {
  gegenstelle: "simulation",
  url: "",
  mandant: "",
  sprache: "DE",
  pakete: ["$TMP"],
  // So erkannte der SAP-MCP-Proxy die Anmeldung (E-38): SSO-Ticket oder Sitzungs-Cookie des Systems
  cookieNamen: ["MYSAPSSO2", "SAP_SESSIONID_*"],
  edgePfad: "",
  atcVariante: "",
};

export function ladeKonfiguration(db: Datenbank): AdtKonfiguration {
  const zeile = db.prepare(`SELECT wert FROM app_einstellungen WHERE schluessel = ?`).get(schluessel) as { wert: string } | undefined;
  return { ...standardKonfiguration, ...(zeile ? JSON.parse(zeile.wert) : {}) };
}

export function speichereKonfiguration(db: Datenbank, konfiguration: AdtKonfiguration): void {
  db.prepare(`INSERT INTO app_einstellungen (schluessel, wert) VALUES (?, ?) ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert`).run(
    schluessel,
    JSON.stringify(konfiguration),
  );
}

const liste = (wert: unknown): string[] =>
  (Array.isArray(wert) ? wert : String(wert ?? "").split(/[,\n]/))
    .map((eintrag) => String(eintrag).trim())
    .filter(Boolean);

/** Prüft, was aus dem Formular kommt. */
export function pruefeKonfiguration(roh: any): AdtKonfiguration {
  const konfiguration: AdtKonfiguration = {
    gegenstelle: roh?.gegenstelle === "sap" ? "sap" : "simulation",
    url: String(roh?.url ?? "").trim(),
    mandant: String(roh?.mandant ?? "").trim(),
    sprache: String(roh?.sprache ?? "").trim().toUpperCase() || "DE",
    pakete: liste(roh?.pakete).map((p) => p.toUpperCase()),
    cookieNamen: liste(roh?.cookieNamen),
    edgePfad: String(roh?.edgePfad ?? "").trim(),
    atcVariante: String(roh?.atcVariante ?? "").trim().toUpperCase(),
  };
  if (konfiguration.pakete.length === 0) throw new Fehler(400, "Mindestens ein Paket angeben, in dem der Agent ändern darf (z. B. $TMP).");
  if (konfiguration.gegenstelle === "sap") {
    let adresse: URL;
    try {
      adresse = new URL(konfiguration.url);
    } catch {
      throw new Fehler(400, "Bitte die SAP-Adresse vollständig angeben, z. B. https://sap-entwicklung.firma.de:44300/sap/bc/adt/");
    }
    if (adresse.protocol !== "https:" && adresse.protocol !== "http:") throw new Fehler(400, "Die SAP-Adresse muss mit https:// beginnen.");
    if (!/^\d{3}$/.test(konfiguration.mandant)) throw new Fehler(400, "Der Mandant hat drei Ziffern, z. B. 010.");
    if (konfiguration.cookieNamen.length === 0) throw new Fehler(400, "Mindestens einen Cookie-Namen angeben (Standard: MYSAPSSO2, SAP_SESSIONID_*).");
  }
  return konfiguration;
}
