import { useState, useRef, useEffect } from "react";
import "./LogsPanel.css";

/**
 * Format a timestamp for display.
 */
function formatTs(ts) {
  try {
    return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return ts;
  }
}

/**
 * Highlight log-level keywords in a message.
 */
function highlightMessage(msg) {
  const parts = [];
  const regex = /\b(INFO|WARN(?:ING)?|ERROR|FATAL)\b/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(msg)) !== null) {
    if (match.index > lastIndex) {
      parts.push(msg.slice(lastIndex, match.index));
    }
    const keyword = match[1].toUpperCase();
    let cls = "kw-info";
    if (keyword === "WARN" || keyword === "WARNING") cls = "kw-warn";
    if (keyword === "ERROR" || keyword === "FATAL") cls = "kw-error";
    parts.push(
      <span key={match.index} className={cls}>{match[1]}</span>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < msg.length) {
    parts.push(msg.slice(lastIndex));
  }

  return parts;
}

export default function LogsPanel({ logs, clearLogs }) {
  const [autoScroll, setAutoScroll] = useState(true);
  const bodyRef = useRef(null);

  // Auto-scroll when new logs arrive
  useEffect(() => {
    if (autoScroll && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <section className="logs-panel glass-card" id="logs-panel">
      <div className="logs-header">
        <div className="logs-title-row">
          <svg className="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          <span className="stat-title">Server Logs</span>
          <span className="log-count" id="log-count">{logs.length} lines</span>
        </div>
        <div className="logs-controls">
          <label className="toggle-label" htmlFor="auto-scroll-toggle">
            <input
              type="checkbox"
              id="auto-scroll-toggle"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>Auto-scroll</span>
          </label>
          <button
            className="btn-clear"
            id="btn-clear-logs"
            title="Clear logs"
            onClick={clearLogs}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="logs-body" id="logs-body" ref={bodyRef}>
        {logs.length === 0 ? (
          <div className="log-placeholder">Waiting for logs…</div>
        ) : (
          logs.map((entry, i) => (
            <div className="log-line" key={i}>
              <span className="log-ts">{formatTs(entry.timestamp)}</span>{" "}
              <span className={`log-src ${entry.source}`}>{entry.source}</span>{" "}
              <span className="log-msg">{highlightMessage(entry.message)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
