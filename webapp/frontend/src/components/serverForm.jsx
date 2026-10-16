import { useEffect, useState } from "react";
import { api } from "../api";
import { IMAGE_TAG_LABELS, suggestImageTag } from "./formHelpers";

/** Version picker backed by /api/versions/:type, with free-text fallback. */
export function VersionSelect({ type, value, onChange }) {
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState(null);
  const [snapshots, setSnapshots] = useState(false);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!type) return;
    api
      .get(`/api/versions/${type}${snapshots ? "?snapshots=1" : ""}`)
      .then((d) => {
        setVersions(d.versions || []);
        setError(d.error || null);
      })
      .catch((e) => setError(e.message));
  }, [type, snapshots]);

  return (
    <div className="form-group">
      <label>Versión de Minecraft</label>
      {custom || (error && !versions.length) ? (
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="LATEST o p. ej. 1.21.4" />
      ) : (
        <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="LATEST">Última disponible (LATEST)</option>
          {versions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      )}
      <div className="row text-xs">
        <label className="checkbox"><input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> Escribir a mano</label>
        {["VANILLA", "FABRIC", "QUILT"].includes(type) && (
          <label className="checkbox"><input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} /> Snapshots</label>
        )}
      </div>
      {error && <span className="hint text-warning">{error}</span>}
    </div>
  );
}

/** RAM / CPU / ports / Java fields shared by the wizard and Settings. */
export function ResourceFields({ form, set, host, imageTags }) {
  const otherAllocated = host ? host.allocatedMb - (form._originalMemory || 0) : 0;
  const after = otherAllocated + Number(form.memory_mb || 0);
  return (
    <div className="stack">
      <div className="form-grid">
        <div className="form-group">
          <label>RAM para el servidor (MB)</label>
          <input className="input" type="number" min={512} step={512} value={form.memory_mb} onChange={set("memory_mb")} />
          <span className="hint">Heap de Java. El contenedor recibe un ~25% extra (mín. 512 MB) de margen.</span>
        </div>
        <div className="form-group">
          <label>Límite de CPU (núcleos)</label>
          <input className="input" type="number" min={0.1} step={0.5} placeholder="Sin límite" value={form.cpu_limit ?? ""} onChange={set("cpu_limit")} />
          {host && <span className="hint">El host tiene {host.cpus} núcleos.</span>}
        </div>
        <div className="form-group">
          <label>Puerto</label>
          <input className="input" type="number" value={form.port ?? ""} placeholder="Automático" onChange={set("port")} />
        </div>
        <div className="form-group">
          <label>Imagen / Java</label>
          <select className="select" value={form.image_tag} onChange={set("image_tag")}>
            {(imageTags || Object.keys(IMAGE_TAG_LABELS)).map((t) => (
              <option key={t} value={t}>{IMAGE_TAG_LABELS[t] || t}</option>
            ))}
          </select>
          <span className="hint">Sugerido para {form.version}: {IMAGE_TAG_LABELS[suggestImageTag(form.version, form.type)]}</span>
        </div>
        <div className="form-group">
          <label>Puerto del mapa web (opcional)</label>
          <input className="input" type="number" placeholder="p. ej. 8100" value={form.map_port ?? ""} onChange={set("map_port")} />
          <span className="hint">Para BlueMap (8100) o Dynmap (8123) dentro del contenedor.</span>
        </div>
        <div className="form-group">
          <label>Puerto del mapa en el contenedor</label>
          <input className="input" type="number" value={form.map_container_port ?? 8100} onChange={set("map_container_port")} />
        </div>
      </div>
      {host && (
        <div className={`notice ${after > host.memTotalMb * 0.9 ? "warn" : "info"}`}>
          RAM asignada en total tras este cambio: {Math.round(after / 1024 * 10) / 10} GB de {Math.round(host.memTotalMb / 1024 * 10) / 10} GB del host
          {after > host.memTotalMb * 0.9 && " — supera el 90% del host."}
        </div>
      )}
    </div>
  );
}

