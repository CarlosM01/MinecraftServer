import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useServerRoom, useSocketEvent } from "../socket";

const MAX_PROGRESS = 50;

/**
 * One server: config from REST, live status/stats/lock/progress from its
 * socket room.
 */
export function useServer(serverId) {
  const id = Number(serverId);
  const [server, setServer] = useState(null);
  const [stats, setStats] = useState(null);
  const [progress, setProgress] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setServer(await api.get(`/api/servers/${id}`));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Callers key the component by server id, so state starts fresh per server
  useEffect(() => {
    api
      .get(`/api/servers/${id}`)
      .then((s) => {
        setServer(s);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useServerRoom(id);

  useSocketEvent("server:status", (s) => {
    if (s.serverId !== id) return;
    setServer((srv) => (srv ? { ...srv, runtime: { ...srv.runtime, ...s } } : srv));
    if (s.status !== "online" && s.status !== "starting") setStats(null);
  });

  useSocketEvent("stats", (s) => {
    if (s.serverId === id) setStats(s);
  });

  useSocketEvent("server:lock", ({ serverId: sid, lock }) => {
    if (sid === id) setServer((srv) => (srv ? { ...srv, lock } : srv));
  });

  useSocketEvent("server:progress", (p) => {
    if (p.serverId !== id) return;
    setProgress((list) => [...list, p].slice(-MAX_PROGRESS));
    if (p.done) reload();
  });

  return { server, stats, progress, error, loading, reload };
}

export default useServer;
