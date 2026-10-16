# Dockerized Minecraft Servers & Admin Panel

> **Note:** This is my personal Minecraft server configuration, just for fun. It is designed specifically for **Linux** environments.

A web admin panel that creates and manages several Minecraft servers, each one in its own `itzg/minecraft-server` Docker container, plus scripts for backups and in-game bots.

## Features

- **Multiple servers**: create Vanilla, Paper, Purpur, Fabric, Quilt, Forge, NeoForge or Modrinth modpack servers from the browser. Each one gets its own container (`mc-<slug>`), data folder (`servers/<slug>/data`), port, RAM/CPU limits and Java version.
- **Interactive terminal**: the live console of every server in the browser (xterm.js), attached directly to the container, with command history and autocompletion.
- **Player monitoring**: who is online right now (with session time and IP), a live join/leave feed, session history, total play time per player, and kick / ban / op / whitelist actions.
- **Mods & plugins**: search and install from Modrinth (filtered by loader and game version, with required dependencies), upload your own `.jar`, enable/disable, update checks.
- **Versions & upgrades**: change the version or type with a compatibility report of your installed mods; a backup is taken automatically first.
- **Health & resources**: CPU/RAM/players/TPS charts (up to 30 days), TPS/MSPT (Paper, spark or `/tick query`), host capacity and overcommit protection, disk usage, crash reports and crash-loop protection.
- **Worlds**: several worlds per server, switch the active one, upload/download as zip, reset the Nether/End, Chunky pre-generation, BlueMap/Dynmap integration.
- **Backups**: per-server backups (manual, or automatic before upgrades), restore, test in a temporary server, optional Google Drive sync, create a new server from a backup, clone servers.
- **Safety**: admin login, per-server operation locks (no backup during a restart), typed-name confirmation for destructive actions, and an audit log of every action.
- **Custom bots**: Node.js mineflayer bots in `scripts/` (XP miner, lumberjack).

## Prerequisites

- **Docker** with the Compose plugin.
- **Node.js 20+** and **Python 3** with `rsync`/`tar` on the host, unless you run the panel in its container (`make up`).

## Getting Started

1. **Configure the panel** — set at least `ADMIN_PASSWORD` (and preferably `JWT_SECRET`):
   ```bash
   cp webapp/backend/.env.example webapp/backend/.env
   cp .env.example .env   # only needed for the panel container / legacy import
   ```

2. **Start the panel**, either in Docker:
   ```bash
   make up          # builds and starts the "minecraft-panel" container
   ```
   or directly on the host:
   ```bash
   make webapp-install
   make panel       # builds the frontend and starts the backend
   ```
   Then open `http://localhost:3001` and log in.

3. **Create a server** with **+ Nuevo servidor**, or import an existing one (see below).

### Importing the old single server

Before the panel, this repository ran one server from `docker-compose.yml` with its data in `./data`. To keep using that world, register it in the panel — the data stays where it is:

- from the UI: **Servidores → Importar existente**, or
- from the command line (panel running, values taken from the root `.env`):
  ```bash
  make import-legacy
  ```

The import removes the old `minecraft-server` container (not its data) so the port is free, and creates a managed `mc-<slug>` container on the same folder.

## Make Commands Overview

- `make up` / `make down` / `make logs` — run the panel container (Minecraft servers keep running when the panel stops)
- `make panel` — run the panel on the host
- `make import-legacy` — register `./data` in the panel
- `make console SERVER=<slug>` — attach to a server console (Ctrl+P, Ctrl+Q to exit)
- `make backup SERVER=<slug> [DATA=<dir>]` — command-line backup of a server
- `make test-backup FILE=<path>` — test a backup file (add `FLAGS="--manual"` to inspect it yourself on port 25566)
- `make down-test` — stop and clean up the test server
- `make miner` / `make lumber` / `make init` — Node.js bots
- `make webapp-install`, `make webapp-dev`, `make webapp-frontend`, `make webapp-build`, `make webapp-check`, `make webapp-test` — development

## Backups

