import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/**
 * Custom React hook to manage backup states, fetch/delete backups,
 * trigger backup/restore/test operations, and stream real-time logs.
 */
export function useBackupOperations(maxLines = 300) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Real-time socket states
  const [activeOp, setActiveOp] = useState(null);
  const [opStatus, setOpStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [socketConnected, setSocketConnected] = useState(false);
  
  const socketRef = useRef(null);
  const bufferRef = useRef([]);
  const flushRef = useRef(null);

  // Flush log buffer into state smoothly
  const scheduleFlush = useCallback(() => {
    if (flushRef.current) return;
    flushRef.current = requestAnimationFrame(() => {
      setLogs([...bufferRef.current]);
      flushRef.current = null;
    });
  }, []);

  const clearLogs = useCallback(() => {
    bufferRef.current = [];
    setLogs([]);
  }, []);

  // 1. Fetch initial backups list and operational status
  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND_URL}/api/backups`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setBackups(data.backups || []);
      
      // Sync operation status
      if (data.operation) {
        setActiveOp(data.operation.activeOp);
        setOpStatus(data.operation.status || "idle");
        if (data.operation.logs) {
          bufferRef.current = [...data.operation.logs];
          setLogs([...data.operation.logs]);
        }
      }
      setError(null);
    } catch (err) {
      console.error("[useBackupOperations] Failed to fetch backups:", err);
      setError("Failed to fetch backups listing.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. REST API operations
  const triggerBackup = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/backups`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to trigger backup.");
      }
      // Instantly show active state in UI
      setActiveOp("backup");
      setOpStatus("running");
      clearLogs();
    } catch (err) {
      console.error("[useBackupOperations] Error triggering backup:", err);
      alert(err.message);
    }
  }, [clearLogs]);

  const triggerTest = useCallback(async (filename) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/backups/${encodeURIComponent(filename)}/test`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to trigger verification.");
      }
      setActiveOp("test");
      setOpStatus("running");
      clearLogs();
    } catch (err) {
      console.error("[useBackupOperations] Error triggering test:", err);
      alert(err.message);
    }
  }, [clearLogs]);

  const triggerRestore = useCallback(async (filename) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/backups/${encodeURIComponent(filename)}/restore`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to trigger restore.");
      }
      setActiveOp("restore");
      setOpStatus("running");
      clearLogs();
    } catch (err) {
      console.error("[useBackupOperations] Error triggering restore:", err);
      alert(err.message);
    }
  }, [clearLogs]);

  const deleteBackup = useCallback(async (filename) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/backups/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete backup.");
      }
      // Refresh list
      fetchBackups();
    } catch (err) {
      console.error("[useBackupOperations] Error deleting backup:", err);
      alert(err.message);
    }
  }, [fetchBackups]);

  // Connect to Socket.io operations namespace
  useEffect(() => {
    fetchBackups();

    const socket = io(`${BACKEND_URL}/backups/operations`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("status", (data) => {
      setActiveOp(data.activeOp);
      setOpStatus(data.status);
      
      // When an operation finishes, refresh the backups list
      if (data.status === "success" || data.status === "failed") {
        fetchBackups();
      }
    });

    socket.on("log_history", (history) => {
      if (history && history.length > 0) {
        bufferRef.current = [...history];
        setLogs([...history]);
      }
    });

    socket.on("log", (data) => {
      const buf = bufferRef.current;
      buf.push(data);

      if (buf.length > maxLines) {
        buf.splice(0, buf.length - maxLines);
      }

      scheduleFlush();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (flushRef.current) {
        cancelAnimationFrame(flushRef.current);
        flushRef.current = null;
      }
    };
  }, [maxLines, scheduleFlush, fetchBackups]);

  return {
    backups,
    loading,
    error,
    activeOp,
    opStatus,
    logs,
    socketConnected,
    fetchBackups,
    triggerBackup,
    triggerTest,
    triggerRestore,
    deleteBackup,
    clearLogs,
  };
}

export default useBackupOperations;
