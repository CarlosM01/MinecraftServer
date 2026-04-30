.PHONY: help up down logs console backup test-backup down-test miner lumber init zt-status zt-info zt-peers

# Default target
help:
	@echo "Available commands:"
	@echo "  make up      - Start the Minecraft server (detached)"
	@echo "  make down    - Stop the Minecraft server"
	@echo "  make logs    - View the Minecraft server logs"
	@echo "  make console - Access the Minecraft server terminal (Ctrl+P, Ctrl+Q to exit)"
	@echo "  make backup  - Run the automated backup script (use FLAGS=\"--flag\" to pass arguments)"
	@echo "                 Flags:"
	@echo "                   --source <dir>      World directory to backup"
	@echo "                   --dest <dir>        Directory where backups will be saved"
	@echo "                   --compose-dir <dir> Directory containing docker-compose.yml"
	@echo "                   --no-compress       Do not compress the backup into a .tar.gz file"
	@echo "                   --keep-uncompressed Keep the original directory after compressing"
	@echo "  make test-backup FILE=<path> - Test a backup file (add FLAGS=\"--manual\" for manual inspection)"
	@echo "  make down-test - Stop and clean up the test server environment"
	@echo "  make miner   - Run the XP Miner bot"
	@echo "  make lumber  - Run the Lumberjack bot"
	@echo "  make init    - Initialize and install dependencies for the Node.js bots"
	@echo ""
	@echo "ZeroTier VPN:"
	@echo "  make zt-status - Show ZeroTier daemon status"
	@echo "  make zt-info   - List joined ZeroTier networks and assigned IPs"
	@echo "  make zt-peers  - List connected ZeroTier peers"

# Docker Compose commands
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

console:
	@echo "WARNING: To exit the console without stopping the server, press Ctrl+P followed by Ctrl+Q."
	docker attach minecraft-server

# Python Backup Script
backup:
	python3 scripts/backup_script.py $(FLAGS)

test-backup:
	@if [ -z "$(FILE)" ]; then echo "Error: FILE argument is required (e.g. make test-backup FILE=backup/mybackup.tar.gz)"; exit 1; fi
	python3 scripts/test_backup.py --file $(FILE) $(FLAGS)

down-test:
	docker compose -f docker-compose.test.yml down
	rm -rf data-test

# Node.js Bots
miner:
	cd scripts/xp_miner && node miner.js

lumber:
	cd scripts/lumber && node lumber.js

init:
	@echo "Installing dependencies for xp_miner..."
	cd scripts/xp_miner && npm install
	@echo "Installing dependencies for lumber..."
	cd scripts/lumber && npm install
	@echo "Done!"

# ZeroTier VPN commands
zt-status:
	docker exec zerotier-vpn zerotier-cli status

zt-info:
	docker exec zerotier-vpn zerotier-cli listnetworks

zt-peers:
	docker exec zerotier-vpn zerotier-cli listpeers
