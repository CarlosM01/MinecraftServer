import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useServers } from "../hooks";
import { useSocketEvent } from "../socket";
import { avatarUrl, formatDuration, timeAgo } from "../utils";

export default function Players() {
  const { servers } = useServers();
  const [players, setPlayers] = useState([]);
  const [filter, setFilter] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.get("/api/players").then(setPlayers).catch(() => {});
  }, [tick]);

  // Refresh on join/leave anywhere
  useSocketEvent("players:event", () => setTick((t) => t + 1));

  const names = useMemo(() => Object.fromEntries(servers.map((s) => [s.id, s.name])), [servers]);
  const shown = players.filter(
    (p) => (!onlyOnline || p.onlineServerId) && p.name.toLowerCase().includes(filter.toLowerCase())
  );
  const onlineCount = players.filter((p) => p.onlineServerId).length;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Jugadores</h2>
          <p className="subtitle">{players.length} conocidos · {onlineCount} en línea ahora</p>
        </div>
        <div className="row">
          <input className="input" style={{ width: 220 }} placeholder="Buscar jugador" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <label className="checkbox"><input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} /> Solo en línea</label>
        </div>
      </div>
      <div className="glass-card card table-wrap">
        <table className="table">
          <thead><tr><th>Jugador</th><th>Estado</th><th>Sesiones</th><th>Tiempo jugado</th><th>Primera vez</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.uuid}>
                <td>
                  <Link to={`/players/${encodeURIComponent(p.uuid)}`} className="player-cell" style={{ color: "inherit" }}>
                    <img className="avatar" src={avatarUrl(p)} alt="" loading="lazy" /> {p.name}
                  </Link>
                </td>
                <td>
                  {p.onlineServerId ? (
                    <Link to={`/servers/${p.onlineServerId}/players`} className="pill online">{names[p.onlineServerId] || "En línea"}</Link>
                  ) : (
                    <span className="muted">{timeAgo(p.last_seen)}</span>
                  )}
                </td>
                <td>{p.sessions}</td>
                <td>{formatDuration(p.playtime_s)}</td>
                <td className="muted">{new Date(p.first_seen).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">Sin jugadores.</div>}
      </div>
    </div>
  );
}
