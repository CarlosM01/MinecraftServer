import { useState, useCallback, useEffect } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export function useGoogleDrive() {
  const [status, setStatus] = useState({
    isLinked: false,
    email: null,
    folderName: "Minecraft Server Backups",
    rollingLimit: 5,
  });
  
  const [config, setConfig] = useState({
    clientId: "",
    clientSecretSet: false,
    folderName: "Minecraft Server Backups",
    rollingLimit: 5,
  });

  const [remoteBackups, setRemoteBackups] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [operationActive, setOperationActive] = useState(false);
  const [error, setError] = useState(null);

  // 1. Fetch connection status
  const fetchStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/status`);
      if (!res.ok) throw new Error("Failed to fetch Google Drive status.");
      const data = await res.json();
      setStatus(data);
      setError(null);
      return data;
    } catch (err) {
      console.error("[useGoogleDrive] Error fetching status:", err);
      setError(err.message);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // 2. Fetch API Credentials configuration
  const fetchConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/config`);
      if (!res.ok) throw new Error("Failed to fetch Google Drive credentials.");
      const data = await res.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error fetching config:", err);
      setError(err.message);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // 3. Fetch remote backups list
  const fetchRemoteBackups = useCallback(async () => {
    if (!status.isLinked) return;
    try {
      setLoadingList(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/list`);
      if (!res.ok) throw new Error("Failed to fetch remote backups.");
      const data = await res.json();
      setRemoteBackups(data.backups || []);
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error fetching remote backups:", err);
      setError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, [status.isLinked]);

  // 4. Save credentials
  const saveConfig = useCallback(async (newConfig) => {
    try {
      setOperationActive(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save Google Drive config.");
      }
      await fetchConfig();
      await fetchStatus();
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error saving config:", err);
      setError(err.message);
      throw err;
    } finally {
      setOperationActive(false);
    }
  }, [fetchConfig, fetchStatus]);

  // 5. Disconnect account
  const disconnect = useCallback(async () => {
    try {
      setOperationActive(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/disconnect`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to disconnect account.");
      setStatus({
        isLinked: false,
        email: null,
        folderName: "Minecraft Server Backups",
        rollingLimit: 5,
      });
      setRemoteBackups([]);
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error disconnecting:", err);
      setError(err.message);
    } finally {
      setOperationActive(false);
    }
  }, []);

  // 6. Connect (Trigger OAuth redirect)
  const connect = useCallback(async () => {
    try {
      setOperationActive(true);
      // Send current browser origin so the callback redirects us back here
      const clientOrigin = window.location.origin;
      const res = await fetch(`${BACKEND_URL}/api/google-drive/auth-url?origin=${encodeURIComponent(clientOrigin)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate auth URL.");
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("[useGoogleDrive] Error connecting:", err);
      setError(err.message);
      alert(err.message);
    } finally {
      setOperationActive(false);
    }
  }, []);

  // 7. Manually upload a local backup file to Drive
  const uploadBackup = useCallback(async (filename) => {
    try {
      setOperationActive(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/upload/${encodeURIComponent(filename)}`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to upload backup to Google Drive.");
      }
      await fetchRemoteBackups();
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error uploading backup:", err);
      setError(err.message);
      alert(err.message);
    } finally {
      setOperationActive(false);
    }
  }, [fetchRemoteBackups]);

  // 8. Download a remote backup file to local server
  const downloadBackup = useCallback(async (id, filename) => {
    try {
      setOperationActive(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/download/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to download cloud backup.");
      }
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error downloading remote backup:", err);
      setError(err.message);
      alert(err.message);
    } finally {
      setOperationActive(false);
    }
  }, []);

  // 9. Delete a remote backup file from Drive
  const deleteRemoteBackup = useCallback(async (id) => {
    try {
      setOperationActive(true);
      const res = await fetch(`${BACKEND_URL}/api/google-drive/delete/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete remote backup.");
      }
      await fetchRemoteBackups();
      setError(null);
    } catch (err) {
      console.error("[useGoogleDrive] Error deleting remote backup:", err);
      setError(err.message);
      alert(err.message);
    } finally {
      setOperationActive(false);
    }
  }, [fetchRemoteBackups]);

  // Initial loads
  useEffect(() => {
    fetchStatus();
    fetchConfig();
  }, [fetchStatus, fetchConfig]);

  // Load files list once linked
  useEffect(() => {
    if (status.isLinked) {
      fetchRemoteBackups();
    }
  }, [status.isLinked, fetchRemoteBackups]);

  return {
    status,
    config,
    remoteBackups,
    loadingStatus,
    loadingConfig,
    loadingList,
    operationActive,
    error,
    fetchStatus,
    fetchConfig,
    fetchRemoteBackups,
    saveConfig,
    disconnect,
    connect,
    uploadBackup,
    downloadBackup,
    deleteRemoteBackup,
  };
}
