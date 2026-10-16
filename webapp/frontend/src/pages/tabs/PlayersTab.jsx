import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { usePlayers } from "../../hooks";
import { ConfirmDialog, ErrorNotice } from "../../components/ui";
import { avatarUrl, formatDate, formatDuration, timeAgo } from "../../utils";

function Avatar({ player }) {
  return <img className="avatar" src={avatarUrl(player)} alt="" loading="lazy" />;
}

/** Re-render every second so session durations tick. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const ACTION_LABELS = {
  kick: "Expulsar",
  ban: "Banear",
  pardon: "Desbanear",
  op: "Dar OP",
  deop: "Quitar OP",
  "whitelist-add": "Añadir a whitelist",
  "whitelist-remove": "Quitar de whitelist",
};

export default function PlayersTab({ server, running }) {
  const { online, max, events } = usePlayers(server.id);
  const [view, setView] = useState("online");
  const [lists, setLists] = useState(null);
  const [history, setHistory] = useState([]);
  const [known, setKnown] = useState([]);
  const [pending, setPending] = useState(null); // { action, name }
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const now = useNow();
  const isOnline = server.runtime?.status === "online";

  const loadLists = useCallback(() => {
    api.get(`/api/servers/${server.id}/players/lists`).then(setLists).catch(() => {});
  }, [server.id]);

  useEffect(() => {
    loadLists();
  }, [loadLists, events.length]);

  useEffect(() => {
    if (view === "history") api.get(`/api/servers/${server.id}/players/history?limit=200`).then(setHistory).catch(() => {});
    if (view === "known") api.get(`/api/servers/${server.id}/players/known`).then(setKnown).catch(() => {});
  }, [view, server.id, events.length]);

  const doAction = async () => {
    const { action, name } = pending;
    setError(null);
    try {
      const res = await api.post(`/api/servers/${server.id}/players/${encodeURIComponent(name)}/${action}`, { reason });
      setMessage(res.output || `${ACTION_LABELS[action]}: ${name}`);
      setTimeout(loadLists, 800);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(null);
      setReason("");
    }
  };

  const ask = (action, name) => setPending({ action, name });

  const ops = new Set((lists?.ops || []).map((o) => o.name?.toLowerCase()));
  const whitelisted = new Set((lists?.whitelist || []).map((o) => o.name?.toLowerCase()));

  const actionsFor = (name) => (
    <div className="row" style={{ justifyContent: "flex-end" }}>
      <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask("kick", name)}>Expulsar</button>
      <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask("ban", name)}>Banear</button>
      {ops.has(name.toLowerCase()) ? (
        <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask("deop", name)}>Quitar OP</button>
      ) : (
        <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask("op", name)}>OP</button>
      )}
      {!whitelisted.has(name.toLowerCase()) && (
        <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask("whitelist-add", name)}>Whitelist</button>
      )}
    </div>
  );

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          {[["online", `En línea (${online.length}${max ? `/${max}` : ""})`], ["history", "Historial"], ["known", "Todos"], ["lists", "Whitelist / OPs / Bans"]].map(([v, l]) => (
            <button key={v} className={`btn btn-sm ${view === v ? "btn-primary" : "btn-ghost"}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
        {!running && <span className="muted text-xs">El servidor está detenido: las acciones requieren que esté en línea.</span>}
      </div>
      <ErrorNotice error={error} />
      {message && <div className="notice ok row between"><span className="mono">{message}</span><button className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>✕</button></div>}

      {view === "online" && (
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(260px, 1fr)" }}>
          <div className="glass-card card table-wrap">
            {online.length === 0 ? (
              <div className="empty">No hay nadie conectado.</div>
            ) : (
              <table className="table">
                <thead><tr><th>Jugador</th><th>Sesión</th><th>IP</th><th /></tr></thead>
                <tbody>
                  {online.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <Link to={`/players/${encodeURIComponent(p.uuid)}`} className="player-cell" style={{ color: "inherit" }}>
                          <Avatar player={p} /> {p.name}
                          {ops.has(p.name.toLowerCase()) && <span className="tag">OP</span>}
                        </Link>
                      </td>
                      <td>{formatDuration((now - new Date(p.joinedAt).getTime()) / 1000)}</td>
                      <td className="mono muted">{p.ip || "—"}</td>
                      <td className="actions">{actionsFor(p.name)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="glass-card card">
            <div className="card-title">Actividad en vivo</div>
            <div className="feed">
              {events.length === 0 && <span className="muted">Sin eventos desde que abriste la página.</span>}
              {events.map((e, i) => (
                <div key={i} className="row">
                  <span className={e.type === "join" ? "text-success" : "muted"}>{e.type === "join" ? "→" : "←"}</span>
                  <strong>{e.name}</strong>
                  <span className="muted">{e.type === "join" ? "entró" : "salió"}</span>
                  <span className="muted text-xs" style={{ marginLeft: "auto" }}>{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === "history" && (
        <div className="glass-card card table-wrap">
          <table className="table">
            <thead><tr><th>Jugador</th><th>Entrada</th><th>Salida</th><th>Duración</th><th>IP</th></tr></thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/players/${encodeURIComponent(s.uuid)}`} className="player-cell" style={{ color: "inherit" }}><Avatar player={s} /> {s.name}</Link></td>
                  <td>{formatDate(s.joined_at)}</td>
                  <td>{s.left_at ? formatDate(s.left_at) : <span className="text-success">en línea</span>}</td>
                  <td>{formatDuration(s.duration_s)}</td>
                  <td className="mono muted">{s.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <div className="empty">Sin sesiones registradas.</div>}
        </div>
      )}

      {view === "known" && (
        <div className="glass-card card table-wrap">
          <table className="table">
            <thead><tr><th>Jugador</th><th>Sesiones</th><th>Tiempo jugado</th><th>Última vez</th><th /></tr></thead>
            <tbody>
              {known.map((p) => (
                <tr key={p.uuid}>
                  <td><Link to={`/players/${encodeURIComponent(p.uuid)}`} className="player-cell" style={{ color: "inherit" }}><Avatar player={p} /> {p.name}</Link></td>
                  <td>{p.sessions}</td>
                  <td>{formatDuration(p.playtime_s)}</td>
                  <td>{p.onlineServerId === server.id ? <span className="text-success">en línea</span> : timeAgo(p.last_seen)}</td>
                  <td className="actions">{actionsFor(p.name)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {known.length === 0 && <div className="empty">Ningún jugador ha entrado todavía.</div>}
        </div>
      )}

      {view === "lists" && lists && (
        <div className="stack">
          <div className="glass-card card row">
            <input className="input" style={{ maxWidth: 260 }} placeholder="Nombre de jugador" value={newName} onChange={(e) => setNewName(e.target.value.trim())} />
            <button className="btn btn-sm btn-muted" disabled={!newName || !isOnline} onClick={() => ask("whitelist-add", newName)}>Añadir a whitelist</button>
            <button className="btn btn-sm btn-muted" disabled={!newName || !isOnline} onClick={() => ask("op", newName)}>Dar OP</button>
            <button className="btn btn-sm btn-danger" disabled={!newName || !isOnline} onClick={() => ask("ban", newName)}>Banear</button>
            <span className="muted text-xs">Whitelist {lists.whitelistEnabled ? "activada" : "desactivada"} (se cambia en Ajustes).</span>
          </div>
          <div className="grid grid-3">
            {[
              ["Whitelist", lists.whitelist, "whitelist-remove", "Quitar"],
              ["Operadores", lists.ops, "deop", "Quitar OP"],
              ["Baneados", lists.bannedPlayers, "pardon", "Desbanear"],
            ].map(([title, items, action, label]) => (
              <div className="glass-card card" key={title}>
                <div className="card-title">{title} ({items.length})</div>
                {items.length === 0 && <span className="muted">Vacío</span>}
                <div className="stack" style={{ gap: 8 }}>
                  {items.map((it) => (
                    <div className="row between" key={it.uuid || it.name}>
                      <span className="player-cell"><Avatar player={it} /> {it.name}</span>
                      <span className="row">
                        {it.reason && <span className="muted text-xs" title={it.reason}>“{it.reason.slice(0, 24)}”</span>}
                        <button className="btn btn-ghost btn-sm" disabled={!isOnline} onClick={() => ask(action, it.name)}>{label}</button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {lists.bannedIps.length > 0 && (
            <div className="glass-card card">
              <div className="card-title">IPs baneadas ({lists.bannedIps.length})</div>
              <div className="mono text-xs">{lists.bannedIps.map((b) => b.ip).join(", ")}</div>
            </div>
          )}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={`${ACTION_LABELS[pending.action]} a ${pending.name}`}
          confirmLabel={ACTION_LABELS[pending.action]}
          danger={["kick", "ban", "op"].includes(pending.action)}
          onCancel={() => setPending(null)}
          onConfirm={doAction}
        >
          {pending.action === "op" && <p>Los operadores pueden ejecutar cualquier comando en el servidor.</p>}
          {["kick", "ban"].includes(pending.action) && (
            <div className="form-group">
              <label>Motivo (opcional)</label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {!["op", "kick", "ban"].includes(pending.action) && <p>¿Confirmas la acción?</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
