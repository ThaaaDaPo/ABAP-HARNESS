// Regeln eines Agenten je Tool, für jeden Server, den er benutzen darf. Änderungen wirken sofort.
import { useEffect, useState } from "react";
import type { ServerRegeln, ToolRegel } from "../../gemeinsam/typen.ts";
import * as api from "../api.ts";
import { ToolRegeln } from "./ToolRegeln.tsx";

interface Eigenschaften {
  agentId: string;
  /** Die gespeicherten Server des Agenten – nur für diese gibt es hier Regeln */
  mcpServer: string[];
}

export function AgentRegeln({ agentId, mcpServer }: Eigenschaften) {
  const [regeln, setRegeln] = useState<ServerRegeln[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    api.holeRegelnDesAgenten(agentId).then(setRegeln).catch((e) => setFehler(e.message));
  }, [agentId]);

  async function setzeRegel(server: string, tool: string, regel: ToolRegel | "standard") {
    setBeschaeftigt(true);
    setFehler(null);
    try {
      setRegeln(await api.setzeToolRegel(agentId, server, tool, regel));
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setBeschaeftigt(false);
    }
  }

  const benutzt = regeln.filter((r) => mcpServer.includes(r.schluessel));

  return (
    <section className="agent-regeln">
      <h3>Regeln je Tool</h3>
      <p className="hinweis">Gelten nur für diesen Agenten und wirken sofort, auch in laufenden Chats.</p>
      {fehler && <div className="fehlerleiste">{fehler}</div>}
      {benutzt.length === 0 && <p className="leer">Der Agent benutzt keinen MCP-Server.</p>}
      {benutzt.map((server) => (
        <div key={server.schluessel} className="server-regeln">
          <h4>
            {server.name} <code>{server.schluessel}-…</code>
          </h4>
          <ToolRegeln server={server} setzeRegel={(tool, regel) => setzeRegel(server.schluessel, tool, regel)} beschaeftigt={beschaeftigt} />
        </div>
      ))}
    </section>
  );
}
