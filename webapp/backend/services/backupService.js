const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

class BackupService {
  constructor() {
    this.serverRootDir = path.resolve(__dirname, "..", "..");
    this.backupDir = path.join(this.serverRootDir, "backup");
    
    // Operation state
    this.activeOp = null; // 'backup' | 'restore' | 'test' | null
    this.opStatus = "idle"; // 'idle' | 'running' | 'success' | 'failed'
    this.opLogs = [];
    this.ns = null; // Socket.io namespace instance
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Set the Socket.io namespace for real-time broadcasts.
   * @param {import("socket.io").Namespace} ns 
   */
  setNamespace(ns) {
    this.ns = ns;
  }

  /**
   * List all backup files and directories in the backup folder.
   * @returns {Promise<Array<{name: string, size: number, mtime: string, isDir: boolean}>>}
   */
  async listBackups() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }
      
      const files = await fs.promises.readdir(this.backupDir);
      const list = [];
      
      for (const file of files) {
        // Skip hidden files
        if (file.startsWith(".")) continue;
        
        const fullPath = path.join(this.backupDir, file);
        const stat = await fs.promises.stat(fullPath);
        
        list.push({
          name: file,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          isDir: stat.isDirectory(),
        });
      }
      
      // Sort backups by modification time, newest first
      return list.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    } catch (err) {
      console.error("[BackupService] Error listing backups:", err);
      throw err;
    }
  }

  /**
   * Delete a backup file or directory from the filesystem.
   * @param {string} filename 
   */
  async deleteBackup(filename) {
    if (this.activeOp && this.opStatus === "running") {
      throw new Error("Cannot delete backups while an operation is in progress.");
    }
    
    // Prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    const fullPath = path.join(this.backupDir, safeFilename);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Backup file ${filename} not found.`);
    }
    
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(fullPath);
    }
    console.log(`[BackupService] Deleted backup: ${safeFilename}`);
  }

  /**
   * Retrieve the current operation state.
   */
  getStatus() {
    return {
      activeOp: this.activeOp,
      status: this.opStatus,
      logs: this.opLogs,
    };
  }

  /**
   * Clear the operation logs.
   */
  clearLogs() {
    this.opLogs = [];
    if (this.ns) {
      this.ns.emit("logs_cleared");
    }
  }

  /**
   * Run a python script as a background process and stream output.
   * @param {string} scriptPath Relative path to python script
   * @param {string[]} args Command-line arguments
   * @param {string} opName Operation name ('backup' | 'restore' | 'test')
   */
  _runPythonScript(scriptPath, args, opName) {
    if (this.activeOp && this.opStatus === "running") {
      throw new Error(`Cannot start '${opName}' operation. '${this.activeOp}' is currently running.`);
    }

    this.activeOp = opName;
    this.opStatus = "running";
    this.opLogs = [];
    
    this._broadcastStatus();
    
    const fullScriptPath = path.join(this.serverRootDir, scriptPath);
    console.log(`[BackupService] Starting operation '${opName}' with command: python3 ${scriptPath} ${args.join(" ")}`);
    
    const child = spawn("python3", [fullScriptPath, ...args], {
      cwd: this.serverRootDir,
    });
    
    const handleOutput = (data) => {
      const output = data.toString();
      const lines = output.split("\n");
      
      lines.forEach((line) => {
        const trimmed = line.trimEnd();
        if (!trimmed && line === "\n") return;
        if (!trimmed) return;
        
        const logEntry = {
          timestamp: new Date().toISOString(),
          message: trimmed,
        };
        
        this.opLogs.push(logEntry);
        
        // Keep logs size capped at 500 lines to avoid high memory
        if (this.opLogs.length > 500) {
          this.opLogs.shift();
        }
        
        if (this.ns) {
          this.ns.emit("log", logEntry);
        }
      });
    };
    
    child.stdout.on("data", handleOutput);
    child.stderr.on("data", handleOutput);
    
    child.on("close", (code) => {
      console.log(`[BackupService] Operation '${opName}' finished with exit code ${code}`);
      this.opStatus = code === 0 ? "success" : "failed";
      this._broadcastStatus();

      // Trigger automatic cloud upload if Google Drive is linked
      if (code === 0 && opName === "backup") {
        try {
          const googleDriveService = require("./googleDriveService");
          if (googleDriveService.isLinked()) {
            const logMsg = (msg) => {
              const entry = {
                timestamp: new Date().toISOString(),
                message: `[Google Drive] ${msg}`,
              };
              this.opLogs.push(entry);
              if (this.ns) {
                this.ns.emit("log", entry);
              }
            };

            logMsg("New local backup detected. Initiating background upload to Google Drive...");

            this.listBackups()
              .then((backupsList) => {
                if (backupsList && backupsList.length > 0) {
                  const newestBackup = backupsList[0];
                  const fullBackupPath = path.join(this.backupDir, newestBackup.name);

                  logMsg(`Syncing "${newestBackup.name}" to cloud folder...`);
                  googleDriveService
                    .uploadBackup(fullBackupPath)
                    .then((driveFile) => {
                      logMsg(`Backup successfully uploaded to Google Drive! (Cloud ID: ${driveFile.id})`);
                      logMsg(`Google Drive storage rolling limit active (Limit: ${googleDriveService.config.rollingLimit}).`);
                    })
                    .catch((uploadErr) => {
                      logMsg(`Cloud backup upload failed: ${uploadErr.message}`);
                    });
                } else {
                  logMsg("No local backup file found to upload.");
                }
              })
              .catch((err) => {
                logMsg(`Error finding backup file to upload: ${err.message}`);
              });
          }
        } catch (err) {
          console.error("[BackupService] Error triggering automatic Google Drive upload:", err);
        }
      }
    });
    
    child.on("error", (err) => {
      console.error(`[BackupService] Failed to spawn process for '${opName}':`, err);
      this.opStatus = "failed";
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: `System Error: Failed to launch script. ${err.message}`,
      };
      this.opLogs.push(logEntry);
      
      if (this.ns) {
        this.ns.emit("log", logEntry);
      }
      this._broadcastStatus();
    });
  }

  /**
   * Broadcast status updates via Socket.io.
   */
  _broadcastStatus() {
    if (this.ns) {
      this.ns.emit("status", {
        activeOp: this.activeOp,
        status: this.opStatus,
      });
    }
  }

  /**
   * Trigger a new Minecraft backup using backup_script.py.
   */
  triggerBackup() {
    // backup_script.py defaults to data/world and backup folders
    this._runPythonScript("scripts/backup_script.py", [], "backup");
  }

  /**
   * Trigger a verification test on a backup tarball using test_backup.py.
   * @param {string} filename 
   */
  triggerTest(filename) {
    const safeFilename = path.basename(filename);
    const backupFilePath = path.join(this.backupDir, safeFilename);
    
    this._runPythonScript(
      "scripts/test_backup.py",
      ["--file", backupFilePath],
      "test"
    );
  }

  /**
   * Trigger a restore of a backup tarball using restore_script.py.
   * @param {string} filename 
   */
  triggerRestore(filename) {
    const safeFilename = path.basename(filename);
    const backupFilePath = path.join(this.backupDir, safeFilename);
    
    this._runPythonScript(
      "scripts/restore_script.py",
      ["--file", backupFilePath],
      "restore"
    );
  }
}

module.exports = new BackupService();
