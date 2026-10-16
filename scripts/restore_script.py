#!/usr/bin/env python3
"""
Script to restore a Minecraft backup.
Stops the server, overwrites the data with the backup contents, and restarts the server.
Supports both world-only backups and full data-folder backups (see backup_utils.py).
"""

import argparse
import os
import subprocess
import sys

from backup_utils import extract_backup

# Re-downloadable runtime files that are kept when cleaning before a restore
DEFAULT_PRESERVE = ["libraries", "versions", "cache", ".cache", "logs", "*.jar"]


def run_command(args, cwd=None):
    """Executes a command (list form, no shell) and raises on error."""
    try:
        result = subprocess.run(args, check=True, capture_output=True, text=True, cwd=cwd)
        print(f"Command successful: {' '.join(args)}", flush=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error executing '{' '.join(args)}': {e.stderr}", flush=True)
        raise


def container_running(name):
    result = subprocess.run(
        ["docker", "inspect", "-f", "{{.State.Running}}", name],
        capture_output=True, text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def get_default_paths():
    # Assumes the script is in base_dir/scripts/
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(script_dir)

    return {
        'dest': os.path.join(base_dir, 'data'),
        'compose_dir': base_dir
    }


def main():
    defaults = get_default_paths()

    parser = argparse.ArgumentParser(description="Script to restore a Minecraft backup.")
    parser.add_argument("--file", required=True, help="Path to the backup .tar.gz file.")
    parser.add_argument("--dest", default=defaults['dest'], help="Server data directory to restore into.")
    parser.add_argument("--level", default="world", help="World folder name (for world-only backups).")
    parser.add_argument("--compose-dir", default=defaults['compose_dir'], help="Directory containing docker-compose.yml.")
    parser.add_argument("--container", help="Stop/start this container instead of using docker compose.")
    parser.add_argument("--no-server", action="store_true", help="Only extract; do not stop/start any server.")
    parser.add_argument("--no-clean", action="store_true", help="Merge into the destination instead of replacing it.")

    args = parser.parse_args()
    backup_file = os.path.abspath(args.file)
    data_dir = os.path.abspath(args.dest)
    compose_dir = os.path.abspath(args.compose_dir)

    if not os.path.exists(backup_file):
        print(f"Error: Backup file {backup_file} not found.")
        sys.exit(1)

    print(f"Starting restore of backup {backup_file} to {data_dir}", flush=True)

    if args.no_server:
        was_running = False
    elif args.container:
        was_running = container_running(args.container)
        stop_cmd = ["docker", "stop", "-t", "60", args.container]
        start_cmd = ["docker", "start", args.container]
    else:
        was_running = True
        stop_cmd = ["docker", "compose", "down"]
        start_cmd = ["docker", "compose", "up", "-d"]

    exit_code = 0
    try:
        # 1. Stop the server
        if was_running:
            print("Stopping the Minecraft server...", flush=True)
            run_command(stop_cmd, cwd=compose_dir)

        # 2. Extract the backup over the data folder
        print(f"Extracting backup from {backup_file}...", flush=True)
        extract_backup(
            backup_file,
            data_dir,
            level=args.level,
            clean=not args.no_clean,
            preserve=DEFAULT_PRESERVE,
        )
        print("Restore file extraction successful.", flush=True)
    except Exception as e:  # noqa: BLE001 - always try to bring the server back
        print(f"Error during restore: {e}", flush=True)
        exit_code = 1
    finally:
        # 3. Restart the server (also after an error, to avoid leaving it down)
        if was_running:
            print("Restarting the Minecraft server...", flush=True)
            try:
                run_command(start_cmd, cwd=compose_dir)
            except subprocess.CalledProcessError:
                exit_code = 1

    if exit_code:
        sys.exit(exit_code)
    print("✅ Restore completed successfully!", flush=True)


if __name__ == "__main__":
    main()
