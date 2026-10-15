import ConnectionBadge from "./ConnectionBadge";
import "./Header.css";

export default function Header({ connected, error }) {
  return (
    <header className="app-header" id="app-header">
      <div className="header-left">
        <div className="logo" id="logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="3"/>
            <path d="M7 7h2v2H7zM15 7h2v2h-2zM7 15h2v2H7zM15 15h2v2h-2zM11 11h2v2h-2z"/>
          </svg>
          <h1>Minecraft Dashboard</h1>
        </div>
      </div>
      <div className="header-right">
        <ConnectionBadge connected={connected} error={error} />
      </div>
    </header>
  );
}
