import { useCallback, useEffect, useState } from "react";
import { api, request } from "../../api";
import { ConfirmDialog, ErrorNotice } from "../../components/ui";
import { formatBytes } from "../../utils";

const TOOLS = [
  ["spark", "spark", "Profiler y TPS/MSPT"],
  ["chunky", "Chunky", "Pre-generación de chunks"],
  ["bluemap", "BlueMap", "Mapa web 3D"],
];

function ModIcon({ url }) {
  return url ? <img className="mod-icon" src={url} alt="" loading="lazy" /> : <div className="mod-icon" />;
}

export default function ModsTab({ server }) {
  const kind = server.contentKind;
  const label = kind === "plugins" ? "plugins" : "mods";
  const base = `/api/servers/${server.id}/mods`;
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [versionsFor, setVersionsFor] = useState(null); // { hit, versions }

  const load = useCallback(async () => {
    try {
      setMods(await api.get(base));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!kind) return;
    api
      .get(base)
      .then(setMods)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [kind, base]);

  useEffect(() => {
    if (!kind) return;
    const t = setTimeout(() => {
      api.get(`${base}/search?q=${encodeURIComponent(q)}&offset=${offset}`).then(setResults).catch((e) => setError(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [q, offset, base, kind]);

  const act = async (key, fn, okMessage) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (okMessage) setNotice(typeof okMessage === "function" ? okMessage(res) : okMessage);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const install = (projectId, versionId) =>
    act(`install:${projectId}`, () => api.post(`${base}/install`, { projectId, versionId }), (r) => `Instalado: ${r.installed.join(", ")}. Reinicia el servidor para cargarlo.`);

  const upload = (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return act("upload", () => request("POST", `${base}/upload`, fd), `Subido ${file.name}. Reinicia el servidor para cargarlo.`);
  };

  const checkUpdates = () =>
    act("updates", async () => setUpdates(await api.get(`${base}/updates`)));

  const openVersions = async (hit) => {
    try {
      setVersionsFor({ hit, versions: await api.get(`${base}/project/${hit.projectId}/versions`) });
    } catch (err) {
      setError(err.message);
    }
  };

  if (!kind) {
    return (
      <div className="glass-card card notice info">
        Los servidores {server.type} no cargan mods ni plugins. Cambia el tipo a Paper/Purpur (plugins) o Fabric/Forge/NeoForge (mods) en Ajustes.
      </div>
    );
  }

  const installedProjects = new Set(mods.map((m) => m.projectId).filter(Boolean));

  return (
    <div className="stack">
      <ErrorNotice error={error} />
      {notice && (
        <div className="notice ok row between">
          <span>{notice}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      <section className="glass-card card stack">
        <div className="row between">
          <div className="card-title" style={{ margin: 0 }}>
            {label[0].toUpperCase() + label.slice(1)} instalados ({mods.length}) <span className="muted text-xs mono">/{kind}</span>
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" disabled={busy === "updates"} onClick={checkUpdates}>
              {busy === "updates" ? "Comprobando…" : "Buscar actualizaciones"}
            </button>
            <label className="btn btn-muted btn-sm" style={{ cursor: "pointer" }}>
              {busy === "upload" ? "Subiendo…" : "Subir .jar"}
              <input type="file" accept=".jar" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0])} />
            </label>
          </div>
        </div>

        {updates && (
          <div className={`notice ${updates.length ? "warn" : "ok"}`}>
            {updates.length === 0 ? (
              "Todo está al día."
            ) : (
              <div className="stack" style={{ gap: 6 }}>
                {updates.map((u) => (
                  <div className="row between" key={u.filename}>
                    <span><strong>{u.title}</strong> {u.currentVersion} → {u.latestVersion}</span>
                    <button className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => install(u.projectId, u.latestVersionId).then(checkUpdates)}>Actualizar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <span className="spinner" />
        ) : mods.length === 0 ? (
          <div className="empty">No hay {label} instalados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {mods.map((m) => (
                  <tr key={m.filename} style={{ opacity: m.enabled ? 1 : 0.5 }}>
                    <td style={{ width: 48 }}><ModIcon url={m.iconUrl} /></td>
                    <td>
                      <strong>{m.title}</strong> {m.versionNumber && <span className="muted text-xs">{m.versionNumber}</span>}
                      <div className="mono text-xs muted">{m.filename}</div>
                    </td>
                    <td className="muted text-xs">{m.projectId ? "Modrinth" : "Manual"} · {formatBytes(m.size)}</td>
                    <td className="actions">
                      <label className="checkbox" style={{ marginRight: 8 }}>
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          disabled={Boolean(busy)}
                          onChange={(e) => act(`toggle:${m.filename}`, () => api.post(`${base}/${encodeURIComponent(m.filename)}/toggle`, { enabled: e.target.checked }))}
                        />
                        Activo
                      </label>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(m)}>Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className="muted text-xs">Los cambios se aplican al reiniciar el servidor.</span>
      </section>

      <section className="glass-card card stack">
        <div className="card-title" style={{ margin: 0 }}>Herramientas recomendadas</div>
        <div className="row">
          {TOOLS.map(([slug, title, hint]) => (
            <button key={slug} className="btn btn-muted btn-sm" disabled={Boolean(busy)} onClick={() => install(slug)} title={hint}>
              {busy === `install:${slug}` ? "Instalando…" : `+ ${title}`} <span className="muted text-xs">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="glass-card card stack">
        <div className="row between">
          <div className="card-title" style={{ margin: 0 }}>Buscar en Modrinth</div>
          <span className="muted text-xs">Filtrado por {server.loaderName} · {server.version === "LATEST" ? "última versión" : server.version}</span>
        </div>
        <input className="input" placeholder={`Buscar ${label}…`} value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        {results?.hits.map((h) => (
          <div className="search-hit" key={h.projectId}>
            <ModIcon url={h.iconUrl} />
            <div className="grow">
              <strong>{h.title}</strong>{" "}
              <span className="muted text-xs">por {h.author} · {h.downloads.toLocaleString()} descargas</span>
              <p>{h.description}</p>
            </div>
            <div className="row" style={{ alignSelf: "center" }}>
              {installedProjects.has(h.projectId) ? (
                <span className="tag">Instalado</span>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => openVersions(h)}>Versiones</button>
                  <button className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => install(h.projectId)}>
                    {busy === `install:${h.projectId}` ? "…" : "Instalar"}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {results && results.hits.length === 0 && <div className="empty">Sin resultados compatibles.</div>}
        {results && results.total > 20 && (
          <div className="row between">
            <button className="btn btn-ghost btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>← Anterior</button>
            <span className="muted text-xs">{offset + 1}–{Math.min(offset + 20, results.total)} de {results.total}</span>
            <button className="btn btn-ghost btn-sm" disabled={offset + 20 >= results.total} onClick={() => setOffset(offset + 20)}>Siguiente →</button>
          </div>
        )}
      </section>

      {versionsFor && (
        <ConfirmDialog title={`Versiones de ${versionsFor.hit.title}`} danger={false} confirmLabel="Cerrar" onCancel={() => setVersionsFor(null)} onConfirm={() => setVersionsFor(null)}>
          {versionsFor.versions.length === 0 && <p className="muted">No hay versiones compatibles con este servidor.</p>}
          <div className="stack" style={{ gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {versionsFor.versions.slice(0, 30).map((v) => (
              <div className="row between" key={v.id}>
                <span>
                  <strong>{v.version_number}</strong> <span className="muted text-xs">{v.version_type} · {v.game_versions.slice(-3).join(", ")}</span>
                </span>
                <button className="btn btn-sm btn-muted" onClick={() => { install(versionsFor.hit.projectId, v.id); setVersionsFor(null); }}>Instalar</button>
              </div>
            ))}
          </div>
        </ConfirmDialog>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Eliminar ${confirmDelete.title}`}
          confirmLabel="Eliminar"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            await act(`delete:${confirmDelete.filename}`, () => api.del(`${base}/${encodeURIComponent(confirmDelete.filename)}`));
            setConfirmDelete(null);
          }}
        >
          <p>Se borrará <span className="mono">{confirmDelete.filename}</span> de la carpeta del servidor.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
