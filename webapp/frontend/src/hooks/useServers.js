import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useSocketEvent } from "../socket";

/**
 * All servers plus their live summary (status, CPU, RAM, players), kept up
 * to date from the "global" socket room.
 */
export function useServers() {
  const [servers, setServers] = useState([]);
  const [summary, setSummary] = useState({}); // serverId -> summary row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setServers(await api.get("/api/servers"));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api
      .get("/api/servers")
      .then(setServers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useSocketEvent("servers:summary", (rows) => {
    setSummary(Object.fromEntries(rows.map((r) => [r.serverId, r])));
  });

  useSocketEvent("server:status", (s) => {
    setServers((list) =>
      list.map((srv) => (srv.id === s.serverId ? { ...srv, runtime: { ...srv.runtime, ...s } } : srv))
    );
  });

  useSocketEvent("server:lock", ({ serverId, lock }) => {
    setServers((list) => list.map((srv) => (srv.id === serverId ? { ...srv, lock } : srv)));
  });

  useSocketEvent("server:removed", ({ serverId }) => {
    setServers((list) => list.filter((s) => s.id !== serverId));
  });

  useSocketEvent("server:progress", (p) => {
    if (p.done) reload();
  });

  return { servers, summary, loading, error, reload };
}

export default useServers;
