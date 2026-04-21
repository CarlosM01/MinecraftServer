#!/usr/bin/env python3
"""
Script for automatic Minecraft world backups.
Stops the server, copies the world directory with rsync, and restarts the server.
Requires Python 3 and access to docker-compose.
"""

import subprocess
import sys
import os
import argparse
import shutil
from datetime import datetime

def run_command(command, cwd=None):
    """Executes a command and handles errors."""
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True, cwd=cwd)
        print(f"Command successful: {command}")
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error executing '{command}': {e.stderr}")
        sys.exit(1)

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
    
    parser = argparse.ArgumentParser(description="Script to backup the Minecraft world in Docker.")
    parser.add_argument("--source", default=defaults['source'], help="World directory to backup.")
    parser.add_argument("--dest", default=defaults['dest'], help="Directory where backups will be saved.")
    parser.add_argument("--compose-dir", default=defaults['compose_dir'], help="Directory containing docker-compose.yml.")
    parser.add_argument("--no-compress", action="store_true", help="Do not compress the backup into a .tar.gz file.")
    parser.add_argument("--keep-uncompressed", action="store_true", help="Keep the original directory after compressing.")
    
    args = parser.parse_args()

    source_dir = os.path.abspath(args.source)
    backup_base_dir = os.path.abspath(args.dest)
    compose_dir = os.path.abspath(args.compose_dir)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = os.path.join(backup_base_dir, f"minecraft_world_backup_{timestamp}")
    os.makedirs(backup_dir, exist_ok=True)

    print(f"Starting automatic Minecraft world backup to {backup_dir}")

    # 1. Stop the server
    print("Stopping the Minecraft server...")
    run_command("docker compose down", cwd=compose_dir)

    # 2. Backup with rsync
    print("Copying the world with rsync...")
    rsync_cmd = f"rsync -av --delete {source_dir}/ {backup_dir}/"
    run_command(rsync_cmd)

    # 3. Compress the backup
    if not args.no_compress:
        compressed_backup = f"{backup_dir}.tar.gz"
        print(f"Compressing the backup to {compressed_backup}...")
        tar_cmd = f"tar -czf {compressed_backup} -C {backup_base_dir} {os.path.basename(backup_dir)}"
        run_command(tar_cmd)

        if not args.keep_uncompressed:
            print("Cleaning up the uncompressed directory...")
            shutil.rmtree(backup_dir)
            print(f"Backup completed successfully: {compressed_backup}")
        else:
            print(f"Backup completed successfully: {compressed_backup} and uncompressed directory preserved.")
    else:
        print(f"Backup completed successfully (uncompressed): {backup_dir}")

    # 4. Restart the server
    print("Restarting the Minecraft server...")
    run_command("docker compose up -d", cwd=compose_dir)

if __name__ == "__main__":
    main()