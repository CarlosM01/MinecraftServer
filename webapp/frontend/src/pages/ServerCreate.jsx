import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, request } from "../api";
import { ErrorNotice } from "../components/ui";
import { GameFields, ResourceFields, VersionSelect } from "../components/serverForm";
import { suggestImageTag, useHost, useMeta } from "../components/formHelpers";

const TYPES = [
  { id: "VANILLA", label: "Vanilla", hint: "Sin mods ni plugins" },
  { id: "PAPER", label: "Paper", hint: "Plugins, alto rendimiento" },
  { id: "PURPUR", label: "Purpur", hint: "Fork de Paper, más opciones" },
  { id: "FABRIC", label: "Fabric", hint: "Mods ligeros" },
  { id: "QUILT", label: "Quilt", hint: "Mods (compatible Fabric)" },
  { id: "FORGE", label: "Forge", hint: "Mods clásicos" },
  { id: "NEOFORGE", label: "NeoForge", hint: "Mods modernos" },
  { id: "MODRINTH", label: "Modpack", hint: "Desde Modrinth o .mrpack" },
];
const STEPS = ["Tipo", "Versión", "Recursos", "Juego"];

function ModpackPicker({ form, setForm, file, setFile }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [pack, setPack] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/api/modpacks/search?q=${encodeURIComponent(q)}`).then((d) => setHits(d.hits)).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const choose = async (hit) => {
    setFile(null);
    setError(null);
    try {
      const info = await api.get(`/api/modpacks/${hit.slug}`);
      setPack(info);
      setForm((f) => ({ ...f, modpack: info.slug, modpack_version: info.versionId, version: info.gameVersion, image_tag: suggestImageTag(info.gameVersion) }));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="stack">
      <div className="form-group">
        <label>Subir archivo .mrpack</label>
        <input
          type="file"
          accept=".mrpack"
          className="input"
          onChange={(e) => {
            setFile(e.target.files[0] || null);
            setPack(null);
            setForm((f) => ({ ...f, modpack: "", modpack_version: null }));
          }}
        />
        {file && <span className="hint">Se leerán la versión de Minecraft y el loader del propio archivo.</span>}
      </div>
      {!file && (
        <>
          <div className="form-group">
            <label>…o buscar en Modrinth</label>
            <input className="input" placeholder="Buscar modpacks" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {pack && (
            <div className="notice ok row">
              {pack.iconUrl && <img className="mod-icon" src={pack.iconUrl} alt="" />}
              <div className="grow">
                <strong>{pack.title}</strong> · {pack.loader} · MC {pack.gameVersion}
              </div>
              <select
                className="select"
                style={{ maxWidth: 280 }}
                value={form.modpack_version || ""}
                onChange={(e) => {
                  const v = pack.versions.find((x) => x.id === e.target.value);
                  setForm((f) => ({ ...f, modpack_version: v.id, version: v.gameVersions[0], image_tag: suggestImageTag(v.gameVersions[0]) }));
                }}
              >
                {pack.versions.map((v) => (
                  <option key={v.id} value={v.id}>{v.versionNumber} (MC {v.gameVersions.join(", ")})</option>
                ))}
              </select>
            </div>
          )}
          <div className="glass-card card" style={{ maxHeight: 420, overflowY: "auto" }}>
            {hits.map((h) => (
              <div className="search-hit" key={h.projectId}>
                {h.iconUrl ? <img className="mod-icon" src={h.iconUrl} alt="" /> : <div className="mod-icon" />}
                <div className="grow">
                  <strong>{h.title}</strong> <span className="muted text-xs">por {h.author} · {h.downloads.toLocaleString()} descargas</span>
                  <p>{h.description}</p>
                </div>
                <button className="btn btn-sm btn-muted" onClick={() => choose(h)}>Elegir</button>
              </div>
            ))}
          </div>
        </>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}

export default function ServerCreate() {
  const navigate = useNavigate();
  const host = useHost();
  const meta = useMeta();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [needsOvercommit, setNeedsOvercommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "PAPER",
    version: "LATEST",
    modpack: "",
    modpack_version: null,
    memory_mb: 4096,
    cpu_limit: "",
    port: "",
    map_port: "",
    map_container_port: 8100,
    image_tag: "latest",
    allowOvercommit: false,
    start: true,
  });
  const [env, setEnv] = useState({ MODE: "survival", DIFFICULTY: "normal", ONLINE_MODE: "TRUE", PVP: "TRUE" });

  useEffect(() => {
    api.get("/api/servers/next-port").then((d) => setForm((f) => ({ ...f, port: f.port || d.port }))).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const canNext = [
    Boolean(form.type),
    form.type === "MODRINTH" ? Boolean(file || form.modpack) : Boolean(form.version),
    Number(form.memory_mb) >= 512,
    form.name.trim().length > 0,
  ][step];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      memory_mb: Number(form.memory_mb),
      cpu_limit: form.cpu_limit === "" ? null : Number(form.cpu_limit),
      port: form.port === "" ? undefined : Number(form.port),
      map_port: form.map_port === "" ? null : Number(form.map_port),
      map_container_port: Number(form.map_container_port) || 8100,
      env,
    };
    try {
      let server;
      if (file) {
        const fd = new FormData();
        fd.append("payload", JSON.stringify(payload));
        fd.append("modpack", file);
        server = await request("POST", "/api/servers", fd);
      } else {
        server = await api.post("/api/servers", payload);
      }
      navigate(`/servers/${server.id}`);
    } catch (err) {
      setError(err.message);
      if (/sobreasignación/.test(err.message)) setNeedsOvercommit(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h2>Nuevo servidor</h2>
          <p className="subtitle">Se crea un contenedor itzg/minecraft-server con su propia carpeta de datos.</p>
        </div>
      </div>
      <div className="steps">
        {STEPS.map((s, i) => (
          <span key={s} className={i === step ? "active" : i < step ? "done" : ""}>{i + 1}. {s}</span>
        ))}
      </div>

      <section className="glass-card card stack">
        {step === 0 && (
          <div className="choice-grid">
            {TYPES.map((t) => (
              <button
                key={t.id}
                className={`choice ${form.type === t.id ? "selected" : ""}`}
                onClick={() => setForm({ ...form, type: t.id, version: "LATEST", modpack: "", modpack_version: null })}
              >
                <strong>{t.label}</strong>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        )}

        {step === 1 &&
          (form.type === "MODRINTH" ? (
            <ModpackPicker form={form} setForm={setForm} file={file} setFile={setFile} />
          ) : (
            <VersionSelect
              type={form.type}
              value={form.version}
              onChange={(v) => setForm({ ...form, version: v, image_tag: suggestImageTag(v, form.type) })}
            />
          ))}

        {step === 2 && <ResourceFields form={form} set={set} host={host} imageTags={meta?.imageTags} />}

        {step === 3 && (
          <div className="stack">
            <div className="form-group">
              <label>Nombre del servidor</label>
              <input className="input" autoFocus value={form.name} onChange={set("name")} placeholder="Survival con amigos" />
            </div>
            <GameFields env={env} setEnv={setEnv} />
            <label className="checkbox"><input type="checkbox" checked={form.start} onChange={set("start")} /> Iniciar al terminar</label>
            {needsOvercommit && (
              <label className="checkbox text-warning">
                <input type="checkbox" checked={form.allowOvercommit} onChange={set("allowOvercommit")} /> Permitir sobreasignación de RAM
              </label>
            )}
          </div>
        )}

        <ErrorNotice error={error} />
        <div className="row between">
          <button className="btn btn-muted" onClick={() => (step ? setStep(step - 1) : navigate("/"))}>
            {step ? "Atrás" : "Cancelar"}
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Siguiente</button>
          ) : (
            <button className="btn btn-primary" disabled={!canNext || busy} onClick={submit}>{busy ? "Creando…" : "Crear servidor"}</button>
          )}
        </div>
      </section>
    </div>
  );
}
