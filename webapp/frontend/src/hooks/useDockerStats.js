import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

/**
 * Hook that connects to the /docker/stats Socket.io namespace
 * and returns live container stats.
 *
 * @returns {{ cpu: number, ramUsed: number, ramLimit: number, ramPercent: number, uptime: number, connected: boolean }}
 */
export function useDockerStats() {
  const [stats, setStats] = useState({
    cpu: 0,
    ramUsed: 0,
    ramLimit: 0,
    ramPercent: 0,
    uptime: 0,
  });
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(`${BACKEND_URL}/docker/stats`, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("stats", (data) => {
      setStats({
        cpu: data.cpu_percent,
        ramUsed: data.ram_used_mb,
        ramLimit: data.ram_limit_mb,
        ramPercent: data.ram_percent,
        uptime: data.uptime_ms,
      });
    });

    socket.on("error", (err) => {
      console.error("[useDockerStats] Socket error:", err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  return { ...stats, connected };
}

export default useDockerStats;
