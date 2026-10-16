import { useState } from "react";
import { STATUS_LABELS } from "../utils";

export function StatusPill({ status }) {
  return <span className={`pill ${status || "missing"}`}>{STATUS_LABELS[status] || status || "—"}</span>;
}

export function Meter({ label, value, max, display }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const cls = pct > 85 ? "danger" : pct > 65 ? "warn" : "";
  return (
    <div className="meter">
      <div className="row between">
        <span className="muted">{label}</span>
        <span>{display}</span>
      </div>
      <div className="meter-track">
        <div className={`meter-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose, wide, tone }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`glass-card modal-content ${wide ? "wide" : ""} ${tone ? `border-${tone}` : ""}`}>
        {title && <h3 className={`modal-title ${tone ? `text-${tone}` : ""}`}>{title}</h3>}
        {children}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog. With `confirmText`, the user must type it exactly
 * (used for destructive actions, typically the server name).
 */
export function ConfirmDialog({ title, children, confirmText, confirmLabel = "Confirmar", danger = true, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = !confirmText || typed === confirmText;
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm(typed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onCancel} tone={danger ? "danger" : undefined}>
      <div className="modal-body stack">{children}</div>
      {confirmText && (
        <div className="form-group">
          <label>
            Escribe <strong className="mono">{confirmText}</strong> para confirmar
          </label>
          <input className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-muted" onClick={onCancel}>
          Cancelar
        </button>
        <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={!ok || busy} onClick={go}>
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function ErrorNotice({ error }) {
  if (!error) return null;
  return <div className="notice error">{String(error)}</div>;
}