Backups live in `backup/<slug>/`. A backup stops the server (after warning players and flushing the world), copies the data folder with `rsync` (re-downloadable files such as `libraries/`, `versions/` and server jars are skipped), restarts it, and then compresses the copy.

From the panel (**Backups** tab) you can create, restore (type the server name to confirm), test and delete backups, link Google Drive, and create a new server from any backup. Upgrading the version or type always creates a `<slug>_pre-upgrade_*` backup first.

The scripts also work on their own:

```bash
python3 scripts/backup_script.py --source servers/survival/data --dest backup/survival --container mc-survival --prefix survival
python3 scripts/restore_script.py --file backup/survival/<file>.tar.gz --dest servers/survival/data --container mc-survival
python3 scripts/test_backup.py --file backup/survival/<file>.tar.gz --type PAPER --version 1.21.11
```

Older world-only backups (`minecraft_world_backup_*.tar.gz`) can still be restored: they are detected and extracted into the active world folder.

## Web Panel

### Architecture

- **Backend** (`webapp/backend`): Express + Socket.io + dockerode, SQLite (`webapp/backend/data/panel.db`) for the server registry, player sessions, metrics, mod metadata and audit log.
- **Frontend** (`webapp/frontend`): React + Vite, served by the backend from `webapp/frontend/dist` in production.
- Each server runs `itzg/minecraft-server:<java tag>` with RCON enabled. The panel talks to RCON via `docker exec rcon-cli`, so RCON ports are never published.

### Configuration (`webapp/backend/.env`)

| Variable | Description |
|---|---|
| `ADMIN_PASSWORD` | Admin login password (required) |
| `JWT_SECRET` | Session signing secret (random per restart if empty) |
| `SERVERS_ROOT` / `BACKUPS_ROOT` | Where server data and backups are stored (`servers`, `backup`) |
| `PORT_RANGE` | Host ports the panel assigns automatically (`25565-25600`) |
| `MC_IMAGE` | Image repository (`itzg/minecraft-server`) |
| `TZ` | Optional timezone passed to the servers |

### Development

```bash
make webapp-dev        # backend on :3001 (nodemon)
make webapp-frontend   # Vite on :3000, proxies /api and /socket.io
```

### Verification

```bash
make webapp-check                   # syntax check
make webapp-test                    # unit tests (console parsers) + module loading
make webapp-test FLAGS="--live"     # end-to-end: needs the backend running and ADMIN_PASSWORD exported
```

The live test creates a real Paper server, waits for it to come online, uses RCON and the terminal, installs Chunky from Modrinth, restarts it, checks the operation lock and deletes it.

## Network / VPN Access

The panel and the Minecraft servers publish their ports on the host. Remote access (VPN, firewall, port forwarding) is configured independently on the host machine and is not managed by this repository. Do not expose the panel port (3001) to the internet without a VPN or a reverse proxy with TLS.

## Troubleshooting

| Issue | Fix |
|---|---|
| Server stops with "crash loop" | It crashed 3 times in 10 minutes. Check the terminal and crash reports; a common cause is the wrong Java version (Settings → Imagen / Java). |
| "requires running the server with Java 25" | Choose `latest`/`java25` in Settings and click **Actualizar imagen**, then save. |
| TPS shows "N/D" | Vanilla before 1.20.3 and modded servers without spark have no TPS command. Install spark from the Mods tab. |
| Panel container cannot reach Docker | `make up` passes your `docker` group id automatically; with plain `docker compose`, set `DOCKER_GID` in `.env`. |

## Future Features / Ideas

- [ ] Scheduled backups with retention, scheduled restarts with in-game warnings
- [ ] File manager and a `server.properties` form editor
- [ ] Discord alerts (server down, high RAM, backup finished)
- [ ] Add a Discord bot integration for server status and management.
- [ ] Add more complex in-game bots (e.g., auto-builder, guard bot, or automated farmer).
- [ ] Add support for multiple server instances behind a proxy (e.g., Velocity or BungeeCord).
- [x] Create a web dashboard to view logs, manage backups, and manage several servers.
