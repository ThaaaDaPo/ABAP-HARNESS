// Die Tools eines MCP-Servers mit ihrer Regel im Tool-Gateway.
// Eine Änderung wirkt sofort, auch für Agenten, die gerade arbeiten.
import type { McpServer, ToolRegel } from "../../gemeinsam/typen.ts";

const regelTexte: Record<ToolRegel, string> = {
  erlauben: "Erlauben",
  melden: "Erlauben + melden",
  freigabe: "Freigabe nötig",
  verbieten: "Verbieten",
};

const regelErklaerung: Record<ToolRegel, string> = {
  erlauben: "wird ausgeführt",
  melden: "wird ausgeführt, Meldung im Postfach",
  freigabe: "wird nicht ausgeführt, sondern als Vorschlag ins Postfach gelegt",
  verbieten: "wird dem Agenten nicht angeboten und abgelehnt",
};

const alleRegeln = Object.keys(regelTexte) as ToolRegel[];

interface Eigenschaften {
  server: McpServer;
  /** tool "*" = Standardregel; regel "standard" = eigene Regel des Tools entfernen */
  setzeRegel: (tool: string, regel: ToolRegel | "standard") => void;
  beschaeftigt: boolean;
}

export function ToolRegeln({ server, setzeRegel, beschaeftigt }: Eigenschaften) {
  return (
    <div className="tool-regeln">
      <label className="standard-regel">
        Standardregel für alle Tools ohne eigene Regel (auch für neue)
        <select value={server.standardRegel} onChange={(e) => setzeRegel("*", e.target.value as ToolRegel)} disabled={beschaeftigt}>
          {alleRegeln.map((regel) => (
            <option key={regel} value={regel}>
              {regelTexte[regel]} – {regelErklaerung[regel]}
            </option>
          ))}
        </select>
      </label>

      {server.tools.length === 0 ? (
        <p className="leer">Noch keine Tools ausgelesen.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Beschreibung</th>
              <th>Regel</th>
            </tr>
          </thead>
          <tbody>
            {server.tools.map((tool) => {
              const eigene = server.regeln[tool.name];
              return (
                <tr key={tool.name}>
                  <td className="tool-name">
                    {tool.name}
                    {tool.nurLesend && <span className="marke-lesend" title="Laut Server ändert dieses Tool nichts">nur lesend</span>}
                  </td>
                  <td className="tool-beschreibung">{tool.beschreibung}</td>
                  <td>
                    <select
                      className={eigene ? `regel-${eigene}` : "regel-standard"}
                      value={eigene ?? "standard"}
                      onChange={(e) => setzeRegel(tool.name, e.target.value as ToolRegel | "standard")}
                      disabled={beschaeftigt}
                    >
                      <option value="standard">Standard ({regelTexte[server.standardRegel]})</option>
                      {alleRegeln.map((regel) => (
                        <option key={regel} value={regel}>
                          {regelTexte[regel]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
