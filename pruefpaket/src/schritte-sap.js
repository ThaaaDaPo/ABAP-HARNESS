// S-Schritte: ADT mit Browser-Cookie (T2 bis T4).
// Legt genau ein Testprogramm in $TMP an und loescht es am Ende wieder.
import { holeCookie } from "./cookie.js";

const PAKET = "$TMP";

function quelltextGut(name) {
  return [
    `REPORT ${name.toLowerCase()}.`,
    "",
    "CLASS ltc_pruefung DEFINITION FINAL FOR TESTING",
    "  DURATION SHORT RISK LEVEL HARMLESS.",
    "  PRIVATE SECTION.",
    "    METHODS addiert FOR TESTING.",
    "ENDCLASS.",
    "",
    "CLASS ltc_pruefung IMPLEMENTATION.",
    "  METHOD addiert.",
    "    cl_abap_unit_assert=>assert_equals( act = 1 + 1 exp = 2 ).",
    "  ENDMETHOD.",
    "ENDCLASS.",
    "",
  ].join("\n");
}

function quelltextFehlerhaft(name) {
  return [`REPORT ${name.toLowerCase()}.`, "", "WRITE harness_unbekannte_variable.", ""].join("\n");
}

function pruefeConfig(sap) {
  if (!sap?.url || sap.url.includes("HOST:PORT")) throw new Error("config.json: sap.url ist nicht gesetzt");
  if (!sap.benutzer || sap.benutzer === "DEIN_SAP_USER") throw new Error("config.json: sap.benutzer ist nicht gesetzt");
  const name = String(sap.testProgramm ?? "").toUpperCase();
  if (!/^[ZY][A-Z0-9_]{2,29}$/.test(name)) throw new Error("config.json: sap.testProgramm muss mit Z oder Y beginnen");
  return name;
}

