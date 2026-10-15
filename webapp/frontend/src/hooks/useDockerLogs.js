import { useEffect, useState, useRef, useCallback } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/**
 * Hook that connects to the /docker/logs Socket.io namespace
 * and returns a circular buffer of log entries (newest last).
 *
 * @param {number} [maxLines=200] - Maximum number of log lines to keep.
 * @returns {{ logs: Array<{timestamp: string, source: string, message: string}>, connected: boolean, clearLogs: () => void }}
 */
export function useDockerLogs(maxLines = 200) {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const bufferRef = useRef([]);

  // Flush buffer into state — batched to avoid excessive re-renders
  const flushRef = useRef(null);

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

  useEffect(() => {
    const socket = io(`${BACKEND_URL}/docker/logs`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("log", (data) => {
      const buf = bufferRef.current;
      buf.push(data);

      // Circular buffer: trim from the front when over capacity
      if (buf.length > maxLines) {
        buf.splice(0, buf.length - maxLines);
      }

      scheduleFlush();
    });

    socket.on("error", (err) => {
      console.error("[useDockerLogs] Socket error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (flushRef.current) {
        cancelAnimationFrame(flushRef.current);
        flushRef.current = null;
      }
    };
  }, [maxLines, scheduleFlush]);

  return { logs, connected, clearLogs };
}

export default useDockerLogs;
