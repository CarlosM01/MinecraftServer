#!/usr/bin/env python3
"""
Script to restore a Minecraft world backup.
Stops the server, overwrites the active world directory with the backup contents, and restarts the server.
"""

import subprocess
import sys
import os
import argparse
import shutil
import tarfile

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
        'dest': os.path.join(base_dir, 'data', 'world'),
        'compose_dir': base_dir
    }

def main():
    defaults = get_default_paths()
    
    parser = argparse.ArgumentParser(description="Script to restore a Minecraft backup.")
    parser.add_argument("--file", required=True, help="Path to the backup .tar.gz file.")
    parser.add_argument("--dest", default=defaults['dest'], help="Active world directory to overwrite.")
    parser.add_argument("--compose-dir", default=defaults['compose_dir'], help="Directory containing docker-compose.yml.")
    
    args = parser.parse_args()
    backup_file = os.path.abspath(args.file)
    world_dest_dir = os.path.abspath(args.dest)
    compose_dir = os.path.abspath(args.compose_dir)

    if not os.path.exists(backup_file):
        print(f"Error: Backup file {backup_file} not found.")
        sys.exit(1)

    print(f"Starting restore of backup {backup_file} to {world_dest_dir}")

    # 1. Stop the server
    print("Stopping the Minecraft server...")
    run_command("docker compose down", cwd=compose_dir)

    # 2. Clean up existing world directory
    if os.path.exists(world_dest_dir):
        print(f"Cleaning existing world directory at {world_dest_dir}...")
        shutil.rmtree(world_dest_dir)
        
    os.makedirs(world_dest_dir, exist_ok=True)

    # 3. Extract the backup
    print(f"Extracting backup from {backup_file}...")
    try:
        with tarfile.open(backup_file, "r:gz") as tar:
            # Get the top-level directory in the tar file
            top_dir = os.path.commonpath(tar.getnames())
            
            # Extract to a temporary location
            temp_extract_dir = os.path.join(compose_dir, "temp_restore_extract")
            if os.path.exists(temp_extract_dir):
                shutil.rmtree(temp_extract_dir)
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            tar.extractall(path=temp_extract_dir)
            
            # Move the contents of the extracted top-level directory to dest/world
            extracted_world = os.path.join(temp_extract_dir, top_dir)
            print(f"Moving restored files to {world_dest_dir}...")
            for item in os.listdir(extracted_world):
                s = os.path.join(extracted_world, item)
                d = os.path.join(world_dest_dir, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
                    
            shutil.rmtree(temp_extract_dir)
            print("Restore file extraction successful.")
    except Exception as e:
        print(f"Error extracting backup during restore: {e}")
        # Try restarting the server anyway to avoid leaving it down
        print("Attempting to restart the server despite the error...")
        run_command("docker compose up -d", cwd=compose_dir)
        sys.exit(1)

    # 4. Restart the server
    print("Restarting the Minecraft server...")
    run_command("docker compose up -d", cwd=compose_dir)
    print("✅ Restore completed successfully!")

if __name__ == "__main__":
    main()