export async function pruefeSap(bericht, config) {
  const sap = config.sap ?? {};
  let name;
  let client = null;
  let adt = null;
  let cookieZeile = null;
  let angelegt = false;
  let objektUrl = "";
  let quellUrl = "";
  let version = "active";

  const configOk = await bericht.schritt("S1", "Konfiguration", async () => {
    name = pruefeConfig(sap);
    objektUrl = `/sap/bc/adt/programs/programs/${name.toLowerCase()}`;
    quellUrl = `${objektUrl}/source/main`;
    return `${new URL(sap.url).host} Mandant ${sap.mandant} Testprogramm ${name}`;
  });

  const cookieHolen = async () => {
    const ergebnis = await holeCookie({ url: sap.url, cookieNamen: sap.cookieNamen ?? ["MYSAPSSO2"], edgePfad: sap.edgePfad });
    cookieZeile = ergebnis.cookieZeile;
    return ergebnis;
  };

  const cookieOk = await bericht.schritt(
    "S2",
    "Cookie ueber Edge holen",
    async () => {
      const { namen } = await cookieHolen();
      return { kurz: `${namen.length} Cookies`, lang: `Cookie-Namen: ${namen.join(", ")}` };
    },
    { voraussetzung: configOk },
  );

  const angemeldet = await bericht.schritt(
    "S3",
    "ADT-Anmeldung mit Cookie",
    async () => {
      const modul = await import("abap-adt-api");
      adt = modul.default ?? modul;
      const optionen = adt.createCookieSessionOptions({
        id: "abap-harness-pruefpaket",
        loadCookies: async () => cookieZeile ?? undefined,
        acquireCookies: async () => (await cookieHolen()).cookieZeile,
      });
      // sap.url darf einen Pfad enthalten (wird fuer das Cookie 1:1 aufgerufen); ADT braucht nur Protokoll, Host und Port.
      client = new adt.ADTClient(new URL(sap.url).origin, sap.benutzer, "", sap.mandant ?? "", sap.sprache ?? "DE", optionen);
      await client.login();
      return `angemeldet als ${client.username}`;
    },
    { voraussetzung: cookieOk },
  );

  await bericht.schritt(
    "S4",
    "Quelltext lesen",
    async () => {
      const klasse = String(sap.leseKlasse ?? "CL_ABAP_CHAR_UTILITIES").toLowerCase();
      const quelle = await client.getObjectSource(`/sap/bc/adt/oo/classes/${klasse}/source/main`);
      if (!quelle || quelle.length < 20) throw new Error("leerer Quelltext");
      return `${klasse}: ${quelle.split("\n").length} Zeilen`;
    },
    { voraussetzung: angemeldet },
  );

  const sperrenUnd = async (aktion) => {
    client.stateful = adt.session_types.stateful;
    const sperre = await client.lock(objektUrl);
    try {
      return await aktion(sperre.LOCK_HANDLE);
    } finally {
      await client.unLock(objektUrl, sperre.LOCK_HANDLE).catch(() => {});
    }
  };

  const loeschen = async () => {
    client.stateful = adt.session_types.stateful;
    const sperre = await client.lock(objektUrl);
    try {
      await client.deleteObject(objektUrl, sperre.LOCK_HANDLE);
    } catch (e) {
      await client.unLock(objektUrl, sperre.LOCK_HANDLE).catch(() => {});
      throw e;
    }
    angelegt = false;
  };

  try {
    const erstellt = await bericht.schritt(
      "S5",
      `Testprogramm in ${PAKET} anlegen`,
      async () => {
        const treffer = (await client.searchObject(name, "PROG")).filter(
          (t) => t["adtcore:name"]?.toUpperCase() === name,
        );
        let hinweis = "";
        if (treffer.length > 0) {
          const paket = treffer[0]["adtcore:packageName"];
          if (paket !== PAKET)
            throw new Error(`${name} existiert bereits im Paket ${paket ?? "?"} - wird nicht angefasst. Anderen Namen in der Config waehlen.`);
          await loeschen();
          hinweis = " (Rest eines frueheren Laufs vorher geloescht)";
        }
        await client.createObject("PROG/P", name, PAKET, "ABAP-Harness Pruefpaket", `/sap/bc/adt/packages/${encodeURIComponent(PAKET)}`, sap.benutzer);
        angelegt = true;
        return `angelegt${hinweis}`;
      },
      { voraussetzung: angemeldet },
    );

    await bericht.schritt(
      "S6",
      "Syntaxpruefung mit ungespeichertem Quelltext",
      async () => {
        const vorher = await client.getObjectSource(quellUrl).catch(() => "");
        const pruefe = async (quelle, v) => client.syntaxCheck(quellUrl, quellUrl, quelle, "", v);
        let meldungen;
        try {
          meldungen = await pruefe(quelltextFehlerhaft(name), "active");
          if (meldungen.length === 0) throw new Error("keine Meldung mit version=active");
        } catch (erster) {
          version = "inactive";
          meldungen = await pruefe(quelltextFehlerhaft(name), "inactive").catch((zweiter) => {
            throw new Error(`active: ${erster.message} / inactive: ${zweiter.message}`);
          });
        }
        const fehler = meldungen.filter((m) => /^[EAX]/i.test(m.severity ?? ""));
        if (fehler.length === 0) throw new Error(`Fehlerhafter Quelltext wurde nicht bemaengelt (${meldungen.length} Meldungen)`);
        const sauber = (await pruefe(quelltextGut(name), version)).filter((m) => /^[EAX]/i.test(m.severity ?? ""));
        if (sauber.length > 0) throw new Error(`Korrekter Quelltext wurde bemaengelt: ${sauber[0].text}`);
        const nachher = await client.getObjectSource(quellUrl).catch(() => "");
        if (nachher !== vorher) throw new Error("Die Pruefung hat den gespeicherten Quelltext veraendert");
        return {
          kurz: `Fehler in Zeile ${fehler[0].line} erkannt, nichts gespeichert (version=${version})`,
          lang: meldungen.map((m) => `${m.severity} ${m.line},${m.offset} ${m.text}`).join("\n"),
        };
      },
      { voraussetzung: erstellt },
    );

    const gespeichert = await bericht.schritt(
      "S7",
      "Sperren, speichern, entsperren",
      async () => {
        await sperrenUnd((handle) => client.setObjectSource(quellUrl, quelltextGut(name), handle));
        const gelesen = await client.getObjectSource(quellUrl, { version: "inactive" }).catch(() => client.getObjectSource(quellUrl));
        if (!gelesen.includes("ltc_pruefung")) throw new Error("gespeicherter Quelltext ist nicht lesbar");
        return "gespeichert und zurueckgelesen";
      },
      { voraussetzung: erstellt },
    );

    const aktiviert = await bericht.schritt(
      "S8",
      "Aktivieren",
      async () => {
        const ergebnis = await client.activate(name, objektUrl);
        if (!ergebnis.success)
          throw new Error(`nicht aktiviert: ${ergebnis.messages.map((m) => m.shortText).join("; ").slice(0, 160)}`);
        return `aktiv, ${ergebnis.messages.length} Meldungen`;
      },
      { voraussetzung: gespeichert },
    );

    await bericht.schritt(
      "S9",
      "ABAP Unit ausfuehren",
      async () => {
        const klassen = await client.unitTestRun(objektUrl);
        const methoden = klassen.flatMap((k) => k.testmethods ?? []);
        const alarme = [...klassen.flatMap((k) => k.alerts ?? []), ...methoden.flatMap((m) => m.alerts ?? [])];
        if (methoden.length === 0) throw new Error("keine Testmethode gefunden");
        if (alarme.length > 0) throw new Error(`Test meldet: ${alarme[0].title}`);
        return `${methoden.length} Testmethode(n) erfolgreich`;
      },
      { voraussetzung: aktiviert },
    );

    await bericht.schritt(
      "S10",
      "Testprogramm loeschen",
      async () => {
        await loeschen();
        return "geloescht";
      },
      { voraussetzung: erstellt },
    );
  } finally {
    if (client && angelegt) {
      try {
        await loeschen();
        console.log(`     Aufraeumen: ${name} nachtraeglich geloescht`);
      } catch (e) {
        console.log(`     ACHTUNG: ${name} konnte nicht geloescht werden - bitte von Hand in ${PAKET} loeschen (${e.message})`);
      }
    }
    if (client) await client.dropSession().catch(() => {});
  }
}