/** Game settings (itzg env vars). */
export function GameFields({ env, setEnv }) {
  const set = (k) => (e) => setEnv({ ...env, [k]: e.target.type === "checkbox" ? (e.target.checked ? "TRUE" : "FALSE") : e.target.value });
  return (
    <div className="form-grid">
      <div className="form-group"><label>MOTD</label><input className="input" value={env.MOTD || ""} onChange={set("MOTD")} /></div>
      <div className="form-group">
        <label>Modo de juego</label>
        <select className="select" value={env.MODE || "survival"} onChange={set("MODE")}>
          <option value="survival">Supervivencia</option>
          <option value="creative">Creativo</option>
          <option value="adventure">Aventura</option>
          <option value="spectator">Espectador</option>
        </select>
      </div>
      <div className="form-group">
        <label>Dificultad</label>
        <select className="select" value={env.DIFFICULTY || "easy"} onChange={set("DIFFICULTY")}>
          <option value="peaceful">Pacífica</option>
          <option value="easy">Fácil</option>
          <option value="normal">Normal</option>
          <option value="hard">Difícil</option>
        </select>
      </div>
      <div className="form-group"><label>Máx. jugadores</label><input className="input" type="number" value={env.MAX_PLAYERS || ""} placeholder="20" onChange={set("MAX_PLAYERS")} /></div>
      <div className="form-group"><label>Distancia de visión</label><input className="input" type="number" value={env.VIEW_DISTANCE || ""} placeholder="10" onChange={set("VIEW_DISTANCE")} /></div>
      <div className="form-group"><label>Distancia de simulación</label><input className="input" type="number" value={env.SIMULATION_DISTANCE || ""} placeholder="10" onChange={set("SIMULATION_DISTANCE")} /></div>
      <div className="form-group"><label>Semilla (solo mundos nuevos)</label><input className="input" value={env.SEED || ""} onChange={set("SEED")} /></div>
      <div className="form-group"><label>Protección del spawn</label><input className="input" type="number" value={env.SPAWN_PROTECTION || ""} placeholder="16" onChange={set("SPAWN_PROTECTION")} /></div>
      <div className="stack" style={{ gap: 6 }}>
        <label className="checkbox"><input type="checkbox" checked={(env.ONLINE_MODE || "TRUE") === "TRUE"} onChange={set("ONLINE_MODE")} /> Modo online (cuentas premium)</label>
        <label className="checkbox"><input type="checkbox" checked={(env.PVP || "TRUE") === "TRUE"} onChange={set("PVP")} /> PvP</label>
        <label className="checkbox"><input type="checkbox" checked={env.ENABLE_WHITELIST === "TRUE"} onChange={set("ENABLE_WHITELIST")} /> Whitelist</label>
        <label className="checkbox"><input type="checkbox" checked={env.ALLOW_FLIGHT === "TRUE"} onChange={set("ALLOW_FLIGHT")} /> Permitir vuelo</label>
      </div>
    </div>
  );
}

/** Editor for free-form extra itzg env vars. */
export function ExtraEnvEditor({ extra = {}, onChange }) {
  const entries = Object.entries(extra);
  const update = (i, k, v) => {
    const next = [...entries];
    next[i] = [k, v];
    onChange(Object.fromEntries(next.filter(([key]) => key !== "")));
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      {entries.map(([k, v], i) => (
        <div className="row" key={i}>
          <input className="input mono" style={{ maxWidth: 260 }} value={k} onChange={(e) => update(i, e.target.value.toUpperCase(), v)} />
          <input className="input mono grow" value={v} onChange={(e) => update(i, k, e.target.value)} />
          <button className="btn btn-ghost btn-sm" onClick={() => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)))}>✕</button>
        </div>
      ))}
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => onChange({ ...extra, [`VAR_${entries.length + 1}`]: "" })}>+ Variable</button>
      </div>
      <span className="hint muted text-xs">Variables extra de la imagen itzg/minecraft-server (p. ej. ICON, OPS, JVM_XX_OPTS).</span>
    </div>
  );
}

