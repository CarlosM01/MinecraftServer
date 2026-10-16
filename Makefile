.PHONY: help up down logs console backup test-backup down-test miner lumber init panel import-legacy webapp-install webapp-dev webapp-frontend webapp-build webapp-check webapp-test

# Host ids handed to the panel container (file ownership + docker socket access)
COMPOSE_ENV = PANEL_UID=$$(id -u) PANEL_GID=$$(id -g) DOCKER_GID=$$(getent group docker | cut -d: -f3)

# Default target
help:
	@echo "Web panel (manages every Minecraft server):"
	@echo "  make up              - Build and start the panel container (http://localhost:3001)"
	@echo "  make down            - Stop the panel container (Minecraft servers keep running)"
	@echo "  make logs            - Follow the panel logs"
	@echo "  make panel           - Run the panel directly on the host (build frontend + start backend)"
	@echo "  make import-legacy   - Register the old ./data server in the panel (panel must be running)"
	@echo ""
	@echo "Servers (SERVER=<slug>, see the panel; containers are named mc-<slug>):"
	@echo "  make console SERVER=<slug> - Attach to a server console (Ctrl+P, Ctrl+Q to exit)"
	@echo "  make backup SERVER=<slug> [DATA=<dir>] - Back up a server from the command line"
	@echo "  make test-backup FILE=<path> - Test a backup file (add FLAGS=\"--manual\" for manual inspection)"
	@echo "  make down-test       - Stop and clean up the test server environment"
	@echo ""
	@echo "Bots:"
	@echo "  make miner   - Run the XP Miner bot"
	@echo "  make lumber  - Run the Lumberjack bot"
	@echo "  make init    - Initialize and install dependencies for the Node.js bots"
	@echo ""
	@echo "Development:"
	@echo "  make webapp-install  - Install backend & frontend npm dependencies"
	@echo "  make webapp-dev      - Start the backend dev server (port 3001)"
	@echo "  make webapp-frontend - Start the frontend dev server (port 3000)"
	@echo "  make webapp-build    - Build the frontend into webapp/frontend/dist"
	@echo "  make webapp-check    - Syntax-check all backend JS files"
	@echo "  make webapp-test     - Run unit tests (FLAGS=\"--live\" for the end-to-end test)"

# Panel container
up:
	mkdir -p servers backup data webapp/backend/data webapp/backend/config
	$(COMPOSE_ENV) docker compose up -d --build

down:
	$(COMPOSE_ENV) docker compose down

logs:
	docker compose logs -f

panel: webapp-build
	cd webapp/backend && npm start

import-legacy:
	node webapp/backend/scripts/import-legacy.js

# Server helpers
console:
	@if [ -z "$(SERVER)" ]; then echo "Error: SERVER argument is required (e.g. make console SERVER=survival)"; exit 1; fi
	@echo "WARNING: To exit the console without stopping the server, press Ctrl+P followed by Ctrl+Q."
	docker attach mc-$(SERVER)

backup:
	@if [ -z "$(SERVER)" ]; then echo "Error: SERVER argument is required (e.g. make backup SERVER=survival)"; exit 1; fi
	python3 scripts/backup_script.py --source $(or $(DATA),servers/$(SERVER)/data) --dest backup/$(SERVER) \
		--container mc-$(SERVER) --prefix $(SERVER) \
		--exclude=/libraries/ --exclude=/versions/ --exclude=/cache/ --exclude=/logs/ --exclude='/*.jar' $(FLAGS)

test-backup:
	@if [ -z "$(FILE)" ]; then echo "Error: FILE argument is required (e.g. make test-backup FILE=backup/mybackup.tar.gz)"; exit 1; fi
	python3 scripts/test_backup.py --file $(FILE) $(FLAGS)

down-test:
	-docker rm -f minecraft-server-test
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

# Web Dashboard commands
webapp-install:
	@echo "Installing backend dependencies..."
	cd webapp/backend && npm install
	@echo "Installing frontend dependencies..."
	cd webapp/frontend && npm install
	@echo "Done!"

webapp-dev:
	cd webapp/backend && npm run dev

webapp-frontend:
	cd webapp/frontend && npm run dev

webapp-build:
	cd webapp/frontend && npm run build

webapp-check:
	@echo "Syntax-checking backend files..."
	@cd webapp/backend && find . -name '*.js' -not -path './node_modules/*' -exec node --check {} \;
	@echo "All files pass syntax check ✅"

webapp-test:
	cd webapp/backend && node scripts/test.js $(FLAGS)
