#!/usr/bin/env python3
"""
Script to test Minecraft backups.
It extracts a given backup archive, starts a temporary test server container,
waits for it to initialize to verify integrity, and cleans up.
"""

import argparse
import os
import shutil
import subprocess
import sys
import time

from backup_utils import extract_backup


def run_command(args, cwd=None):
    """Executes a command (list form) and returns True if successful."""
    try:
        subprocess.run(args, check=True, cwd=cwd)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error executing '{' '.join(args)}': {e}", flush=True)
        return False


def get_base_dir():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(script_dir)


def remove_container(name):
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def main():
    base_dir = get_base_dir()

    parser = argparse.ArgumentParser(description="Test a Minecraft backup.")
    parser.add_argument("--file", required=True, help="Path to the backup .tar.gz file.")
    parser.add_argument("--manual", action="store_true", help="Start the server and leave it running for manual inspection.")
    parser.add_argument("--name", default="minecraft-server-test", help="Test container name.")
    parser.add_argument("--port", default="25566", help="Host port for the test server.")
    parser.add_argument("--data-dir", default=os.path.join(base_dir, "data-test"), help="Temporary data directory.")
    parser.add_argument("--image", default="itzg/minecraft-server", help="Docker image.")
    parser.add_argument("--type", default=os.environ.get("MINECRAFT_TYPE", "VANILLA"), help="Server type.")
    parser.add_argument("--version", default=os.environ.get("MINECRAFT_VERSION", ""), help="Minecraft version.")
    parser.add_argument("--memory", default=os.environ.get("MINECRAFT_MEMORY", "4G"), help="JVM memory.")
    parser.add_argument("--level", default="world", help="World folder name.")
    parser.add_argument("--env", action="append", default=[], help="Extra KEY=VALUE env var (repeatable).")
    parser.add_argument("--timeout", type=int, default=600, help="Seconds to wait for the server to start.")

    args = parser.parse_args()
    backup_file = os.path.abspath(args.file)
    data_test_dir = os.path.abspath(args.data_dir)

    if not os.path.exists(backup_file):
        print(f"Error: Backup file {backup_file} not found.")
        sys.exit(1)

    print(f"Preparing test environment in {data_test_dir}...", flush=True)

    # 1. Clean up existing test environment if any
    remove_container(args.name)
    if os.path.exists(data_test_dir):
        shutil.rmtree(data_test_dir)
    os.makedirs(data_test_dir, exist_ok=True)

    # 2. Extract the backup
    print(f"Extracting backup from {backup_file}...", flush=True)
    try:
        extract_backup(backup_file, data_test_dir, level=args.level)
    except Exception as e:  # noqa: BLE001
        print(f"Error extracting backup: {e}", flush=True)
        shutil.rmtree(data_test_dir, ignore_errors=True)
        sys.exit(1)

    print("Backup extracted successfully. Starting test server...", flush=True)

    # 3. Start the test server
    env = {
        "EULA": "TRUE",
        "TYPE": args.type,
        "MEMORY": args.memory,
        "LEVEL": args.level,
    }
    if args.version and args.version.upper() != "LATEST":
        env["VERSION"] = args.version
    for item in args.env:
        key, _, value = item.partition("=")
        if key:
            env[key] = value

    run_cmd = ["docker", "run", "-d", "--name", args.name, "-p", f"{args.port}:25565",
               "-v", f"{data_test_dir}:/data", "--restart", "no", "-t", "-i"]
    for key, value in env.items():
        run_cmd += ["-e", f"{key}={value}"]
    run_cmd.append(args.image)

    if not run_command(run_cmd):
        print("Failed to start the test server.", flush=True)
        shutil.rmtree(data_test_dir, ignore_errors=True)
        sys.exit(1)

    if args.manual:
        print("\n" + "=" * 50)
        print("Test server started in MANUAL mode.")
        print(f"You can connect to the server at localhost:{args.port} to verify the world.")
        print("When you are done, stop and clean up using:")
        print("  make down-test")
        print("=" * 50, flush=True)
        sys.exit(0)

    # 4. Automatic Verification
    print("Waiting for server to initialize (this may take a few minutes)...", flush=True)

    process = subprocess.Popen(["docker", "logs", "-f", args.name], stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, errors="replace")

    success = False
    start_time = time.time()

    try:
        for line in process.stdout:
            print(f"[TEST SERVER] {line.rstrip()}", flush=True)
            if "Done" in line and "For help, type \"help\"" in line:
                success = True
                break
            if time.time() - start_time > args.timeout:
                print("Timeout reached while waiting for server to initialize.", flush=True)
                break
    except KeyboardInterrupt:
        print("\nTest interrupted by user.")

    process.terminate()

    # 5. Clean up
    print("\nShutting down test server...", flush=True)
    remove_container(args.name)

    print("Cleaning up test data directory...", flush=True)
    shutil.rmtree(data_test_dir, ignore_errors=True)

    if success:
        print("\n✅ Verification Successful! The backup loaded correctly without critical errors.", flush=True)
        sys.exit(0)
    else:
        print("\n❌ Verification Failed! The server did not initialize completely or timed out.", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
