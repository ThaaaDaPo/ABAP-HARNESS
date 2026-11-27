// Vergleich zweier Stände nebeneinander: links vorher (gelöschte Zeilen rot), rechts nachher
// (hinzugefügte Zeilen grün). Geänderte Zeilen stehen auf gleicher Höhe. Lange gleiche Abschnitte
// sind zusammengeklappt und lassen sich aufklappen.
import { useState } from "react";
import { vergleicheZeilen, type Schritt } from "../../gemeinsam/zeilenvergleich.ts";

/** So viele gleiche Zeilen bleiben um eine Änderung herum stehen */
const umfeld = 3;

type Seite = { nr: number; text: string; art: Schritt["art"] } | null;
type Reihe = { links: Seite; rechts: Seite };
type Abschnitt = { art: "reihen"; reihen: Reihe[] } | { art: "zugeklappt"; reihen: Reihe[] };

/** Gleiche Zeilen stehen links und rechts; ein Block aus Raus und Rein wird Zeile für Zeile gepaart. */
function bildeReihen(schritte: Schritt[]): Reihe[] {
  const reihen: Reihe[] = [];
  let i = 0;
  while (i < schritte.length) {
    const s = schritte[i];
    if (s.art === "gleich") {
      reihen.push({ links: { nr: s.zeileAlt, text: s.text, art: "gleich" }, rechts: { nr: s.zeileNeu, text: s.text, art: "gleich" } });
      i++;
      continue;
    }
    const raus: Schritt[] = [];
    const rein: Schritt[] = [];
    while (i < schritte.length && schritte[i].art !== "gleich") {
      (schritte[i].art === "raus" ? raus : rein).push(schritte[i]);
      i++;
    }
    for (let k = 0; k < Math.max(raus.length, rein.length); k++) {
      const r = raus[k];
      const n = rein[k];
      reihen.push({
        links: r ? { nr: r.zeileAlt, text: r.text, art: "raus" } : null,
        rechts: n ? { nr: n.zeileNeu, text: n.text, art: "rein" } : null,
      });
    }
  }
  return reihen;
}

const istGleich = (r: Reihe) => r.links?.art === "gleich";

/** Klappt gleiche Abschnitte zu, die weiter als `umfeld` Zeilen von einer Änderung entfernt sind. */
function bildeAbschnitte(reihen: Reihe[]): Abschnitt[] {
  const abschnitte: Abschnitt[] = [];
  const sichtbar = (r: Reihe[]) => {
    const letzter = abschnitte.at(-1);
    if (letzter?.art === "reihen") letzter.reihen.push(...r);
    else if (r.length > 0) abschnitte.push({ art: "reihen", reihen: [...r] });
  };
  let i = 0;
  while (i < reihen.length) {
    if (!istGleich(reihen[i])) {
      sichtbar([reihen[i++]]);
      continue;
    }
    let ende = i;
    while (ende < reihen.length && istGleich(reihen[ende])) ende++;
    const lauf = reihen.slice(i, ende);
    const vorn = i === 0 ? 0 : umfeld;
    const hinten = ende === reihen.length ? 0 : umfeld;
    // Nur zuklappen, wenn es sich lohnt (mehr als zwei Zeilen)
    if (lauf.length - vorn - hinten > 2) {
      sichtbar(lauf.slice(0, vorn));
      abschnitte.push({ art: "zugeklappt", reihen: lauf.slice(vorn, lauf.length - hinten) });
      sichtbar(lauf.slice(lauf.length - hinten));
    } else {
      sichtbar(lauf);
    }
    i = ende;
  }
  return abschnitte;
}

function Zellen({ seite }: { seite: Seite }) {
  if (!seite) return <><td className="nr leer" /><td className="code leer" /></>;
  return (
    <>
      <td className={`nr ${seite.art}`}>{seite.nr}</td>
      <td className={`code ${seite.art}`}>{seite.text || " "}</td>
    </>
  );
}

export function Nebeneinander({ vorher, nachher, titel }: { vorher: string; nachher: string; titel: string }) {
  const schritte = vergleicheZeilen(vorher, nachher);
  const abschnitte = bildeAbschnitte(bildeReihen(schritte));
  const [aufgeklappt, setAufgeklappt] = useState<Set<number>>(new Set());
  const raus = schritte.filter((s) => s.art === "raus").length;
  const rein = schritte.filter((s) => s.art === "rein").length;

  return (
    <div className="nebeneinander">
      <div className="nebeneinander-kopf">
        <span className="tool-name">{titel}</span>
        <span className="zaehler-raus">−{raus}</span>
        <span className="zaehler-rein">+{rein}</span>
      </div>
      <div className="nebeneinander-rahmen">
        <table>
          <colgroup>
            <col className="spalte-nr" />
            <col />
            <col className="spalte-nr" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={2}>Vorher</th>
              <th colSpan={2}>Nachher</th>
            </tr>
          </thead>
          <tbody>
            {abschnitte.flatMap((abschnitt, a) => {
              if (abschnitt.art === "zugeklappt" && !aufgeklappt.has(a)) {
                return [
                  <tr key={a} className="zugeklappt">
                    <td colSpan={4}>
                      <button onClick={() => setAufgeklappt(new Set(aufgeklappt).add(a))}>
                        … {abschnitt.reihen.length} gleiche Zeilen anzeigen
                      </button>
                    </td>
                  </tr>,
                ];
              }
              return abschnitt.reihen.map((reihe, r) => (
                <tr key={`${a}-${r}`}>
                  <Zellen seite={reihe.links} />
                  <Zellen seite={reihe.rechts} />
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
