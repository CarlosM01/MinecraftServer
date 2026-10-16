import { NavLink } from "react-router-dom";
import { useSocketConnected } from "../socket";
import "./Header.css";

export default function Header({ onLogout }) {
  const connected = useSocketConnected();
  return (
    <header className="app-header" id="app-header">
      <div className="header-left">
        <NavLink to="/" className="logo" id="logo" style={{ color: "inherit" }}>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="3" />
            <path d="M7 7h2v2H7zM15 7h2v2h-2zM7 15h2v2H7zM15 15h2v2h-2zM11 11h2v2h-2z" />
          </svg>
          <h1>Panel Minecraft</h1>
        </NavLink>
        <nav className="app-nav">
          <NavLink to="/" end>Servidores</NavLink>
          <NavLink to="/players">Jugadores</NavLink>
          <NavLink to="/audit">Auditoría</NavLink>
        </nav>
      </div>
      <div className="header-right row">
        <span className="row muted text-xs" title={connected ? "Tiempo real conectado" : "Sin conexión en tiempo real"}>
          <span className={`conn-dot ${connected ? "on" : ""}`} />
          {connected ? "En vivo" : "Desconectado"}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          Salir
        </button>
      </div>
    </header>
  );
}
