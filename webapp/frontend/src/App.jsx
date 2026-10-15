import { useState } from "react";
import { useDockerStats, useDockerLogs, useDockerInfo, useBackupOperations } from "./hooks";
import Header from "./components/Header";
import InfoBar from "./components/InfoBar";
import StatsGrid from "./components/StatsGrid";
import LogsPanel from "./components/LogsPanel";
import BackupsPanel from "./components/BackupsPanel";

export default function App() {
  const [activeTab, setActiveTab] = useState("server"); // 'server' | 'backups'
  
  const { cpu, ramUsed, ramLimit, ramPercent, uptime, connected } = useDockerStats();
  const { logs: dockerLogs, clearLogs: clearDockerLogs } = useDockerLogs(300);
  const { name, status, image, startedAt, loading, error } = useDockerInfo();

  // Backup operations hooks
  const backupOps = useBackupOperations(300);

  const isBackupBusy = backupOps.activeOp && backupOps.opStatus === "running";

  return (
    <>
      <Header connected={connected} error={error} />
      <main className="main-content">
        {/* Navigation Tabs */}
        <div className="navigation-tabs-bar" id="navigation-tabs">
          <button
            className={`nav-tab-btn ${activeTab === "server" ? "active" : ""}`}
            onClick={() => setActiveTab("server")}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="2" width="20" height="20" rx="3" />
              <path d="M7 7h2v2H7zM15 7h2v2h-2zM7 15h2v2H7zM15 15h2v2h-2zM11 11h2v2h-2z" />
            </svg>
            Live Server
          </button>
          
          <button
            className={`nav-tab-btn ${activeTab === "backups" ? "active" : ""}`}
            onClick={() => setActiveTab("backups")}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
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
            Backups Manager
            {isBackupBusy && (
              <span className="spinner" style={{ marginLeft: "4px", display: "inline-block" }}></span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "server" ? (
          <>
            <InfoBar
              name={name}
              status={status}
              image={image}
              startedAt={startedAt}
              loading={loading}
            />
            <StatsGrid
              cpu={cpu}
              ramUsed={ramUsed}
              ramLimit={ramLimit}
              ramPercent={ramPercent}
              uptime={uptime}
              startedAt={startedAt}
            />
            <LogsPanel logs={dockerLogs} clearLogs={clearDockerLogs} />
          </>
        ) : (
          <BackupsPanel
            backups={backupOps.backups}
            loading={backupOps.loading}
            error={backupOps.error}
            activeOp={backupOps.activeOp}
            opStatus={backupOps.opStatus}
            logs={backupOps.logs}
            triggerBackup={backupOps.triggerBackup}
            triggerTest={backupOps.triggerTest}
            triggerRestore={backupOps.triggerRestore}
            deleteBackup={backupOps.deleteBackup}
            clearLogs={backupOps.clearLogs}
          />
        )}
      </main>
    </>
  );
}

