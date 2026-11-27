// Das echte SAP-System über die ADT-Schnittstelle, mit der Bibliothek abap-adt-api (E-39).
// Vorlage ist das Prüfpaket (pruefpaket/src/schritte-sap.js), das am Firmenrechner erfolgreich lief:
// Cookie-Sitzung, Suchen, Lesen, Syntaxprüfung mit ungespeichertem Quelltext, Sperren, Speichern,
// Aktivieren, ABAP Unit. Alles darüber hinaus (Klassen-Includes, Funktionsbausteine, ATC) ist nach
// der Bibliothek geschrieben und lief noch nie – siehe docs/08-phase-1.md bzw. Phase 3.
//
// Anmeldung nur per SSO: Das Cookie kommt von der App (app-zugang.ts). Benutzer und Passwort gibt
// es nicht; den Benutzernamen meldet SAP nach der Anmeldung selbst.
import { ADTClient, createCookieSessionOptions, isAdtError, isHttpError, session_types, type CreatableTypeIds } from "abap-adt-api";
import type { AdtLaufzeitKonfiguration } from "../../gemeinsam/typen.ts";
import type { AppZugang } from "./app-zugang.ts";
import type { AdtGegenstelle, AdtObjekt, AktivierungsErgebnis, AtcBefund, Meldung, TestErgebnis } from "./gegenstelle.ts";
import { artAusAdtTyp, arten, type ObjektArt, type Teil } from "./objektarten.ts";

/** Wo der Quelltext eines Teils liegt */
function quellUrl(objekt: AdtObjekt, teil: Teil): string {
  return teil === "main" ? `${objekt.url}/source/main` : `${objekt.url}/includes/${teil}`;
}

/** SAP meldet Schweregrade als Buchstaben (E, W, I …) */
function schwere(kennung: string | undefined): Meldung["schwere"] {
  if (/^[EAX]/i.test(kennung ?? "")) return "fehler";
  if (/^W/i.test(kennung ?? "")) return "warnung";
  return "info";
}

function nichtGefunden(fehler: unknown): boolean {
  const status = isAdtError(fehler) ? fehler.err : isHttpError(fehler) ? fehler.status : 0;
  return status === 404;
}

export class SapGegenstelle implements AdtGegenstelle {
  private client: ADTClient;
  private konfiguration: AdtLaufzeitKonfiguration;
  private angemeldet: Promise<string> | null = null;

  constructor(konfiguration: AdtLaufzeitKonfiguration, zugang: AppZugang) {
    this.konfiguration = konfiguration;
    let cookie: string | undefined;
    const optionen = createCookieSessionOptions({
      // Gleiche id für alle Clients dieses Prozesses: gleichzeitige Neuanmeldungen werden zusammengelegt.
      id: "abap-harness-adt",
      loadCookies: async () => (cookie ??= await zugang.cookie()),
      // Abgelaufen: Die App meldet neu an (Edge geht auf) – der Aufruf wartet so lange (V-16).
      acquireCookies: async (kontext) => (cookie = await zugang.cookie(kontext.reason === "expired" ? cookie : undefined)),
    });
    // ADT braucht nur Protokoll, Host und Port. Der Benutzername ist bei der Cookie-Anmeldung ohne
    // Bedeutung, die Bibliothek verlangt aber einen.
    this.client = new ADTClient(new URL(konfiguration.url).origin, "SSO", "", konfiguration.mandant, konfiguration.sprache, optionen);
  }

  /** Meldet sich beim ersten Bedarf an und merkt sich den Benutzer, den SAP meldet. */
  benutzer(): Promise<string> {
    this.angemeldet ??= (async () => {
      await this.client.login();
      return (await this.client.getSystemInformation()).userName;
    })().catch((fehler) => {
      this.angemeldet = null;
      throw fehler;
    });
    return this.angemeldet;
  }

