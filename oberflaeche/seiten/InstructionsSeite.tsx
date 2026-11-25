// Instructions & Skills: links alles aus dem Instructions-Ordner, rechts die gewählte Datei mit
// Vorschau (Markdown) oder zum Bearbeiten. Die Dateien bleiben die Wahrheit (E-30); zugeordnet wird
// auf der Agenten-Seite.
import { useEffect, useState } from "react";
import type { InstructionsUebersicht } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { Markdown } from "../komponenten/Markdown.tsx";

/** Der Kopf (Frontmatter) wird getrennt gezeigt; in der Vorschau stört er. */
function trenneKopf(text: string): { kopf: string; inhalt: string } {
  const treffer = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  return treffer ? { kopf: treffer[1], inhalt: text.slice(treffer[0].length) } : { kopf: "", inhalt: text };
}

export function InstructionsSeite() {
  const [uebersicht, setUebersicht] = useState<InstructionsUebersicht | null>(null);
  /** Pfad der gewählten Datei (bei Skills die SKILL.md) */
  const [datei, setDatei] = useState<string | null>(null);
  const [inhalt, setInhalt] = useState("");
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  useEffect(() => {
    api.holeInstructions().then(setUebersicht).catch((e) => setFehler(e.message));
  }, []);

  useEffect(() => {
    setEntwurf(null);
    setInhalt("");
    if (!datei) return;
    api
      .holeInstructionDatei(datei)
      .then((d) => setInhalt(d.inhalt))
      .catch((e) => setFehler(e.message));
  }, [datei]);

  function waehle(pfad: string) {
    if (entwurf !== null && entwurf !== inhalt && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
    setFehler(null);
    setDatei(pfad);
  }

  async function speichere() {
    if (!datei || entwurf === null) return;
    setBeschaeftigt(true);
    setFehler(null);
    try {
      setUebersicht(await api.speichereInstructionDatei(datei, entwurf));
      setInhalt(entwurf);
      setEntwurf(null);
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  async function legeAn(art: "instruction" | "skill") {
    const name = prompt(
      art === "skill"
        ? "Name des Skills (Ordnername, z. B. abap-review):"
        : "Name der Instruction (z. B. abap-klassen – daraus wird abap-klassen.instructions.md):",
    );
    if (!name) return;
    setFehler(null);
    try {
      const { pfad, uebersicht } = await api.legeInstructionAn(art, name.trim());
      setUebersicht(uebersicht);
      setDatei(pfad);
    } catch (e) {
      setFehler((e as Error).message);
    }
  }

  const skill = uebersicht?.skills.find((s) => `${s.pfad}/SKILL.md` === datei) ?? null;
  const instruction = uebersicht?.instructions.find((i) => i.pfad === datei) ?? null;
  const zugeordnet = skill?.agenten ?? instruction?.agenten ?? [];
  const { kopf, inhalt: text } = trenneKopf(inhalt);

  return (
    <div className="zweispaltig">
      <aside className="seiten-liste">
        <div className="knopfreihe">
          <button className="knopf haupt" onClick={() => legeAn("instruction")} disabled={!!uebersicht?.fehler}>
            Neue Instruction
          </button>
          <button className="knopf" onClick={() => legeAn("skill")} disabled={!!uebersicht?.fehler}>
            Neuer Skill
          </button>
        </div>

        <div className="listen-titel">Instructions</div>
        {uebersicht?.instructions.length === 0 && <p className="leer">Keine.</p>}
        {uebersicht?.instructions.map((i) => (
          <button key={i.pfad} className={i.pfad === datei ? "listen-eintrag aktiv" : "listen-eintrag"} onClick={() => waehle(i.pfad)} title={i.pfad}>
            <span className="chat-titel">{i.pfad.replace(/\.instructions\.md$/, "")}</span>
          </button>
        ))}

        <div className="listen-titel">Skills</div>
        {uebersicht?.skills.length === 0 && <p className="leer">Keine.</p>}
        {uebersicht?.skills.map((s) => {
          const pfad = `${s.pfad}/SKILL.md`;
          return (
            <button key={s.pfad} className={pfad === datei ? "listen-eintrag aktiv" : "listen-eintrag"} onClick={() => waehle(pfad)} title={s.pfad}>
              <span className="chat-titel">{s.name}</span>
            </button>
          );
        })}
      </aside>

      <section className="detail">
        {uebersicht && (
          <p className="hinweis">
            Ordner: <code>{uebersicht.ordner}</code> (in einstellungen.json: <code>instructionsOrdner</code>)
          </p>
        )}
        {uebersicht?.fehler && <div className="fehlerleiste">{uebersicht.fehler}</div>}
        {fehler && <div className="fehlerleiste">{fehler}</div>}
        {!datei && !uebersicht?.fehler && <div className="leer mitte">Wähle links eine Datei oder lege eine neue an.</div>}

        {datei && (
          <>
            <div className="server-kopf">
              <h2>{skill ? skill.name : datei}</h2>
              <div className="knopfreihe">
                {entwurf === null ? (
                  <button className="knopf" onClick={() => setEntwurf(inhalt)}>
                    Bearbeiten
                  </button>
                ) : (
                  <>
                    <button className="knopf haupt" onClick={speichere} disabled={beschaeftigt || entwurf === inhalt}>
                      Speichern
                    </button>
                    <button className="knopf" onClick={() => setEntwurf(null)} disabled={beschaeftigt}>
                      Abbrechen
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="hinweis">
              {skill ? <>Datei <code>{datei}</code>. </> : null}
              {zugeordnet.length > 0 ? `Zugeordnet: ${zugeordnet.join(", ")}.` : "Keinem Agenten zugeordnet (Seite Agenten)."}
              {skill && skill.dateien.length > 0 && ` Weitere Dateien im Skill: ${skill.dateien.join(", ")}`}
            </p>

            {entwurf !== null ? (
              <>
                <textarea className="editor" value={entwurf} onChange={(e) => setEntwurf(e.target.value)} spellCheck={false} />
                <p className="hinweis">Gilt nach dem Speichern ab der nächsten Nachricht in jedem Chat eines zugeordneten Agenten.</p>
              </>
            ) : (
              <>
                {kopf && <pre className="frontmatter">{kopf}</pre>}
                <div className="vorschau">
                  <Markdown text={text} />
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
