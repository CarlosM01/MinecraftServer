#!/usr/bin/env python3
"""
Script for automatic Minecraft backups.
Stops the server, copies the data with rsync, optionally compresses it and
restarts the server.

Two ways of controlling the server:
  --container NAME   docker stop/start a single container (used by the web panel)
  --compose-dir DIR  docker compose down/up (legacy single-server setup, default)
"""

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime


def run_command(args, cwd=None):
    """Executes a command (list form, no shell) and exits on error."""
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
        'source': os.path.join(base_dir, 'data', 'world'),
        'dest': os.path.join(base_dir, 'backup'),
        'compose_dir': base_dir
    }


def main():
    defaults = get_default_paths()

    parser = argparse.ArgumentParser(description="Script to backup a Minecraft server running in Docker.")
    parser.add_argument("--source", default=defaults['source'], help="Directory to backup (world or whole data folder).")
    parser.add_argument("--dest", default=defaults['dest'], help="Directory where backups will be saved.")
    parser.add_argument("--compose-dir", default=defaults['compose_dir'], help="Directory containing docker-compose.yml.")
    parser.add_argument("--container", help="Stop/start this container instead of using docker compose.")
    parser.add_argument("--prefix", default="minecraft_world_backup", help="Backup file name prefix.")
    parser.add_argument("--exclude", action="append", default=[], help="rsync exclude pattern (repeatable).")
    parser.add_argument("--no-compress", action="store_true", help="Do not compress the backup into a .tar.gz file.")
    parser.add_argument("--keep-uncompressed", action="store_true", help="Keep the original directory after compressing.")

    args = parser.parse_args()

    source_dir = os.path.abspath(args.source)
    backup_base_dir = os.path.abspath(args.dest)
    compose_dir = os.path.abspath(args.compose_dir)

    if not os.path.isdir(source_dir):
        print(f"Error: source directory {source_dir} does not exist.")
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(backup_base_dir, f"{args.prefix}_{timestamp}")
    os.makedirs(backup_dir, exist_ok=True)

    print(f"Starting automatic Minecraft backup to {backup_dir}", flush=True)

    # 1. Stop the server (remember whether it was running)
    if args.container:
        was_running = container_running(args.container)
        stop_cmd = ["docker", "stop", "-t", "60", args.container]
        start_cmd = ["docker", "start", args.container]
    else:
        was_running = True
        stop_cmd = ["docker", "compose", "down"]
        start_cmd = ["docker", "compose", "up", "-d"]

    exit_code = 0
    try:
        if was_running:
            print("Stopping the Minecraft server...", flush=True)
            run_command(stop_cmd, cwd=compose_dir)
        else:
            print("Server is not running; backing up directly.", flush=True)

        # 2. Backup with rsync
        print("Copying files with rsync...", flush=True)
        rsync_cmd = ["rsync", "-a", "--delete"]
        for pattern in args.exclude:
            rsync_cmd.append(f"--exclude={pattern}")
        rsync_cmd += [f"{source_dir}/", f"{backup_dir}/"]
        run_command(rsync_cmd)
    except subprocess.CalledProcessError:
        exit_code = 1
    finally:
        # 3. Restart the server as soon as the copy is done
        if was_running:
            print("Restarting the Minecraft server...", flush=True)
            try:
                run_command(start_cmd, cwd=compose_dir)
            except subprocess.CalledProcessError:
                exit_code = 1

    if exit_code:
        shutil.rmtree(backup_dir, ignore_errors=True)
        sys.exit(exit_code)

    # 4. Compress the backup (server already back online)
    if not args.no_compress:
        compressed_backup = f"{backup_dir}.tar.gz"
        print(f"Compressing the backup to {compressed_backup}...", flush=True)
        try:
            run_command(["tar", "-czf", compressed_backup, "-C", backup_base_dir, os.path.basename(backup_dir)])
        except subprocess.CalledProcessError:
            sys.exit(1)

        if not args.keep_uncompressed:
            print("Cleaning up the uncompressed directory...", flush=True)
            shutil.rmtree(backup_dir)
            print(f"Backup completed successfully: {compressed_backup}", flush=True)
        else:
            print(f"Backup completed successfully: {compressed_backup} and uncompressed directory preserved.", flush=True)
    else:
        print(f"Backup completed successfully (uncompressed): {backup_dir}", flush=True)


if __name__ == "__main__":
    main()