  async finde(name: string, art?: ObjektArt): Promise<AdtObjekt | null> {
    await this.benutzer();
    const gesucht = name.toUpperCase();
    const treffer = (await this.client.searchObject(gesucht, art ? arten[art].adtTyp : undefined, 20)).find(
      (t) => t["adtcore:name"].toUpperCase() === gesucht && artAusAdtTyp(t["adtcore:type"]) && (!art || artAusAdtTyp(t["adtcore:type"]) === art),
    );
    if (!treffer) return null;
    const gefundeneArt = artAusAdtTyp(treffer["adtcore:type"])!;
    const url = treffer["adtcore:uri"];
    // Funktionsbaustein: /sap/bc/adt/functions/groups/<gruppe>/fmodules/<baustein>
    const gruppe = gefundeneArt === "funktionsbaustein" ? decodeURIComponent(url.match(/\/groups\/([^/]+)\//)?.[1] ?? "").toUpperCase() : undefined;
    let paket = treffer["adtcore:packageName"] ?? "";
    // Die Suche liefert das Paket nicht immer mit – bei Funktionsbausteinen gilt das der Gruppe.
    if (!paket && gruppe) paket = (await this.finde(gruppe, "funktionsgruppe"))?.paket ?? "";
    return { name: treffer["adtcore:name"].toUpperCase(), art: gefundeneArt, paket, url, ...(gruppe ? { funktionsgruppe: gruppe } : {}) };
  }

  async lies(objekt: AdtObjekt, teil: Teil): Promise<string | null> {
    await this.benutzer();
    const url = quellUrl(objekt, teil);
    try {
      // Wie im Prüfpaket: erst die inaktive Version (neuester Stand), sonst die aktive.
      return await this.client.getObjectSource(url, { version: "inactive" }).catch(() => this.client.getObjectSource(url));
    } catch (fehler) {
      // Klassen haben nicht immer alle Includes (z. B. keine Testklassen).
      if (teil !== "main" && nichtGefunden(fehler)) return null;
      throw fehler;
    }
  }

  async pruefe(objekt: AdtObjekt, teil: Teil, quelltext: string): Promise<Meldung[]> {
    await this.benutzer();
    const url = quellUrl(objekt, teil);
    // Prüfobjekt ist beim Hauptteil der Quelltext selbst (so im Prüfpaket erprobt), bei einem
    // Klassen-Include die Klasse.
    const hauptUrl = teil === "main" ? url : objekt.url;
    const pruefe = (version: string) => this.client.syntaxCheck(url, hauptUrl, quelltext, "", version);
    // Im Prüfpaket ging je nach System "active" oder erst "inactive".
    const ergebnisse = await pruefe("active").catch(() => pruefe("inactive"));
    return ergebnisse.map((m) => ({ zeile: m.line, spalte: m.offset, schwere: schwere(m.severity), text: m.text }));
  }

  async schreibe(objekt: AdtObjekt, aenderungen: { teil: Teil; quelltext: string }[]): Promise<void> {
    await this.benutzer();
    // Sperren nur für die Dauer des Speicherns, in einer zustandsbehafteten Sitzung.
    this.client.stateful = session_types.stateful;
    const sperre = await this.client.lock(objekt.url);
    try {
      for (const { teil, quelltext } of aenderungen) {
        if (teil === "testclasses" && (await this.lies(objekt, "testclasses")) === null) {
          await this.client.createTestInclude(objekt.name, sperre.LOCK_HANDLE);
        }
        await this.client.setObjectSource(quellUrl(objekt, teil), quelltext, sperre.LOCK_HANDLE);
      }
    } finally {
      await this.client.unLock(objekt.url, sperre.LOCK_HANDLE).catch(() => {});
      this.client.stateful = session_types.stateless;
    }
  }

  async aktiviere(objekte: AdtObjekt[]): Promise<AktivierungsErgebnis> {
    await this.benutzer();
    const meldungen: AktivierungsErgebnis["meldungen"] = [];
    let erfolgreich = true;
    for (const objekt of objekte) {
      // Bewährte Form aus dem Prüfpaket: Name und URL. (Die Listenform mit leerer parentUri lehnte SAP
      // am Firmenrechner ab: „Prüfung der Bedingung fehlgeschlagen“.)
      let ergebnis = await this.client.activate(objekt.name, objekt.url);
      // Nennt SAP weitere inaktive Teile, die dazugehören, diese zusammen aktivieren – mit den
      // Angaben, die SAP selbst liefert.
      const dazu = ergebnis.inactive.flatMap((r) => (r.object ? [r.object] : []));
      if (!ergebnis.success && dazu.length > 0) ergebnis = await this.client.activate(dazu);

      erfolgreich &&= ergebnis.success;
      for (const m of ergebnis.messages) meldungen.push({ objekt: m.objDescr || objekt.name, zeile: m.line, spalte: 0, schwere: schwere(m.type), text: m.shortText });
      // Gescheitert ohne Meldung: zeigen, was noch inaktiv ist – sonst weiß der Agent nicht weiter
      if (!ergebnis.success && ergebnis.messages.length === 0) {
        const offen = ergebnis.inactive.flatMap((r) => (r.object ? [r.object["adtcore:name"]] : [])).join(", ");
        meldungen.push({ objekt: objekt.name, zeile: 0, spalte: 0, schwere: "fehler", text: `Nicht aktiviert${offen ? `, noch inaktiv: ${offen}` : ""}.` });
      }
    }
    return { erfolgreich, meldungen };
  }

  async legeAn(art: ObjektArt, name: string, beschreibung: string, paket: string, funktionsgruppe?: AdtObjekt): Promise<AdtObjekt> {
    const benutzer = await this.benutzer();
    const eltern = funktionsgruppe
      ? { parentName: funktionsgruppe.name, parentPath: funktionsgruppe.url }
      : { parentName: paket, parentPath: `/sap/bc/adt/packages/${encodeURIComponent(paket)}` };
    await this.client.createObject({
      objtype: arten[art].adtTyp as CreatableTypeIds,
      name: name.toUpperCase(),
      description: beschreibung,
      responsible: benutzer,
      ...eltern,
    });
    const objekt = await this.finde(name, art);
    if (!objekt) throw new Error(`${name} wurde angelegt, ist aber nicht zu finden.`);
    return objekt;
  }

  async loesche(objekt: AdtObjekt): Promise<void> {
    await this.benutzer();
    // Wie im Prüfpaket (Schritt S10): sperren, löschen. Nach dem Löschen gibt es nichts mehr zu entsperren.
    this.client.stateful = session_types.stateful;
    const sperre = await this.client.lock(objekt.url);
    try {
      await this.client.deleteObject(objekt.url, sperre.LOCK_HANDLE);
    } catch (fehler) {
      await this.client.unLock(objekt.url, sperre.LOCK_HANDLE).catch(() => {});
      throw fehler;
    } finally {
      this.client.stateful = session_types.stateless;
    }
  }

  async unitTests(objekt: AdtObjekt): Promise<TestErgebnis> {
    await this.benutzer();
    const klassen = await this.client.unitTestRun(objekt.url);
    const fehler: TestErgebnis["fehler"] = [];
    let methoden = 0;
    for (const klasse of klassen) {
      for (const alarm of klasse.alerts ?? []) fehler.push({ klasse: klasse["adtcore:name"], methode: "", text: [alarm.title, ...alarm.details].join(" ") });
      for (const methode of klasse.testmethods ?? []) {
        methoden++;
        for (const alarm of methode.alerts ?? []) {
          fehler.push({ klasse: klasse["adtcore:name"], methode: methode["adtcore:name"], text: [alarm.title, ...alarm.details].join(" ") });
        }
      }
    }
    return { methoden, fehler };
  }

  async atc(objekt: AdtObjekt, variante: string): Promise<AtcBefund[]> {
    await this.benutzer();
    // Ohne eingestellte Variante gilt die des Systems (so macht es auch die ABAP-Erweiterung für VS Code).
    let name = variante;
    if (!name) {
      const einstellungen = await this.client.atcCustomizing();
      name = String(einstellungen.properties.find((p) => p.name === "systemCheckVariant")?.value ?? "DEFAULT");
    }
    const lauf = await this.client.createAtcRun(await this.client.atcCheckVariant(name), objekt.url, 100);
    const liste = await this.client.atcWorklists(lauf.id, lauf.timestamp, "", false);
    return liste.objects.flatMap((o) =>
      o.findings.map((b) => ({
        prioritaet: b.priority,
        pruefung: b.checkTitle,
        text: b.messageTitle,
        zeile: b.location?.range?.start?.line ?? null,
      })),
    );
  }

  async beenden(): Promise<void> {
    if (this.angemeldet) await this.client.dropSession().catch(() => {});
  }
}
