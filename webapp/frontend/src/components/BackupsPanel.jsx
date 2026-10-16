import { useState, useEffect, useRef } from "react";
import { formatDate, formatBytes } from "../utils";
import { useGoogleDrive } from "../hooks";
import "./BackupsPanel.css";

export default function BackupsPanel({
  serverId,
  serverName,
  slug,
  refresh,
  backups,
  loading,
  error,
  activeOp,
  opStatus,
  logs,
  triggerBackup,
  triggerTest,
  triggerRestore,
  deleteBackup,
  clearLogs,
}) {
  const [confirmRestoreFile, setConfirmRestoreFile] = useState(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [confirmDeleteFile, setConfirmDeleteFile] = useState(null);
  const [showConsole, setShowConsole] = useState(false);
  const [repoTab, setRepoTab] = useState("local"); // 'local' | 'cloud'
  
  // Google Drive Cloud integration states
  const drive = useGoogleDrive(serverId, slug);
  const [showGoogleSettings, setShowGoogleSettings] = useState(false);
  const [confirmDeleteCloudFile, setConfirmDeleteCloudFile] = useState(null);
  
  // Settings Form States
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [folderName, setFolderName] = useState("Minecraft Server Backups");
  const [rollingLimit, setRollingLimit] = useState(5);
  const [showClientSecret, setShowClientSecret] = useState(false);

  // Success/Error Toast Notification
  const [toast, setToast] = useState(null);

  const terminalEndRef = useRef(null);

  // Auto-scroll the terminal console logs to the bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Automatically expand/show console if an operation starts running
  useEffect(() => {
    if (activeOp && opStatus === "running") {
      setShowConsole(true);
    }
  }, [activeOp, opStatus]);

  // Sync Google Drive settings config once fetched
  useEffect(() => {
    if (drive.config) {
      setClientId(drive.config.clientId || "");
      setFolderName(drive.config.folderName || "Minecraft Server Backups");
      setRollingLimit(drive.config.rollingLimit || 5);
    }
  }, [drive.config]);

  // Read URL query parameters for Google OAuth redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("google_link")) {
      const statusParam = params.get("google_link");
      if (statusParam === "success") {
        setToast({
          type: "success",
          message: "🎉 Google Drive account linked successfully!",
        });
      } else {
        const msg = params.get("message") || "Authentication rejected.";
        setToast({
          type: "danger",
          message: `❌ Google Drive connection failed: ${msg}`,
        });
      }
      
      // Clean query parameters from URL path
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
      
      // Refresh list and status
      drive.fetchStatus();
      drive.fetchRemoteBackups();
    }
  }, [drive]);

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Calculations for stats
  const totalCount = backups.length;
  const totalSizeBytes = backups.reduce((acc, b) => acc + (b.size || 0), 0);
  const totalSizeFormatted = formatBytes(totalSizeBytes);

  const isBusy = activeOp && opStatus === "running";

  const handleRestoreClick = (backup) => {
    setConfirmRestoreFile(backup);
  };

  const handleDeleteClick = (backup) => {
    setConfirmDeleteFile(backup);
  };

  const confirmRestoreAction = () => {
    if (confirmRestoreFile) {
      triggerRestore(confirmRestoreFile.name, restoreConfirmText);
      setConfirmRestoreFile(null);
      setRestoreConfirmText("");
    }
  };

  const confirmDeleteAction = () => {
    if (confirmDeleteFile) {
      deleteBackup(confirmDeleteFile.name);
      setConfirmDeleteFile(null);
    }
  };

  // Google Drive Settings Actions
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await drive.saveConfig({
        clientId,
        clientSecret: clientSecret || undefined, // Only send secret if typed
        folderName,
        rollingLimit,
      });
      setClientSecret(""); // Reset field
      setToast({
        type: "success",
        message: "Settings saved successfully! You can now link your Google Account.",
      });
    } catch (err) {
      setToast({
        type: "danger",
        message: `Error saving config: ${err.message}`,
      });
    }
  };

  const handleConnectClick = () => {
    if (!drive.config.clientId || (!drive.config.clientSecretSet && !clientSecret)) {
      alert("Please configure and save your Client ID and Client Secret first.");
      return;
    }
    drive.connect();
  };

  const handleDisconnectClick = () => {
    if (window.confirm("Are you sure you want to unlink your Google Drive account? Cloud backups will remain on your Drive, but auto-syncing will stop.")) {
      drive.disconnect();
      setToast({
        type: "success",
        message: "Disconnected from Google Drive.",
      });
    }
  };

  const handleCloudDownload = async (cloudFile) => {
    try {
      setToast({
        type: "info",
        message: `⬇️ Fetching "${cloudFile.name}" from Google Drive to local server...`,
      });
      await drive.downloadBackup(cloudFile.id, cloudFile.name);
      refresh?.();
      setToast({
        type: "success",
        message: `Successfully downloaded "${cloudFile.name}" from cloud.`,
      });
    } catch (err) {
      setToast({
        type: "danger",
        message: `Download failed: ${err.message}`,
      });
    }
  };

  const handleManualUpload = async (localFile) => {
    try {
      setToast({
        type: "info",
        message: `⬆️ Syncing "${localFile.name}" to Google Drive...`,
      });
      await drive.uploadBackup(localFile.name);
      setToast({
        type: "success",
        message: `Successfully uploaded "${localFile.name}" to cloud!`,
      });
    } catch (err) {
      setToast({
        type: "danger",
        message: `Upload failed: ${err.message}`,
      });
    }
  };

  const handleConfirmDeleteCloudClick = (cloudFile) => {
    setConfirmDeleteCloudFile(cloudFile);
  };

  const confirmDeleteCloudAction = async () => {
    if (confirmDeleteCloudFile) {
      try {
        await drive.deleteRemoteBackup(confirmDeleteCloudFile.id);
        setToast({
          type: "success",
          message: "Deleted cloud archive successfully.",
        });
      } catch (err) {
        setToast({
          type: "danger",
          message: `Delete failed: ${err.message}`,
        });
      } finally {
        setConfirmDeleteCloudFile(null);
      }
    }
  };

  return (
    <div className="backups-container">
      {/* ── Toast Notification Bar ─────────────────────────────── */}
      {toast && (
        <div className={`toast-notification alert-${toast.type}`}>
          <span className="toast-message">{toast.message}</span>
          <button className="btn-close-toast" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {/* ── Confirm Restore Modal ───────────────────────────────── */}
      {confirmRestoreFile && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content border-warning">
            <h3 className="modal-title text-warning">
              ⚠️ Warning: Restore Backup
            </h3>
            <p className="modal-body">
              Are you absolutely sure you want to restore the backup{" "}
              <strong>{confirmRestoreFile.name}</strong>?
            </p>
            <div className="alert-box alert-danger">
              <strong>CRITICAL NOTICE:</strong> This action will gracefully
              shut down the Minecraft server, <strong>COMPLETELY OVERWRITE</strong>{" "}
              the active world data, and restart the server. Your current
              unsaved changes will be lost!
            </div>
            <div className="form-group">
              <label htmlFor="restore-confirm">
                Type <strong>{serverName}</strong> to confirm
              </label>
              <input
                id="restore-confirm"
                className="input"
                autoFocus
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-muted"
                onClick={() => {
                  setConfirmRestoreFile(null);
                  setRestoreConfirmText("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                disabled={restoreConfirmText !== serverName}
                onClick={confirmRestoreAction}
              >
                Yes, Restore Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Local Delete Modal ──────────────────────────── */}
      {confirmDeleteFile && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content border-danger">
            <h3 className="modal-title text-danger">🗑️ Delete Backup</h3>
            <p className="modal-body">
              Are you sure you want to permanently delete the backup archive{" "}
              <strong>{confirmDeleteFile.name}</strong>?
            </p>
            <p className="text-secondary text-sm">
              This will remove the file from the server disk and cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-muted"
                onClick={() => setConfirmDeleteFile(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteAction}>
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Cloud Delete Modal ──────────────────────────── */}
      {confirmDeleteCloudFile && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content border-danger">
            <h3 className="modal-title text-danger">🗑️ Delete Cloud Backup</h3>
            <p className="modal-body">
              Are you sure you want to permanently delete the cloud archive{" "}
              <strong>{confirmDeleteCloudFile.name}</strong>?
            </p>
            <p className="text-secondary text-sm">
              This will remove the file from Google Drive and cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-muted"
                onClick={() => setConfirmDeleteCloudFile(null)}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteCloudAction}>
                Delete From Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Google Drive Settings Modal ─────────────────────────── */}
      {showGoogleSettings && (
        <div className="modal-backdrop">
          <div className="glass-card modal-content google-settings-modal">
            <div className="modal-header">
              <h3>☁️ Google Drive Sync Settings</h3>
              <button className="btn-close-modal" onClick={() => setShowGoogleSettings(false)}>×</button>
            </div>
            
            <div className="settings-split">
              {/* Instructions Panel */}
              <div className="instructions-panel">
                <h4>Setup Guide</h4>
                <ol>
                  <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">Google Cloud Console</a>.</li>
                  <li>Create a new project and enable the <strong>Google Drive API</strong>.</li>
                  <li>Configure the <strong>OAuth Consent Screen</strong>. Set access to <em>External</em> or <em>Internal</em>, and add the scope <code>.../auth/drive.file</code>.</li>
                  <li>Create <strong>OAuth 2.0 Client ID</strong> credentials with Application Type set to <em>Web Application</em>.</li>
                  <li>Add this authorized redirect URI:
                    <div className="uri-copy-box">
                      <code>http://localhost:3001/api/google-drive/callback</code>
                    </div>
                  </li>
                  <li>Copy the Client ID and Client Secret, paste them on the right, and save!</li>
                </ol>
              </div>

              {/* Form Panel */}
              <form onSubmit={handleSaveSettings} className="settings-form">
                <div className="form-group">
                  <label>OAuth Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="123456-abcdef.apps.googleusercontent.com"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>OAuth Client Secret</label>
                  <div className="secret-input-wrapper">
                    <input
                      type={showClientSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      placeholder={drive.config.clientSecretSet ? "•••••••••••••••• (Saved)" : "Enter Secret Key"}
                      required={!drive.config.clientSecretSet}
                    />
                    <button
                      type="button"
                      className="btn-toggle-secret"
                      onClick={() => setShowClientSecret(!showClientSecret)}
                    >
                      {showClientSecret ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Google Drive Folder Name</label>
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    placeholder="Minecraft Server Backups"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Rolling Backups Retention Limit</label>
                  <input
                    type="number"
                    value={rollingLimit}
                    onChange={(e) => setRollingLimit(parseInt(e.target.value, 10))}
                    min="1"
                    max="50"
                    required
                  />
                  <small className="help-text">Max cloud backups to keep. Older backups will be auto-pruned.</small>
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn btn-emerald" disabled={drive.operationActive}>
                    Save API Configuration
                  </button>
                </div>
              </form>
            </div>

            <hr className="divider" />

            <div className="link-status-footer">
              <div className="link-info">
                <span className="label">Sync Account:</span>
                {drive.status.isLinked ? (
                  <span className="linked-email">
                    Linked as <strong>{drive.status.email}</strong>
                  </span>
                ) : (
                  <span className="unlinked-status">Not connected</span>
                )}
              </div>
              <div className="link-actions">
                {drive.status.isLinked ? (
                  <button
                    className="btn btn-danger btn-glow"
                    type="button"
                    onClick={handleDisconnectClick}
                    disabled={drive.operationActive}
                  >
                    Disconnect Google Account
                  </button>
                ) : (
                  <button
                    className={`btn btn-primary btn-glow ${(!drive.config.clientId) ? "btn-disabled" : ""}`}
                    type="button"
                    onClick={handleConnectClick}
                    disabled={drive.operationActive || !drive.config.clientId}
                  >
                    Link Google Drive Account
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Header Section ──────────────────────────────────── */}
      <div className="backups-header">
        <div className="header-meta">
          <h2>Backup Management</h2>
          <p className="text-secondary">
            Create, verify, and restore backups of your Minecraft world saves.
          </p>
        </div>
        <button
          className={`btn btn-primary btn-glow ${isBusy ? "btn-disabled" : ""}`}
          onClick={triggerBackup}
          disabled={isBusy}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Create Backup
        </button>
      </div>

      {/* ── Quick Stats Grid ────────────────────────────────────── */}
      <div className="backups-stats-grid">
        <div className="glass-card stat-card">
          <div className="stat-icon icon-emerald">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="stat-data">
            <span className="stat-label">Total Backups</span>
            <span className="stat-value">{totalCount}</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon icon-info">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="stat-data">
            <span className="stat-label">Total Disk Space</span>
            <span className="stat-value">{totalSizeFormatted}</span>
          </div>
        </div>

        <div className="glass-card stat-card">
          <div className="stat-icon icon-warn">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="stat-data">
            <span className="stat-label">Operational State</span>
            <span
              className={`stat-value text-sm ${
                isBusy
                  ? "status-running-text"
                  : opStatus === "success"
                  ? "status-success-text"
                  : opStatus === "failed"
                  ? "status-failed-text"
                  : ""
              }`}
            >
              {isBusy
                ? `Running ${activeOp}...`
                : opStatus === "success"
                ? `Last ${activeOp} Succeeded`
                : opStatus === "failed"
                ? `Last ${activeOp} Failed`
                : "Idle"}
            </span>
          </div>
        </div>

        {/* ── BREATHTAKING GOOGLE DRIVE QUICK STAT CARD ──────────── */}
        <div
          className="glass-card stat-card hover-glow"
          onClick={() => setShowGoogleSettings(true)}
          style={{ cursor: "pointer" }}
        >
          <div className="stat-icon icon-blue">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="stat-data" style={{ overflow: "hidden" }}>
            <span className="stat-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              Google Drive
              <span className={`pulse-dot ${drive.status.isLinked ? "linked" : "unlinked"}`}></span>
            </span>
            <span
              className="stat-value text-sm"
              title={drive.status.isLinked ? drive.status.email : "Configure Sync"}
              style={{
                fontSize: "0.85rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "140px",
              }}
            >
              {drive.status.isLinked ? drive.status.email : "Configure Sync"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Active Operation Console ────────────────────────────── */}
      {activeOp && (
        <div className="glass-card operation-console">
          <div className="console-header" onClick={() => setShowConsole(!showConsole)}>
            <div className="console-title">
              {isBusy ? (
                <div className="spinner"></div>
              ) : opStatus === "success" ? (
                <span className="indicator success">●</span>
              ) : (
                <span className="indicator danger">●</span>
              )}
              <span>
                Console: {activeOp.toUpperCase()} —{" "}
                <strong className={`status-${opStatus}`}>{opStatus.toUpperCase()}</strong>
              </span>
            </div>
            <button className="btn-toggle-console">
              {showConsole ? "Hide Terminal" : "Show Terminal"}
            </button>
          </div>

          {showConsole && (
            <div className="console-body">
              <div className="console-terminal">
                {logs.length === 0 ? (
                  <div className="console-line text-muted">
                    No log output captured yet...
                  </div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="console-line">
                      <span className="line-time">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className="line-text">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
              <div className="console-actions">
                <button className="btn btn-muted btn-sm" onClick={clearLogs}>
                  Clear Terminal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Repository Tab Selector ─────────────────────────────── */}
      <div className="repository-tabs-header">
        <button
          className={`repo-tab-btn ${repoTab === "local" ? "active" : ""}`}
          onClick={() => setRepoTab("local")}
        >
          🖴 Local Server Storage ({totalCount})
        </button>
        <button
          className={`repo-tab-btn ${repoTab === "cloud" ? "active" : ""}`}
          onClick={() => setRepoTab("cloud")}
        >
          ☁️ Google Drive Cloud ({drive.status.isLinked ? drive.remoteBackups.length : "Locked"})
        </button>
      </div>

      {/* ── Repository Listing Card ────────────────────────────── */}
      <div className="glass-card backups-list-wrapper">
        
        {/* LOCAL REPOSITORY VIEW */}
        {repoTab === "local" && (
          <>
            <div className="list-header-flex">
              <h3 className="list-title">Local Backup Archives</h3>
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
            
            {loading && totalCount === 0 ? (
              <div className="loading-state">
                <div className="spinner spinner-lg"></div>
                <p>Loading backup repository...</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="empty-state">
                <svg
                  viewBox="0 0 24 24"
                  width="48"
                  height="48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-muted"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="9" x2="15" y2="9" />
                  <line x1="9" y1="13" x2="15" y2="13" />
                  <line x1="9" y1="17" x2="11" y2="17" />
                </svg>
                <p>No world backup files found on the disk.</p>
                <button className="btn btn-emerald btn-sm" onClick={triggerBackup}>
                  Trigger First Backup
                </button>
              </div>
            ) : (
              <div className="backups-table-responsive">
                <table className="backups-table">
                  <thead>
                    <tr>
                      <th>Archive Name</th>
                      <th>Created Date</th>
                      <th>Size</th>
                      <th className="actions-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((backup) => (
                      <tr key={backup.name} className="backup-row">
                        <td className="cell-name">
                          <div className="file-name-container">
                            <svg
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="file-icon"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="12" y1="18" x2="12" y2="12" />
                              <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                            <span className="file-name" title={backup.name}>
                              {backup.name}
                            </span>
                          </div>
                        </td>
                        <td className="cell-date">{formatDate(backup.mtime)}</td>
                        <td className="cell-size">{formatBytes(backup.size)}</td>
                        <td className="cell-actions">
                          <div className="action-buttons-group">
                            {/* Manual Upload to Google Drive */}
                            <button
                              className={`action-btn btn-upload ${!drive.status.isLinked ? "btn-disabled" : ""}`}
                              title={drive.status.isLinked ? "Upload copy to Google Drive" : "Link Google Drive in settings to upload"}
                              onClick={() => handleManualUpload(backup)}
                              disabled={isBusy || drive.operationActive || !drive.status.isLinked}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                              Upload
                            </button>
                            <button
                              className="action-btn btn-verify"
                              title="Verify Integrity (Starts test container)"
                              onClick={() => triggerTest(backup.name)}
                              disabled={isBusy}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                              Verify
                            </button>
                            <button
                              className="action-btn btn-restore"
                              title="Restore world save (Stops server)"
                              onClick={() => handleRestoreClick(backup)}
                              disabled={isBusy}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <polyline points="3 3 3 8 8 8" />
                              </svg>
                              Restore
                            </button>
                            <button
                              className="action-btn btn-delete"
                              title="Delete backup file permanently"
                              onClick={() => handleDeleteClick(backup)}
                              disabled={isBusy}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* CLOUD REPOSITORY VIEW */}
        {repoTab === "cloud" && (
          <>
            <div className="list-header-flex">
              <h3 className="list-title">Google Drive Cloud Backups</h3>
              <button
                className="btn btn-muted btn-sm"
                onClick={() => drive.fetchRemoteBackups()}
                disabled={drive.loadingList || !drive.status.isLinked}
              >
                🔄 Refresh Cloud List
              </button>
            </div>

            {!drive.status.isLinked ? (
              <div className="empty-state cloud-locked">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <h4>Cloud Backups are Unconfigured</h4>
                <p>Configure Google Drive credentials and authorize your account to unlock remote backups syncing.</p>
                <button className="btn btn-blue btn-glow btn-sm" onClick={() => setShowGoogleSettings(true)}>
                  Configure & Link Google Drive
                </button>
              </div>
            ) : drive.loadingList ? (
              <div className="loading-state">
                <div className="spinner spinner-lg"></div>
                <p>Syncing with Google Drive backups folder...</p>
              </div>
            ) : drive.remoteBackups.length === 0 ? (
              <div className="empty-state">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
                  <path d="M17.5 19a5.5 5.5 0 0 0 2.5-10.5 8.5 8.5 0 0 0-15.5 1.5A5.5 5.5 0 0 0 5 21h12.5" />
                </svg>
                <p>No backups found in your Google Drive cloud folder yet.</p>
                <button
                  className="btn btn-emerald btn-sm"
                  onClick={() => {
                    setRepoTab("local");
                    setToast({ type: "info", message: "Select any local backup and click 'Upload' to push it to Google Drive!" });
                  }}
                >
                  Upload First Backup
                </button>
              </div>
            ) : (
              <div className="backups-table-responsive">
                <table className="backups-table">
                  <thead>
                    <tr>
                      <th>Cloud File Name</th>
                      <th>Upload Date</th>
                      <th>Size</th>
                      <th className="actions-header">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drive.remoteBackups.map((cloudFile) => (
                      <tr key={cloudFile.id} className="backup-row">
                        <td className="cell-name">
                          <div className="file-name-container">
                            <svg
                              viewBox="0 0 24 24"
                              width="20"
                              height="20"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="file-icon cloud-file-icon"
                            >
                              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                            <span className="file-name" title={cloudFile.name}>
                              {cloudFile.name}
                            </span>
                          </div>
                        </td>
                        <td className="cell-date">{formatDate(cloudFile.mtime)}</td>
                        <td className="cell-size">{formatBytes(cloudFile.size)}</td>
                        <td className="cell-actions">
                          <div className="action-buttons-group">
                            <button
                              className="action-btn btn-download-cloud"
                              title="Download backup file from Google Drive"
                              onClick={() => handleCloudDownload(cloudFile)}
                              disabled={isBusy || drive.operationActive}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              Download
                            </button>
                            <button
                              className="action-btn btn-delete"
                              title="Delete backup file from Google Drive permanently"
                              onClick={() => handleConfirmDeleteCloudClick(cloudFile)}
                              disabled={isBusy || drive.operationActive}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                width="16"
                                height="16"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
