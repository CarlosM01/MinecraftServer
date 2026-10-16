import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api";
import StatsGrid from "../../components/StatsGrid";
import { Modal } from "../../components/ui";
import { usePlayers } from "../../hooks";
import { formatBytes, formatDate } from "../../utils";

const RANGES = [["1h", "1 h"], ["24h", "24 h"], ["7d", "7 días"], ["30d", "30 días"]];

function tick(range) {
  return (t) =>
    new Date(t).toLocaleString(undefined, range === "1h" || range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" });
}

function Chart({ title, data, dataKey, unit, color, range, domain, line }) {
  const Comp = line ? LineChart : AreaChart;
  return (
    <div className="glass-card card">
      <div className="card-title">{title}</div>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Comp data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={tick(range)} stroke="#64748b" fontSize={11} minTickGap={40} />
            <YAxis stroke="#64748b" fontSize={11} domain={domain || [0, "auto"]} unit={unit} width={56} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid rgba(56,189,120,0.2)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(t) => new Date(t).toLocaleString()}
              formatter={(v) => [v == null ? "—" : `${v}${unit || ""}`, title]}
            />
            {line ? (
              <Line type="stepAfter" dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} connectNulls />
            ) : (
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} connectNulls />
            )}
          </Comp>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function OverviewTab({ server, stats, progress, running }) {
  const [range, setRange] = useState("24h");
  const [metrics, setMetrics] = useState(null);
  const [disk, setDisk] = useState(null);
  const [crashes, setCrashes] = useState([]);
  const [crashView, setCrashView] = useState(null);
  const [recentCrash, setRecentCrash] = useState(false);
  const { online, max } = usePlayers(server.id);

  useEffect(() => {
    const load = () => api.get(`/api/servers/${server.id}/metrics?range=${range}`).then(setMetrics).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [server.id, range]);

  useEffect(() => {
    api.get(`/api/servers/${server.id}/disk`).then(setDisk).catch(() => {});
    api
      .get(`/api/servers/${server.id}/crash-reports`)
      .then((list) => {
        setCrashes(list);
        setRecentCrash(Boolean(list[0]) && Date.now() - new Date(list[0].mtime).getTime() < 24 * 3600 * 1000);
      })
      .catch(() => {});
  }, [server.id, server.runtime?.status]);

  const openCrash = async (name) => {
    const text = await api.get(`/api/servers/${server.id}/crash-reports/${encodeURIComponent(name)}`).catch((e) => e.message);
    setCrashView({ name, text });
  };

  const latestCrash = crashes[0];
  const points = metrics?.points || [];
  const tps = metrics?.latestTps;

  return (
    <div className="stack">
      {recentCrash && (
        <div className="notice error row between">
          <span>⚠️ Crash report reciente: <span className="mono">{latestCrash.name}</span> ({formatDate(latestCrash.mtime)})</span>
          <button className="btn btn-sm btn-danger" onClick={() => openCrash(latestCrash.name)}>Ver</button>
        </div>
      )}

      {running && stats ? (
        <StatsGrid
          cpu={stats.cpu_percent}
          ramUsed={stats.ram_used_mb}
          ramLimit={stats.ram_limit_mb}
          ramPercent={stats.ram_percent}
          uptime={stats.uptime_ms}
          startedAt={server.runtime?.startedAt}
        />
      ) : (
        <div className="glass-card card muted">{running ? "Esperando estadísticas…" : "El servidor está detenido."}</div>
      )}

      <div className="grid grid-3">
        <div className="glass-card card">
          <div className="muted text-xs">JUGADORES</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700 }}>
            {online.length}
            <span className="muted" style={{ fontSize: "1rem" }}>{max ? ` / ${max}` : ""}</span>
          </div>
          <div className="text-xs muted">{online.map((p) => p.name).join(", ") || "Nadie conectado"}</div>
        </div>
        <div className="glass-card card">
          <div className="muted text-xs">TPS / MSPT</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700 }} className={tps?.tps != null && tps.tps < 18 ? "text-warning" : ""}>
            {tps?.tps != null ? tps.tps.toFixed(1) : "N/D"}
            <span className="muted" style={{ fontSize: "1rem" }}>{tps?.mspt != null ? ` · ${tps.mspt.toFixed(1)} ms` : ""}</span>
          </div>
          <div className="text-xs muted">
            {tps?.source ? `Fuente: ${tps.source}` : "Paper/Purpur, spark o /tick query (1.20.3+)."}
          </div>
        </div>
        <div className="glass-card card">
          <div className="muted text-xs">DISCO</div>
          {disk ? (
            <dl className="kv" style={{ marginTop: 6 }}>
              <dt>Datos</dt><dd>{formatBytes(disk.dataBytes)}</dd>
              <dt>Mundo activo</dt><dd>{formatBytes(disk.worldBytes)}</dd>
              <dt>Backups</dt><dd>{formatBytes(disk.backupsBytes)}</dd>
            </dl>
          ) : (
            <span className="spinner" />
          )}
        </div>
      </div>

      <div className="row between">
        <h3 className="card-title" style={{ margin: 0 }}>Histórico</h3>
        <div className="row">
          {RANGES.map(([r, l]) => (
            <button key={r} className={`btn btn-sm ${range === r ? "btn-primary" : "btn-ghost"}`} onClick={() => setRange(r)}>{l}</button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <div className="glass-card empty">Sin datos todavía: se registran cada 30 s mientras el servidor está en línea.</div>
      ) : (
        <div className="grid grid-2">
          <Chart title="CPU" data={points} dataKey="cpu" unit="%" color="#38bd78" range={range} />
          <Chart title="RAM" data={points} dataKey="ram_mb" unit=" MB" color="#60a5fa" range={range} />
          <Chart title="Jugadores" data={points} dataKey="players" color="#f59e0b" range={range} line />
          <Chart title="TPS" data={points} dataKey="tps" color="#2dd4a8" range={range} domain={[0, 20]} />
        </div>
      )}

      {progress.length > 0 && (
        <div className="glass-card card">
          <div className="card-title">Actividad reciente</div>
          <div className="progress-log">
            {progress.map((p, i) => (
              <div key={i} className={p.error ? "text-danger" : ""}>
                [{new Date(p.ts).toLocaleTimeString()}] {p.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {crashes.length > 0 && (
        <div className="glass-card card">
          <div className="card-title">Crash reports</div>
          <table className="table">
            <tbody>
              {crashes.slice(0, 10).map((c) => (
                <tr key={c.name}>
                  <td className="mono">{c.name}</td>
                  <td className="muted">{formatDate(c.mtime)}</td>
                  <td className="actions"><button className="btn btn-sm btn-ghost" onClick={() => openCrash(c.name)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crashView && (
        <Modal title={crashView.name} wide onClose={() => setCrashView(null)}>
          <pre className="crash-pre">{crashView.text}</pre>
          <div className="modal-actions">
            <button className="btn btn-muted" onClick={() => setCrashView(null)}>Cerrar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
