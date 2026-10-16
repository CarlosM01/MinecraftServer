import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
// Parent keys this component by server.updated_at, so the form resets after each save
import { api } from "../../api";
import { useSocketEvent } from "../../socket";
import { ConfirmDialog, ErrorNotice } from "../../components/ui";
import { ExtraEnvEditor, GameFields, ResourceFields, VersionSelect } from "../../components/serverForm";
import { suggestImageTag, useHost, useMeta } from "../../components/formHelpers";
import { TYPE_LABELS } from "../../utils";

function formFromServer(s) {
  return {
    name: s.name,
    type: s.type,
    version: s.version,
    memory_mb: s.memory_mb,
    _originalMemory: s.memory_mb,
    cpu_limit: s.cpu_limit ?? "",
    port: s.port,
    map_port: s.map_port ?? "",
    map_container_port: s.map_container_port,
    image_tag: s.image_tag,
  };
}

function UpgradeSection({ server, onDone }) {
  const [target, setTarget] = useState({ type: server.type, version: server.version });
  const [report, setReport] = useState(null);
  const [disableIncompatible, setDisableIncompatible] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const changed = target.type !== server.type || target.version !== server.version;


  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      setReport(await api.post(`/api/servers/${server.id}/upgrade-check`, target));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    setBusy("apply");
    setError(null);
    try {
      setResult(await api.post(`/api/servers/${server.id}/upgrade`, { ...target, updateMods: true, disableIncompatible }));
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (server.type === "MODRINTH") {
    return (
      <section className="glass-card card">
        <div className="card-title">Versión</div>
        <p className="muted text-sm">
          Los servidores de modpack toman la versión de Minecraft y los mods del propio modpack ({server.modpack}). Para pasar a otra
          versión del modpack, clona este servidor o crea uno nuevo desde el modpack y prueba antes de cambiar.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-card card stack">
      <div className="card-title" style={{ margin: 0 }}>Cambiar versión / tipo</div>
      <p className="muted text-sm">
        Antes de aplicar se crea un backup automático (<span className="mono">{server.slug}_pre-upgrade_…</span>); si falla, no se cambia nada.
      </p>
      <div className="form-grid">
        <div className="form-group">
          <label>Tipo</label>
          <select className="select" value={target.type} onChange={(e) => { setReport(null); setTarget({ type: e.target.value, version: "LATEST" }); }}>
            {Object.entries(TYPE_LABELS).filter(([k]) => k !== "MODRINTH").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <VersionSelect type={target.type} value={target.version} onChange={(v) => { setReport(null); setTarget({ ...target, version: v }); }} />
      </div>
      {changed && (
        <div className="row">
          <button className="btn btn-muted btn-sm" disabled={Boolean(busy)} onClick={check}>{busy === "check" ? "Comprobando mods…" : "Comprobar compatibilidad"}</button>
          {suggestImageTag(target.version, target.type) !== server.image_tag && (
            <span className="text-warning text-xs">Sugerencia: esta versión suele requerir {suggestImageTag(target.version, target.type)} (cámbialo abajo en Recursos).</span>
          )}
        </div>
      )}
      {report && (
        <div className="stack" style={{ gap: 8 }}>
          {report.noMods ? (
            <div className="notice info">El tipo destino no usa mods/plugins.</div>
          ) : (
            <>
              <div className="notice ok">✔ Compatibles ({report.compatible.length}): {report.compatible.map((m) => `${m.title} → ${m.targetVersion}`).join(", ") || "—"}</div>
              {report.incompatible.length > 0 && (
                <div className="notice error">✖ Sin versión para {report.targetVersion} ({report.incompatible.length}): {report.incompatible.map((m) => m.title).join(", ")}</div>
              )}
              {report.unknown.length > 0 && (
                <div className="notice warn">? No identificados en Modrinth ({report.unknown.length}): {report.unknown.map((m) => m.filename).join(", ")} — revísalos a mano.</div>
              )}
              <label className="checkbox"><input type="checkbox" checked={disableIncompatible} onChange={(e) => setDisableIncompatible(e.target.checked)} /> Deshabilitar los mods incompatibles</label>
            </>
          )}
          <div>
            <button className="btn btn-warning" disabled={Boolean(busy)} onClick={apply}>
              {busy === "apply" ? "Aplicando (backup + cambio)…" : `Hacer backup y cambiar a ${TYPE_LABELS[target.type]} ${target.version}`}
            </button>
          </div>
        </div>
      )}
      {result && <div className="notice ok"><div>Actualizado.</div>{result.modLog.map((l, i) => <div key={i} className="mono text-xs">{l}</div>)}</div>}
      <ErrorNotice error={error} />
    </section>
  );
}

function ImageSection({ server }) {
  const [images, setImages] = useState([]);
  const [log, setLog] = useState(null);
  const load = () => api.get("/api/images").then(setImages).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  useSocketEvent("image:progress", (p) => {
    setLog(p.message);
    if (p.done) load();
  });
  const current = images.find((i) => i.tag === server.image_tag);
  return (
    <section className="glass-card card stack">
      <div className="card-title" style={{ margin: 0 }}>Imagen Docker</div>
      <p className="muted text-sm">
        <span className="mono">itzg/minecraft-server:{server.image_tag}</span>{" "}
        {current ? `— descargada el ${new Date(current.created).toLocaleDateString()}` : "— no descargada aún"}.
        Tras actualizarla, recrea el contenedor para usarla.
      </p>
      <div className="row">
        <button className="btn btn-muted btn-sm" onClick={() => api.post("/api/images/pull", { tag: server.image_tag }).catch((e) => setLog(e.message))}>Actualizar imagen</button>
        <button className="btn btn-ghost btn-sm" onClick={() => api.post(`/api/servers/${server.id}/recreate`).then(() => setLog("Contenedor recreado.")).catch((e) => setLog(e.message))}>Recrear contenedor</button>
      </div>
      {log && <div className="progress-log">{log}</div>}
    </section>
  );
}

export default function SettingsTab({ server, reload }) {
  const navigate = useNavigate();
  const host = useHost();
  const meta = useMeta();
  const [form, setForm] = useState(() => formFromServer(server));
  const [env, setEnv] = useState(() => ({ ...server.env }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [allowOvercommit, setAllowOvercommit] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [deleteBackups, setDeleteBackups] = useState(false);
  const [cloneName, setCloneName] = useState(`${server.name} (clon)`);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/servers/${server.id}`, {
        name: form.name,
        image_tag: form.image_tag,
        memory_mb: Number(form.memory_mb),
        cpu_limit: form.cpu_limit === "" ? null : Number(form.cpu_limit),
        port: Number(form.port),
        map_port: form.map_port === "" ? null : Number(form.map_port),
        map_container_port: Number(form.map_container_port) || 8100,
        env,
        allowOvercommit,
      });
      setSaved(true);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  };

  const clone = async () => {
    try {
      const s = await api.post(`/api/servers/${server.id}/clone`, { name: cloneName });
      navigate(`/servers/${s.id}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (confirm) => {
    try {
      const res = await api.del(`/api/servers/${server.id}`, { confirm, deleteData, deleteBackups });
      if (deleteData && !res.dataDeleted) alert(`Los datos están fuera de la carpeta de servidores y no se borraron: ${res.dataDir}`);
      navigate("/");
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="stack">
      <section className="glass-card card stack">
        <div className="card-title" style={{ margin: 0 }}>General</div>
        <div className="form-group" style={{ maxWidth: 400 }}>
          <label>Nombre</label>
          <input className="input" value={form.name} onChange={set("name")} />
        </div>
        <div className="card-title" style={{ margin: 0 }}>Recursos</div>
        <ResourceFields form={form} set={set} host={host} imageTags={meta?.imageTags} />
        <div className="card-title" style={{ margin: 0 }}>Juego</div>
        <GameFields env={env} setEnv={setEnv} />
        <div className="card-title" style={{ margin: 0 }}>Variables extra</div>
        <ExtraEnvEditor extra={env.EXTRA || {}} onChange={(extra) => setEnv({ ...env, EXTRA: extra })} />
        <ErrorNotice error={error} />
        {error && /sobreasignación/.test(error) && (
          <label className="checkbox text-warning"><input type="checkbox" checked={allowOvercommit} onChange={(e) => setAllowOvercommit(e.target.checked)} /> Permitir sobreasignación de RAM</label>
        )}
        {saved && <div className="notice ok">Guardado. El contenedor se ha recreado con la nueva configuración.</div>}
        <div>
          <button className="btn btn-primary" disabled={saving} onClick={() => setConfirmSave(true)}>{saving ? "Aplicando…" : "Guardar y aplicar"}</button>
        </div>
      </section>

      <UpgradeSection server={server} onDone={reload} />
      <ImageSection server={server} />

      <section className="glass-card card stack">
        <div className="card-title" style={{ margin: 0 }}>Clonar servidor</div>
        <p className="muted text-sm">Copia completa de la carpeta de datos (mundo, mods, configuración) en un servidor nuevo, detenido y con otro puerto.</p>
        <div className="row">
          <input className="input" style={{ maxWidth: 300 }} value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
          <button className="btn btn-muted btn-sm" disabled={!cloneName} onClick={clone}>Clonar</button>
        </div>
      </section>

      <section className="glass-card card stack border-danger">
        <div className="card-title text-danger" style={{ margin: 0 }}>Zona peligrosa</div>
        <label className="checkbox"><input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} /> Borrar también la carpeta de datos (<span className="mono text-xs">{server.data_dir}</span>)</label>
        <label className="checkbox"><input type="checkbox" checked={deleteBackups} onChange={(e) => setDeleteBackups(e.target.checked)} /> Borrar también sus backups</label>
        <div><button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Eliminar servidor</button></div>
      </section>

      {confirmSave && (
        <ConfirmDialog title="Aplicar cambios" danger={false} confirmLabel="Aplicar" onCancel={() => setConfirmSave(false)} onConfirm={save}>
          <p>El contenedor se recreará con la nueva configuración{server.runtime?.status === "online" ? " y el servidor se reiniciará (los jugadores serán desconectados)" : ""}.</p>
        </ConfirmDialog>
      )}
      {confirmDelete && (
        <ConfirmDialog title={`Eliminar ${server.name}`} confirmText={server.name} confirmLabel="Eliminar definitivamente" onCancel={() => setConfirmDelete(false)} onConfirm={remove}>
          <p>Se eliminará el contenedor y el registro del panel{deleteData ? ", la carpeta de datos" : ""}{deleteBackups ? " y los backups" : ""}. No se puede deshacer.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
