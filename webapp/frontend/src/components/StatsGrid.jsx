import { formatUptime } from "../utils";
import "./StatsGrid.css";

/**
 * Classify a percentage for color-coding progress bars.
 */
function barClass(pct) {
  if (pct > 85) return "danger";
  if (pct > 65) return "warn";
  return "";
}

export default function StatsGrid({ cpu, ramUsed, ramLimit, ramPercent, uptime, startedAt }) {
  return (
    <section className="stats-grid" id="stats-grid">
      {/* CPU Card */}
      <div className="stat-card glass-card" id="card-cpu">
        <div className="stat-header">
          <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
            <rect x="9" y="9" width="6" height="6"/>
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>
          </svg>
          <span className="stat-title">CPU</span>
        </div>
        <div className="stat-value-row">
          <span className="stat-value">{cpu.toFixed(1)}</span>
          <span className="stat-unit">%</span>
        </div>
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${barClass(cpu)}`}
            style={{ width: `${Math.min(cpu, 100)}%` }}
          />
        </div>
      </div>

      {/* RAM Card */}
      <div className="stat-card glass-card" id="card-ram">
        <div className="stat-header">
          <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 19v-8a2 2 0 012-2h8a2 2 0 012 2v8"/>
            <path d="M2 19h20"/>
            <path d="M8 9V6a2 2 0 012-2h4a2 2 0 012 2v3"/>
          </svg>
          <span className="stat-title">Memoria</span>
        </div>
        <div className="stat-value-row">
          <span className="stat-value">{ramUsed >= 1024 ? (ramUsed / 1024).toFixed(1) : ramUsed.toFixed(0)}</span>
          <span className="stat-unit">{ramUsed >= 1024 ? "GB" : "MB"}</span>
        </div>
        <div className="stat-sub">
          {ramUsed >= 1024 ? (ramUsed / 1024).toFixed(1) + " GB" : ramUsed.toFixed(0) + " MB"} / {ramLimit >= 1024 ? (ramLimit / 1024).toFixed(1) + " GB" : ramLimit.toFixed(0) + " MB"} asignados ({ramPercent.toFixed(1)}%)
        </div>
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ram-fill ${barClass(ramPercent)}`}
            style={{ width: `${Math.min(ramPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Uptime Card */}
      <div className="stat-card glass-card" id="card-uptime">
        <div className="stat-header">
          <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="stat-title">Tiempo activo</span>
        </div>
        <div className="stat-value-row">
          <span className="stat-value">{formatUptime(uptime)}</span>
        </div>
        {startedAt && (
          <div className="stat-sub">
            Desde {new Date(startedAt).toLocaleString(undefined, {
              month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </section>
  );
}
