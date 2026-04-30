# Dockerized Minecraft Server & Automations

> **Note:** This is my personal Minecraft server configuration, just for fun. It is designed specifically for **Linux** environments.

A complete and containerized Minecraft server setup using Docker Compose. This repository includes everything you need to host a Minecraft server easily, along with custom scripts for in-game automation and automated server backups.

## Features

- **Dockerized Server**: Uses the highly customizable `itzg/minecraft-server` Docker image, making deployment and configuration changes seamless.
- **ZeroTier VPN Gateway**: The server runs behind a ZeroTier VPN, making it invisible from the public internet. Only authorized network members can connect.
- **Automated Backups**: A robust Python script (`backup_script.py`) that automatically gracefully stops the server, creates a compressed backup of the world data using `rsync` and `tar`, and restarts the server.
- **Custom Scripts / Bots**: Includes Node.js scripts (like `scripts/miner/miner.js`) to interact with the server or create in-game automation bots.
- **Pre-configured Gitignore**: The `.gitignore` file is strictly configured to exclude heavy runtime data (`/data`), local backups, and node modules, making this repository lightweight and safe to share without exposing sensitive `.env` variables or server worlds.

## Prerequisites

- **Docker** and **Docker Compose**: To run the Minecraft server container.
- **ZeroTier Account**: Create a network at [my.zerotier.com](https://my.zerotier.com) and note the Network ID.
- **Python 3**: To run the automated backup script.
- **Node.js** (optional): If you intend to run or modify the custom JavaScript bots.

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd minecraft-server
   ```

2. **Configure the Environment:**
   Copy the `.env.example` file to `.env` and adjust the variables to your liking:
   ```bash
   cp .env.example .env
   ```

3. **Start the Server:**
   You can start the server using the provided `Makefile`:
   ```bash
   make up
   ```
   *Note: This will automatically accept the EULA and start the server. The server data will be generated in the `/data` directory (which is git-ignored).*

4. **Install Script Dependencies (if using JS scripts):**
   ```bash
   make init
   ```

## Make Commands Overview

We provide a convenient `Makefile` to manage the server and bots:
- `make up` - Start the Minecraft server (detached)
- `make down` - Stop the Minecraft server
- `make console` - Access the Minecraft server terminal (Ctrl+P, Ctrl+Q to exit)
- `make logs` - View the Minecraft server logs
- `make backup` - Run the automated backup script (use FLAGS="--flag" to pass arguments)
- `make test-backup FILE=<path>` - Test a backup file (add FLAGS="--manual" for manual inspection)
- `make down-test` - Stop and clean up the test server environment
- `make miner` - Run the XP Miner bot
- `make lumber` - Run the Lumberjack bot
- `make init` - Install dependencies for the Node.js bots
- `make zt-status` - Show ZeroTier daemon status
- `make zt-info` - List joined ZeroTier networks and assigned IPs
- `make zt-peers` - List connected ZeroTier peers

## Running Backups

You can run the automated backup script manually or set it up as a cron job. It will automatically stop the docker container, copy the world files, compress them, and start the container again.

```bash
make backup
```

You can also pass custom arguments to the backup script using `FLAGS`:
```bash
make backup FLAGS="--no-compress"
```

### Available Backup Flags:
- `--source <dir>`: World directory to backup
- `--dest <dir>`: Directory where backups will be saved
- `--compose-dir <dir>`: Directory containing docker-compose.yml
- `--no-compress`: Do not compress the backup into a .tar.gz file
- `--keep-uncompressed`: Keep the original directory after compressing

*Backups will be saved to the directory specified inside the `.env` file or script defaults.*

## Testing Backups

You can test the integrity of a backup archive by extracting it and starting a temporary test server. This allows you to verify that the world loads correctly without affecting your main server.

```bash
make test-backup FILE=path/to/backup.tar.gz
```

By default, this will extract the backup to a temporary directory, start a test server in the background, wait for it to fully initialize, and then automatically clean up the test environment. It will report whether the verification was successful or not.

### Manual Verification

If you want to connect to the test server and explore the world yourself, you can pass the `--manual` flag:

```bash
make test-backup FILE=path/to/backup.tar.gz FLAGS="--manual"
```

This will start the test server and leave it running. You can connect to it at `localhost:25566`. Once you are done verifying the world, you must stop and clean up the test server manually:

```bash
make down-test
```

## VPN Access (ZeroTier)

This server uses ZeroTier as a VPN gateway. The Minecraft server is **not exposed to the public internet** — only authorized members of the ZeroTier network can connect.

### Quick Setup

1. Set your `ZEROTIER_NETWORK_ID` in the `.env` file.
2. Start the server: `make up`
3. Authorize the node in [my.zerotier.com](https://my.zerotier.com).
4. Players install ZeroTier, join your network, and connect using the server's ZeroTier IP.

For detailed setup instructions, see [zerotier.md](zerotier.md).

## Customization

- **Minecraft Version & Type**: You can easily change the server type (Vanilla, Paper, Forge) or version by editing the `.env` file.
- **Memory Allocation**: Adjust the `MINECRAFT_MEMORY` environment variable in the `.env` file to fit your server's hardware.

## Future Features / Ideas

- [ ] Add a Discord bot integration for server status and management.
- [ ] Implement an automated modpack updater.
- [ ] Create a web dashboard to view logs, manage backups, and toggle bot scripts.
- [ ] Add more complex in-game bots (e.g., auto-builder, guard bot, or automated farmer).
- [ ] Add support for multiple server instances behind a proxy (e.g., Velocity or BungeeCord).
