import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useServers } from "../hooks";

const ACTION_GROUPS = [
  ["", "Todas"],
  ["server.", "Servidores"],
  ["terminal.", "Terminal"],
  ["player.", "Jugadores"],
  ["mod.", "Mods"],
  ["backup.", "Backups"],
  ["world.", "Mundos"],
  ["auth.", "Accesos"],
];

export default function Audit() {
  const { servers } = useServers();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ serverId: "", action: "", q: "" });
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(
    async (before) => {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.serverId) params.set("serverId", filters.serverId);
      if (filters.action) params.set("action", filters.action);
      if (filters.q) params.set("q", filters.q);
      if (before) params.set("before", before);
      const data = await api.get(`/api/audit?${params}`).catch(() => []);
      setRows((prev) => (before ? [...prev, ...data] : data));
      setHasMore(data.length === 100);
    },
    [filters]
  );

  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Auditoría</h2>
          <p className="subtitle">Todas las acciones realizadas desde el panel.</p>
        </div>
        <div className="row">
          <select className="select" style={{ width: 180 }} value={filters.serverId} onChange={set("serverId")}>
            <option value="">Todos los servidores</option>
            {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="select" style={{ width: 150 }} value={filters.action} onChange={set("action")}>
            {ACTION_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input" style={{ width: 200 }} placeholder="Buscar" value={filters.q} onChange={set("q")} />
        </div>
      </div>
      <div className="glass-card card table-wrap">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Servidor</th><th>Objetivo</th><th>Detalles</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.ts).toLocaleString()}</td>
                <td><span className="tag mono">{r.action}</span></td>
                <td>{r.server_id ? <Link to={`/servers/${r.server_id}`}>{r.server_name || `#${r.server_id}`}</Link> : "—"}</td>
                <td className="mono text-xs">{r.target || "—"}</td>
                <td className="mono text-xs" style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.details || ""}>
                  {r.details || "—"}
                </td>
                <td className="mono text-xs muted">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Sin entradas.</div>}
        {hasMore && (
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => load(rows[rows.length - 1].id)}>Cargar más</button>
          </div>
        )}
      </div>
    </div>
  );
}
