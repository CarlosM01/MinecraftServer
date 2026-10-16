import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, request, BACKEND_URL } from "../../api";
import { useSocketEvent } from "../../socket";
import { ConfirmDialog, ErrorNotice, Meter } from "../../components/ui";
import { formatBytes, formatDate } from "../../utils";

function PregenPanel({ server }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ dimension: "overworld", radius: 2000, centerX: 0, centerZ: 0, shape: "square" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const online = server.runtime?.status === "online";

  useEffect(() => {
    api.get(`/api/servers/${server.id}/pregen`).then(setStatus).catch(() => {});
  }, [server.id]);

  useSocketEvent("pregen:progress", (p) => {
    if (p.serverId === server.id) setStatus((s) => ({ ...s, progress: p }));
  });

  const call = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStatus(await api.get(`/api/servers/${server.id}/pregen`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const p = status?.progress;

  return (
    <section className="glass-card card stack">
      <div className="card-title" style={{ margin: 0 }}>Pre-generación de chunks (Chunky)</div>
      {!status?.installed ? (
        <div className="notice info">
          Instala Chunky desde la pestaña <Link to={`/servers/${server.id}/mods`}>Mods / Plugins</Link> y reinicia el servidor.
        </div>
      ) : (
        <>
          <div className="form-grid">
            <div className="form-group">
              <label>Dimensión</label>
              <select className="select" value={form.dimension} onChange={set("dimension")}>
                <option value="overworld">Overworld</option>
                <option value="nether">Nether</option>
                <option value="end">End</option>
              </select>
            </div>
            <div className="form-group"><label>Radio (bloques)</label><input className="input" type="number" value={form.radius} onChange={set("radius")} /></div>
            <div className="form-group"><label>Centro X</label><input className="input" type="number" value={form.centerX} onChange={set("centerX")} /></div>
            <div className="form-group"><label>Centro Z</label><input className="input" type="number" value={form.centerZ} onChange={set("centerZ")} /></div>
            <div className="form-group">
              <label>Forma</label>
              <select className="select" value={form.shape} onChange={set("shape")}>
                <option value="square">Cuadrado</option>
                <option value="circle">Círculo</option>
              </select>
            </div>
          </div>
          {p && (
            <Meter
              label={`${p.world}${p.finished ? " · terminado" : ""}`}
              value={p.percent || 0}
              max={100}
              display={`${(p.percent || 0).toFixed(1)}%${p.eta ? ` · ETA ${p.eta}` : ""}${p.rate ? ` · ${p.rate} chunks/s` : ""}`}
            />
          )}
          <ErrorNotice error={error} />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={!online || busy} onClick={() => call(() => api.post(`/api/servers/${server.id}/pregen`, form))}>Iniciar</button>
            <button className="btn btn-muted btn-sm" disabled={!online || busy} onClick={() => call(() => api.post(`/api/servers/${server.id}/pregen/pause`))}>Pausar</button>
            <button className="btn btn-muted btn-sm" disabled={!online || busy} onClick={() => call(() => api.post(`/api/servers/${server.id}/pregen/continue`))}>Continuar</button>
            <button className="btn btn-danger btn-sm" disabled={!online || busy} onClick={() => call(() => api.post(`/api/servers/${server.id}/pregen/cancel`))}>Cancelar</button>
            {!online && <span className="muted text-xs">Requiere el servidor en línea.</span>}
          </div>
        </>
      )}
    </section>
  );
}

function MapPanel({ server }) {
  const [embed, setEmbed] = useState(false);
  if (!server.map_port) {
    return (
      <section className="glass-card card">
        <div className="card-title">Mapa web</div>
        <p className="muted text-sm">
          Configura un puerto de mapa en <Link to={`/servers/${server.id}/settings`}>Ajustes</Link> e instala BlueMap (puerto 8100) o Dynmap (8123).
          BlueMap requiere aceptar la descarga de recursos en su <span className="mono">core.conf</span> (<span className="mono">accept-download: true</span>).
        </p>
      </section>
    );
  }
  const url = `${window.location.protocol}//${window.location.hostname}:${server.map_port}`;
  return (
    <section className="glass-card card stack">
      <div className="row between">
        <div className="card-title" style={{ margin: 0 }}>Mapa web</div>
        <div className="row">
          <a className="btn btn-muted btn-sm" href={url} target="_blank" rel="noreferrer">Abrir mapa ↗</a>
          <button className="btn btn-ghost btn-sm" onClick={() => setEmbed(!embed)}>{embed ? "Ocultar" : "Mostrar aquí"}</button>
        </div>
      </div>
      {embed && <iframe title="Mapa" src={url} style={{ width: "100%", height: 560, border: 0, borderRadius: 8 }} />}
    </section>
  );
}

export default function WorldsTab({ server, running, reload }) {
  const base = `/api/servers/${server.id}/worlds`;
  const [worlds, setWorlds] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind, world, dimension }
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(base).then(setWorlds).catch((e) => setError(e.message)), [base]);
  useEffect(() => {
    load();
  }, [load, server.env?.LEVEL]);

  const run = async (fn, msg) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (msg) setNotice(msg);
      await load();
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  const upload = () => {
    const fd = new FormData();
    fd.append("name", uploadName);
    fd.append("file", uploadFile);
    return run(() => request("POST", `${base}/upload`, fd), `Mundo "${uploadName}" subido. Actívalo para usarlo.`).then(() => {
      setUploadFile(null);
      setUploadName("");
    });
  };

  const confirmProps = dialog && {
    activate: {
      title: `Activar el mundo ${dialog.world}`,
      label: "Activar y reiniciar",
      body: "El servidor se reiniciará cargando este mundo.",
      fn: (confirm) => api.post(`${base}/${dialog.world}/activate`, { confirm }),
      msg: `Mundo activo: ${dialog.world}`,
    },
    create: {
      title: `Crear el mundo ${dialog.world}`,
      label: "Crear y reiniciar",
      body: "El servidor se reiniciará y generará un mundo nuevo (usa la semilla de Ajustes si hay). El mundo actual se conserva.",
      fn: (confirm) => api.post(`${base}/new`, { name: dialog.world, confirm }),
      msg: `Generando el mundo ${dialog.world}`,
    },
    reset: {
      title: `Resetear ${dialog.dimension === "nether" ? "el Nether" : "el End"} de ${dialog.world}`,
      label: "Resetear",
      body: "Se borrará la dimensión; se regenerará al volver a entrar. El servidor debe estar detenido.",
      fn: (confirm) => api.post(`${base}/${dialog.world}/reset/${dialog.dimension}`, { confirm }),
      msg: "Dimensión eliminada.",
    },
    delete: {
      title: `Eliminar el mundo ${dialog.world}`,
      label: "Eliminar",
      body: "Se borrarán permanentemente los archivos de este mundo.",
      fn: (confirm) => api.del(`${base}/${dialog.world}`, { confirm }),
      msg: "Mundo eliminado.",
    },
  }[dialog.kind];

  return (
    <div className="stack">
      <ErrorNotice error={error} />
      {notice && <div className="notice ok row between"><span>{notice}</span><button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>✕</button></div>}

      <section className="glass-card card stack">
        <div className="card-title" style={{ margin: 0 }}>Mundos</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nombre</th><th>Tamaño</th><th>Última modificación</th><th /></tr></thead>
            <tbody>
              {worlds.map((w) => (
                <tr key={w.name}>
                  <td><strong className="mono">{w.name}</strong> {w.active && <span className="pill online">Activo</span>}</td>
                  <td>{formatBytes(w.size)}</td>
                  <td className="muted">{formatDate(w.lastPlayed)}</td>
                  <td className="actions">
                    <a className="btn btn-ghost btn-sm" href={`${BACKEND_URL}${base}/${w.name}/download`}>Descargar</a>
                    {!w.active && <button className="btn btn-muted btn-sm" disabled={busy} onClick={() => setDialog({ kind: "activate", world: w.name })}>Activar</button>}
                    <button className="btn btn-ghost btn-sm" disabled={busy || running} title={running ? "Detén el servidor" : ""} onClick={() => setDialog({ kind: "reset", world: w.name, dimension: "nether" })}>Reset Nether</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy || running} title={running ? "Detén el servidor" : ""} onClick={() => setDialog({ kind: "reset", world: w.name, dimension: "end" })}>Reset End</button>
                    {!w.active && <button className="btn btn-ghost btn-sm text-danger" disabled={busy} onClick={() => setDialog({ kind: "delete", world: w.name })}>Eliminar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {worlds.length === 0 && <div className="empty">Aún no hay mundos (se generan en el primer arranque).</div>}
        </div>
        <div className="grid grid-2">
          <div className="stack" style={{ gap: 8 }}>
            <strong className="text-sm">Subir mundo (.zip)</strong>
            <div className="row">
              <input className="input mono" style={{ maxWidth: 200 }} placeholder="nombre" value={uploadName} onChange={(e) => setUploadName(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} />
              <input className="input grow" type="file" accept=".zip" onChange={(e) => setUploadFile(e.target.files[0] || null)} />
              <button className="btn btn-muted btn-sm" disabled={!uploadName || !uploadFile || busy} onClick={upload}>{busy ? "Subiendo…" : "Subir"}</button>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <strong className="text-sm">Nuevo mundo</strong>
            <div className="row">
              <input className="input mono" style={{ maxWidth: 200 }} placeholder="nombre" value={newName} onChange={(e) => setNewName(e.target.value.replace(/[^A-Za-z0-9_-]/g, ""))} />
              <button className="btn btn-muted btn-sm" disabled={!newName || busy} onClick={() => setDialog({ kind: "create", world: newName })}>Crear y activar</button>
            </div>
          </div>
        </div>
      </section>

      <PregenPanel server={server} />
      <MapPanel server={server} />

      {dialog && (
        <ConfirmDialog
          title={confirmProps.title}
          confirmText={server.name}
          confirmLabel={confirmProps.label}
          onCancel={() => setDialog(null)}
          onConfirm={(confirm) => run(() => confirmProps.fn(confirm), confirmProps.msg)}
        >
          <p>{confirmProps.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
