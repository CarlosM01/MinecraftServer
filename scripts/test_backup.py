#!/usr/bin/env python3
"""
Script to test Minecraft world backups.
It extracts a given backup archive, starts a test server,
waits for it to initialize to verify integrity, and cleans up.
"""

import subprocess
import sys
import os
import argparse
import shutil
import tarfile
import time

def run_command(command, cwd=None):
    """Executes a command and returns True if successful."""
    try:
        subprocess.run(command, shell=True, check=True, cwd=cwd)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error executing '{command}': {e}")
        return False

def get_base_dir():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(script_dir)

def main():
    base_dir = get_base_dir()
    
    parser = argparse.ArgumentParser(description="Test a Minecraft backup.")
    parser.add_argument("--file", required=True, help="Path to the backup .tar.gz file.")
    parser.add_argument("--manual", action="store_true", help="Start the server and leave it running for manual inspection.")
    
    args = parser.parse_args()
    backup_file = os.path.abspath(args.file)
    
    if not os.path.exists(backup_file):
        print(f"Error: Backup file {backup_file} not found.")
        sys.exit(1)

    data_test_dir = os.path.join(base_dir, "data-test")
    world_test_dir = os.path.join(data_test_dir, "world")

    print(f"Preparing test environment in {data_test_dir}...")
    
    # 1. Clean up existing test environment if any
    if os.path.exists(data_test_dir):
        shutil.rmtree(data_test_dir)
        
    os.makedirs(world_test_dir, exist_ok=True)

    # 2. Extract the backup
    print(f"Extracting backup from {backup_file}...")
    try:
        with tarfile.open(backup_file, "r:gz") as tar:
            # Get the top-level directory in the tar file
            top_dir = os.path.commonpath(tar.getnames())
            
            # Extract to a temporary location
            temp_extract_dir = os.path.join(base_dir, "temp_extract")
            os.makedirs(temp_extract_dir, exist_ok=True)
            tar.extractall(path=temp_extract_dir)
            
            # Move the contents of the extracted top-level directory to data-test/world
            extracted_world = os.path.join(temp_extract_dir, top_dir)
            for item in os.listdir(extracted_world):
                s = os.path.join(extracted_world, item)
                d = os.path.join(world_test_dir, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
                    
            shutil.rmtree(temp_extract_dir)
    except Exception as e:
        print(f"Error extracting backup: {e}")
        sys.exit(1)

    print("Backup extracted successfully. Starting test server...")
    
    # 3. Start the test server
    compose_cmd = "docker compose -f docker-compose.test.yml up -d"
    if not run_command(compose_cmd, cwd=base_dir):
        print("Failed to start the test server.")
        sys.exit(1)

    if args.manual:
        print("\n" + "="*50)
        print("Test server started in MANUAL mode.")
        print("You can connect to the server at localhost:25566 to verify the world.")
        print("When you are done, stop and clean up using:")
        print("  make down-test")
        print("="*50)
        sys.exit(0)

    # 4. Automatic Verification
    print("Waiting for server to initialize (this may take a minute)...")
    
    # Use subprocess.Popen to read logs in real-time
    log_cmd = ["docker", "compose", "-f", "docker-compose.test.yml", "logs", "-f"]
    process = subprocess.Popen(log_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=base_dir)
    
    success = False
    timeout = 300 # 5 minutes timeout
    start_time = time.time()
    
    try:
        for line in process.stdout:
            print(f"[TEST SERVER] {line.strip()}")
            if "Done" in line and "For help, type \"help\"" in line:
                success = True
                break
            if time.time() - start_time > timeout:
                print("Timeout reached while waiting for server to initialize.")
                break
    except KeyboardInterrupt:
        print("\nTest interrupted by user.")
    
    process.terminate()

    # 5. Clean up
    print("\nShutting down test server...")
    run_command("docker compose -f docker-compose.test.yml down", cwd=base_dir)
    
    print("Cleaning up test data directory...")
    if os.path.exists(data_test_dir):
        shutil.rmtree(data_test_dir)

    if success:
        print("\n✅ Verification Successful! The backup loaded correctly without critical errors.")
        sys.exit(0)
    else:
        print("\n❌ Verification Failed! The server did not initialize completely or timed out.")
        sys.exit(1)

if __name__ == "__main__":
    main()
