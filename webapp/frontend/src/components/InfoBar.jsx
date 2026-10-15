import { formatDate } from "../utils";
import "./InfoBar.css";

export default function InfoBar({ name, status, image, startedAt, loading }) {
  return (
    <section className="info-bar glass-card" id="info-bar">
      <div className="info-item" id="info-name">
        <span className="info-label">Container</span>
        <span className="info-value">{loading ? "…" : name || "—"}</span>
      </div>
      <div className="info-item" id="info-status">
        <span className="info-label">Status</span>
        <span className="info-value">
          <span className={`status-pill ${status || ""}`}>
            {loading ? "…" : status || "—"}
          </span>
        </span>
      </div>
      <div className="info-item" id="info-image">
        <span className="info-label">Image</span>
        <span className="info-value">{loading ? "…" : image || "—"}</span>
      </div>
      <div className="info-item" id="info-started">
        <span className="info-label">Started</span>
        <span className="info-value">
          {loading ? "…" : startedAt ? formatDate(startedAt) : "—"}
        </span>
      </div>
    </section>
  );
}
