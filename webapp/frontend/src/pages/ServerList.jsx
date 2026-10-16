import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useServers } from "../hooks";
import { Meter, Modal, StatusPill, ErrorNotice } from "../components/ui";
import { useAction } from "../hooks/useAction";
import { formatBytes, formatMb, formatUptime, TYPE_LABELS } from "../utils";

function HostWidget({ servers }) {
  const [host, setHost] = useState(null);
  useEffect(() => {
    const load = () => api.get("/api/host").then(setHost).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [servers.length]);
  if (!host) return null;
  const usedMem = host.memTotalMb - host.memAvailableMb;
  return (
    <section className="glass-card card grid grid-3">
      <div className="stack" style={{ gap: 4 }}>
        <span className="muted text-xs">HOST</span>
        <strong>{host.hostname}</strong>
        <span className="muted text-xs">
          {host.cpus} CPU · carga {host.loadavg.map((l) => l.toFixed(2)).join(" / ")}
        </span>
      </div>
      <Meter label="RAM del host en uso" value={usedMem} max={host.memTotalMb} display={`${formatMb(usedMem)} / ${formatMb(host.memTotalMb)}`} />
      <Meter
        label="RAM asignada a servidores"
        value={host.allocatedMb}
        max={host.memTotalMb}
        display={`${formatMb(host.allocatedMb)} (${Math.round((host.allocatedMb / host.memTotalMb) * 100)}%)`}
      />
      {host.disk && (
        <Meter
          label="Disco"
          value={host.disk.totalBytes - host.disk.freeBytes}
          max={host.disk.totalBytes}
          display={`${formatBytes(host.disk.freeBytes)} libres`}
        />
      )}
    </section>
  );
}

function ServerCard({ server, live, onAction }) {
  const status = live?.status || server.runtime?.status;
  const running = status === "online" || status === "starting" || status === "restarting";
  const busy = Boolean(server.lock);
  return (
    <article className="glass-card server-card">
      <div className="row between">
        <h3>
          <Link to={`/servers/${server.id}`}>{server.name}</Link>
        </h3>
        <StatusPill status={status} />
      </div>
      <div className="row">
        <span className="tag">{TYPE_LABELS[server.type] || server.type}</span>
        <span className="tag">{server.version}</span>
        <span className="tag mono">:{server.port}</span>
        {busy && <span className="tag text-warning">{server.lock.op}…</span>}
      </div>
      {running && live ? (
        <div className="stack" style={{ gap: 8 }}>
          <Meter label="CPU" value={live.cpu || 0} max={100 * (server.cpu_limit || 1)} display={`${(live.cpu ?? 0).toFixed(1)}%`} />
          <Meter label="RAM" value={live.ram_mb || 0} max={live.ram_limit_mb || server.memory_mb} display={`${formatMb(live.ram_mb)} / ${formatMb(live.ram_limit_mb)}`} />
          <div className="row between text-xs muted">
            <span>
              👥 {live.players ?? 0}
              {live.max_players ? ` / ${live.max_players}` : ""} jugadores
            </span>
            <span>⏱ {formatUptime(live.uptime_ms || 0)}</span>
          </div>
        </div>
      ) : (
        <div className="muted text-xs">{formatMb(server.memory_mb)} RAM{server.cpu_limit ? ` · ${server.cpu_limit} CPU` : ""}</div>
      )}
      <div className="row">
        {running ? (
          <>
            <button className="btn btn-muted btn-sm" disabled={busy} onClick={() => onAction(server, "restart")}>Reiniciar</button>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onAction(server, "stop")}>Detener</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAction(server, "start")}>Iniciar</button>
        )}
        <Link className="btn btn-ghost btn-sm" to={`/servers/${server.id}/terminal`}>Terminal</Link>
      </div>
    </article>
  );
}

function ImportDialog({ onClose, onDone }) {
  const [form, setForm] = useState({
    name: "Servidor principal",
    dataDir: "data",
    type: "VANILLA",
    version: "LATEST",
    memory_mb: 4096,
    port: 25565,
    replaceContainer: "minecraft-server",
    start: false,
  });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = () =>
    run(async () => {
      const s = await api.post("/api/servers/import", { ...form, memory_mb: Number(form.memory_mb), port: Number(form.port) });
      onDone(s);
    });
  return (
    <Modal title="Importar servidor existente" onClose={onClose}>
      <p className="muted text-sm">
        Registra una carpeta de datos existente (por ejemplo el <span className="mono">./data</span> del antiguo docker-compose).
        El panel crea su propio contenedor sobre esa carpeta; no se copia ni se borra nada.
      </p>
      <div className="form-grid">
        <div className="form-group"><label>Nombre</label><input className="input" value={form.name} onChange={set("name")} /></div>
        <div className="form-group"><label>Carpeta de datos</label><input className="input mono" value={form.dataDir} onChange={set("dataDir")} /><span className="hint">Relativa a la raíz del repo o absoluta.</span></div>
        <div className="form-group">
          <label>Tipo</label>
          <select className="select" value={form.type} onChange={set("type")}>
            {Object.entries(TYPE_LABELS).filter(([k]) => k !== "MODRINTH").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Versión</label><input className="input" value={form.version} onChange={set("version")} /></div>
        <div className="form-group"><label>RAM (MB)</label><input className="input" type="number" value={form.memory_mb} onChange={set("memory_mb")} /></div>
        <div className="form-group"><label>Puerto</label><input className="input" type="number" value={form.port} onChange={set("port")} /></div>
        <div className="form-group"><label>Contenedor antiguo a eliminar</label><input className="input mono" value={form.replaceContainer} onChange={set("replaceContainer")} /><span className="hint">Se borra solo el contenedor (no los datos) para liberar el puerto.</span></div>
      </div>
      <label className="checkbox"><input type="checkbox" checked={form.start} onChange={set("start")} /> Iniciar tras importar</label>
      <ErrorNotice error={error} />
      <div className="modal-actions">
        <button className="btn btn-muted" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Importando…" : "Importar"}</button>
      </div>
    </Modal>
  );
}

export default function ServerList() {
  const { servers, summary, loading, error, reload } = useServers();
  const [actionError, setActionError] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const navigate = useNavigate();

  const onAction = async (server, action) => {
    setActionError(null);
    try {
      await api.post(`/api/servers/${server.id}/${action}`);
    } catch (err) {
      setActionError(`${server.name}: ${err.message}`);
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Servidores</h2>
          <p className="subtitle">{servers.length} servidor(es) gestionados</p>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setShowImport(true)}>Importar existente</button>
          <Link className="btn btn-primary" to="/servers/new">+ Nuevo servidor</Link>
        </div>
      </div>
      <HostWidget servers={servers} />
      <ErrorNotice error={error || actionError} />
      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : servers.length === 0 ? (
        <div className="glass-card empty">
          <p>Todavía no hay servidores.</p>
          <p className="text-xs">Crea uno nuevo o importa la carpeta <span className="mono">./data</span> del servidor anterior.</p>
        </div>
      ) : (
        <div className="grid grid-cards">
          {servers.map((s) => (
            <ServerCard key={s.id} server={s} live={summary[s.id]} onAction={onAction} />
          ))}
        </div>
      )}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onDone={(s) => {
            setShowImport(false);
            reload();
            navigate(`/servers/${s.id}`);
          }}
        />
      )}
    </div>
  );
}
