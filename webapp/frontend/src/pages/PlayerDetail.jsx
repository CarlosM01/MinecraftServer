import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { ErrorNotice } from "../components/ui";
import { avatarUrl, formatDate, formatDuration } from "../utils";

export default function PlayerDetail() {
  const { uuid } = useParams();
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/api/players/${encodeURIComponent(uuid)}`).then(setPlayer).catch((e) => setError(e.message));
  }, [uuid]);

  if (error) return <ErrorNotice error={error} />;
  if (!player) return <div className="empty"><span className="spinner" /></div>;

  const total = player.perServer.reduce((s, x) => s + (x.playtime_s || 0), 0);

  return (
    <div className="stack">
      <div className="page-header">
        <div className="row">
          <img src={avatarUrl(player, 64)} alt="" style={{ width: 64, height: 64, imageRendering: "pixelated", borderRadius: 8 }} />
          <div>
            <div className="row"><Link to="/players" className="muted">Jugadores</Link><span className="muted">/</span><h2>{player.name}</h2></div>
            <p className="subtitle mono text-xs">{player.uuid}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-3">
        <div className="glass-card card"><div className="muted text-xs">TIEMPO JUGADO</div><div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatDuration(total)}</div></div>
        <div className="glass-card card"><div className="muted text-xs">PRIMERA VEZ</div><div>{formatDate(player.first_seen)}</div></div>
        <div className="glass-card card"><div className="muted text-xs">ÚLTIMA VEZ</div><div>{formatDate(player.last_seen)}</div></div>
      </div>
      <div className="glass-card card table-wrap">
        <div className="card-title">Por servidor</div>
        <table className="table">
          <thead><tr><th>Servidor</th><th>Sesiones</th><th>Tiempo jugado</th><th>Última entrada</th></tr></thead>
          <tbody>
            {player.perServer.map((s) => (
              <tr key={s.server_id}>
                <td><Link to={`/servers/${s.server_id}/players`}>{s.server_name}</Link></td>
                <td>{s.sessions}</td>
                <td>{formatDuration(s.playtime_s)}</td>
                <td>{formatDate(s.last_joined)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="glass-card card table-wrap">
        <div className="card-title">Sesiones</div>
        <table className="table">
          <thead><tr><th>Servidor</th><th>Entrada</th><th>Salida</th><th>Duración</th><th>IP</th></tr></thead>
          <tbody>
            {player.sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.server_name}</td>
                <td>{formatDate(s.joined_at)}</td>
                <td>{s.left_at ? formatDate(s.left_at) : <span className="text-success">en línea</span>}</td>
                <td>{formatDuration(s.duration_s)}</td>
                <td className="mono muted">{s.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
