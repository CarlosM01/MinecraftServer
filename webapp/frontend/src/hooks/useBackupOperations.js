import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSocketEvent } from "../socket";

/**
 * Backups of one server: list, operations (backup/restore/test/delete) and
 * the real-time operation log. The caller must be subscribed to the server
 * room (useServer) so backup:* events arrive.
 */
export function useBackupOperations(serverId, maxLines = 300) {
  const id = Number(serverId);
  const base = `/api/servers/${id}/backups`;
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeOp, setActiveOp] = useState(null);
  const [opStatus, setOpStatus] = useState("idle");
  const [logs, setLogs] = useState([]);

  const bufferRef = useRef([]);
  const flushRef = useRef(null);

  // Batch log lines into one render per animation frame
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
    api.post(`${base}/logs/clear`).catch(() => {});
  }, [base]);

  const applyData = useCallback((data) => {
    setBackups(data.backups || []);
    if (data.operation) {
      setActiveOp(data.operation.activeOp);
      setOpStatus(data.operation.status || "idle");
      bufferRef.current = [...(data.operation.logs || [])];
      setLogs(bufferRef.current);
    }
    setError(null);
  }, []);

  const fetchBackups = useCallback(
    () =>
      api
        .get(base)
        .then(applyData)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    [base, applyData]
  );

  useEffect(() => {
    api
      .get(base)
      .then(applyData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    return () => {
      if (flushRef.current) cancelAnimationFrame(flushRef.current);
      flushRef.current = null;
    };
  }, [base, applyData]);

  useSocketEvent("backup:status", (s) => {
    if (s.serverId !== id) return;
    setActiveOp(s.activeOp);
    setOpStatus(s.status);
    if (s.status === "running") {
      bufferRef.current = [];
      setLogs([]);
    }
    if (s.status === "success" || s.status === "failed") fetchBackups();
  });

  useSocketEvent("backup:log", (entry) => {
    if (entry.serverId !== id) return;
    const buf = bufferRef.current;
    buf.push(entry);
    if (buf.length > maxLines) buf.splice(0, buf.length - maxLines);
    scheduleFlush();
  });

  const run = useCallback(
    async (fn, op) => {
      try {
        await fn();
        if (op) {
          setActiveOp(op);
          setOpStatus("running");
        }
      } catch (err) {
        alert(err.message);
      }
    },
    []
  );

  const triggerBackup = useCallback(() => run(() => api.post(base), "backup"), [run, base]);
  const triggerTest = useCallback(
    (name) => run(() => api.post(`${base}/${encodeURIComponent(name)}/test`), "test"),
    [run, base]
  );
  const triggerRestore = useCallback(
    (name, confirm) => run(() => api.post(`${base}/${encodeURIComponent(name)}/restore`, { confirm }), "restore"),
    [run, base]
  );
  const deleteBackup = useCallback(
    (name) => run(async () => {
      await api.del(`${base}/${encodeURIComponent(name)}`);
      await fetchBackups();
    }),
    [run, base, fetchBackups]
  );

  return {
    backups,
    loading,
    error,
    activeOp,
    opStatus,
    logs,
    fetchBackups,
    triggerBackup,
    triggerTest,
    triggerRestore,
    deleteBackup,
    clearLogs,
  };
}

export default useBackupOperations;
