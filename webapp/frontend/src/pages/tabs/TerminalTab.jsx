import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getSocket, useServerRoom, useSocketEvent } from "../../socket";
import { usePlayers } from "../../hooks";
import { ConfirmDialog } from "../../components/ui";

const COMMANDS = [
  "help", "list", "say", "tell", "msg", "me", "kick", "ban", "ban-ip", "pardon", "pardon-ip", "banlist",
  "op", "deop", "whitelist add", "whitelist remove", "whitelist list", "whitelist on", "whitelist off", "whitelist reload",
  "gamemode survival", "gamemode creative", "gamemode adventure", "gamemode spectator", "defaultgamemode",
  "difficulty peaceful", "difficulty easy", "difficulty normal", "difficulty hard",
  "time set day", "time set night", "time set noon", "time query daytime", "weather clear", "weather rain", "weather thunder",
  "tp", "teleport", "give", "clear", "effect give", "effect clear", "enchant", "xp add", "kill",
  "gamerule keepInventory true", "gamerule keepInventory false", "gamerule doDaylightCycle", "gamerule mobGriefing",
  "gamerule playersSleepingPercentage", "gamerule doInsomnia", "gamerule announceAdvancements",
  "seed", "setworldspawn", "spawnpoint", "worldborder set", "worldborder center", "locate structure", "locate biome",
  "save-all", "save-all flush", "save-on", "save-off", "reload", "tick query", "tps", "mspt", "plugins", "version",
  "spark tps", "spark profiler start", "spark profiler stop", "chunky start", "chunky pause", "chunky continue", "chunky cancel",
  "stop",
];
const PLAYER_ARG = /^(tell|msg|kick|ban|pardon|op|deop|tp|teleport|give|clear|kill|whitelist add|whitelist remove|gamemode \w+|effect give|effect clear|spawnpoint|xp add)\s+(\S*)$/;
const HISTORY_MAX = 200;

function loadHistory(id) {
  try {
    return JSON.parse(localStorage.getItem(`mc-term-history:${id}`) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(id, list) {
  try {
    localStorage.setItem(`mc-term-history:${id}`, JSON.stringify(list.slice(-HISTORY_MAX)));
  } catch {
    /* storage unavailable */
  }
}

export default function TerminalTab({ server, running }) {
  const id = server.id;
  const screenRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const inputRef = useRef(null);
  const [line, setLine] = useState("");
  const [history, setHistory] = useState(() => loadHistory(id));
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(null);
  const { online } = usePlayers(id);

  /* xterm setup */
  useEffect(() => {
    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      scrollback: 5000,
      theme: { background: "#05080f", foreground: "#e2e8f0", selectionBackground: "rgba(56,189,120,0.35)" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(screenRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* element hidden */
      }
    });
    ro.observe(screenRef.current);
    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => fitRef.current?.fit(), 50);
  }, [fullscreen]);

  useServerRoom(id, "terminal:join");

  useSocketEvent("terminal:history", (p) => {
    if (p.serverId !== id || !termRef.current) return;
    termRef.current.reset();
    if (p.data) termRef.current.write(p.data);
    if (p.error) termRef.current.writeln(`\x1b[31m${p.error}\x1b[0m`);
  });

  useSocketEvent("terminal:output", (p) => {
    if (p.serverId === id) termRef.current?.write(p.data);
  });

  /* Autocomplete: commands, then player names for player arguments */
  const suggestions = useMemo(() => {
    const text = line.replace(/^\//, "");
    if (!text) return [];
    const playerMatch = text.match(PLAYER_ARG);
    if (playerMatch) {
      const prefix = playerMatch[2].toLowerCase();
      return online
        .map((p) => p.name)
        .filter((n) => n.toLowerCase().startsWith(prefix) && n.toLowerCase() !== prefix)
        .map((n) => `${text.slice(0, text.length - playerMatch[2].length)}${n} `);
    }
    const lower = text.toLowerCase();
    return COMMANDS.filter((c) => c.startsWith(lower) && c !== lower).slice(0, 12).map((c) => `${c} `);
  }, [line, online]);

  const send = (command) => {
    setError(null);
    getSocket().emit("terminal:input", { serverId: id, command }, (res) => {
      if (!res?.ok) setError(res?.error || "No se pudo enviar el comando.");
    });
    const next = [...history.filter((h) => h !== command), command];
    setHistory(next);
    saveHistory(id, next);
    setHistIdx(-1);
    setLine("");
  };

  const submit = () => {
    const command = line.trim().replace(/^\//, "");
    if (!command) return;
    if (/^(stop|end)$/i.test(command)) {
      setConfirmStop(command);
      return;
    }
    send(command);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (suggestions.length) {
        setLine(suggestions[suggestIdx % suggestions.length]);
        setSuggestIdx(0);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length && line) {
        setSuggestIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (history.length) {
        const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
        setHistIdx(idx);
        setLine(history[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length && line && histIdx === -1) {
        setSuggestIdx((i) => (i + 1) % suggestions.length);
      } else if (histIdx !== -1) {
        const idx = histIdx + 1;
        if (idx >= history.length) {
          setHistIdx(-1);
          setLine("");
        } else {
          setHistIdx(idx);
          setLine(history[idx]);
        }
      }
    } else if (e.key === "Escape") {
      if (fullscreen) setFullscreen(false);
      setLine("");
    }
  };

  return (
    <div className={`glass-card terminal-card ${fullscreen ? "fullscreen" : ""}`}>
      <div className="terminal-toolbar">
        <span className="muted">
          Consola de <strong>{server.container_name}</strong>
          {!running && <span className="text-warning"> · servidor detenido (solo historial)</span>}
        </span>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => termRef.current?.clear()}>Limpiar</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          </button>
        </div>
      </div>
      <div className="terminal-screen" ref={screenRef} onClick={() => inputRef.current?.focus()} />
      {error && <div className="notice error" style={{ borderRadius: 0 }}>{error}</div>}
      <div className="terminal-input">
        <span className="prompt">&gt;</span>
        <input
          ref={inputRef}
          value={line}
          disabled={!running}
          placeholder={running ? "Escribe un comando (Tab autocompleta, ↑/↓ historial)" : "El servidor está detenido"}
          onChange={(e) => {
            setLine(e.target.value);
            setSuggestIdx(0);
            setHistIdx(-1);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        {suggestions.length > 0 && line && histIdx === -1 && (
          <div className="suggestions">
            {suggestions.map((s, i) => (
              <div
                key={s}
                className={i === suggestIdx % suggestions.length ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLine(s);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary btn-sm" disabled={!running || !line.trim()} onClick={submit}>Enviar</button>
      </div>
      {confirmStop && (
        <ConfirmDialog
          title="¿Detener el servidor?"
          confirmLabel="Enviar stop"
          onCancel={() => setConfirmStop(null)}
          onConfirm={() => {
            send(confirmStop);
            setConfirmStop(null);
          }}
        >
          <p>
            El comando <span className="mono">{confirmStop}</span> apaga el servidor. Con la política de reinicio del contenedor volverá a arrancar
            solo; para dejarlo apagado usa el botón <strong>Detener</strong>.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
