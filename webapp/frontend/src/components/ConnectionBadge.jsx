import "./ConnectionBadge.css";

export default function ConnectionBadge({ connected, error }) {
  const state = error ? "error" : connected ? "connected" : "";
  const label = error ? "Connection error" : connected ? "Live" : "Connecting…";

  return (
    <div className={`connection-badge ${state}`} id="connection-badge">
      <span className="dot" />
      <span className="label">{label}</span>
    </div>
  );
}
