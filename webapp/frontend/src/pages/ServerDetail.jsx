import { NavLink, Route, Routes, Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api";
import { useServer } from "../hooks";
import { StatusPill, ErrorNotice } from "../components/ui";
import { TYPE_LABELS } from "../utils";
import OverviewTab from "./tabs/OverviewTab";
import TerminalTab from "./tabs/TerminalTab";
import PlayersTab from "./tabs/PlayersTab";
import ModsTab from "./tabs/ModsTab";
import WorldsTab from "./tabs/WorldsTab";
import BackupsTab from "./tabs/BackupsTab";
import SettingsTab from "./tabs/SettingsTab";

const TABS = [
  ["", "Resumen"],
  ["terminal", "Terminal"],
  ["players", "Jugadores"],
  ["mods", "Mods / Plugins"],
  ["worlds", "Mundos"],
  ["backups", "Backups"],
  ["settings", "Ajustes"],
];

export default function ServerDetail() {
  const { id } = useParams();
  // Remount on id change so per-server state never leaks between servers
  return <ServerDetailInner key={id} id={id} />;
}

function ServerDetailInner({ id }) {
  const { server, stats, progress, error, loading, reload } = useServer(id);
  const [actionError, setActionError] = useState(null);

  if (loading && !server) return <div className="empty"><span className="spinner" /></div>;
  if (!server) return <ErrorNotice error={error || "Servidor no encontrado."} />;

  const status = server.runtime?.status;
  const running = ["online", "starting", "restarting"].includes(status);
  const busy = Boolean(server.lock);

  const action = async (name) => {
    setActionError(null);
    try {
      await api.post(`/api/servers/${server.id}/${name}`);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const ctx = { server, stats, progress, reload, running };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="row">
            <Link to="/" className="muted">Servidores</Link>
            <span className="muted">/</span>
            <h2>{server.name}</h2>
            <StatusPill status={status} />
          </div>
          <p className="subtitle">
            {TYPE_LABELS[server.type]} {server.version}
            {server.loaderName && server.type === "MODRINTH" ? ` · ${server.loaderName}` : ""} · puerto{" "}
            <span className="mono">{server.port}</span> · {server.container_name}
            {busy && <span className="text-warning"> · {server.lock.op} en curso…</span>}
          </p>
        </div>
        <div className="row">
          {running ? (
            <>
              <button className="btn btn-muted" disabled={busy} onClick={() => action("restart")}>Reiniciar</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => action("stop")}>Detener</button>
            </>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => action("start")}>
              {status === "crashloop" ? "Reintentar" : "Iniciar"}
            </button>
          )}
        </div>
      </div>
      <ErrorNotice error={actionError} />
      {status === "crashloop" && (
        <div className="notice error">
          El servidor se ha caído 3 veces en 10 minutos y se ha detenido automáticamente. Revisa la terminal y los crash reports del Resumen
          (versión de Java, mods incompatibles…) antes de reintentar.
        </div>
      )}
      {status === "missing" && !busy && (
        <div className="notice warn row between">
          <span>El contenedor no existe. Iniciar lo creará con la configuración guardada.</span>
        </div>
      )}

      <nav className="tabs">
        {TABS.map(([path, label]) => (
          <NavLink key={path} to={path ? `/servers/${server.id}/${path}` : `/servers/${server.id}`} end={!path}>
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<OverviewTab {...ctx} />} />
        <Route path="terminal" element={<TerminalTab {...ctx} />} />
        <Route path="players" element={<PlayersTab {...ctx} />} />
        <Route path="mods" element={<ModsTab {...ctx} />} />
        <Route path="worlds" element={<WorldsTab {...ctx} />} />
        <Route path="backups" element={<BackupsTab {...ctx} />} />
        <Route path="settings" element={<SettingsTab key={server.updated_at} {...ctx} />} />
      </Routes>
    </div>
  );
}
