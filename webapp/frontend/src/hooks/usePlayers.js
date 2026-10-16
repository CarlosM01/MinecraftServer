import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useSocketEvent } from "../socket";

const MAX_EVENTS = 100;

/**
 * Online players of a server and a live join/leave feed.
 * The caller must already be subscribed to the server room (useServer).
 */
export function usePlayers(serverId) {
  const id = Number(serverId);
  const [online, setOnline] = useState([]);
  const [max, setMax] = useState(null);
  const [events, setEvents] = useState([]);

  const reload = useCallback(async () => {
    try {
      const data = await api.get(`/api/servers/${id}/players`);
      setOnline(data.online);
      setMax(data.max);
    } catch {
      /* server not reachable; keep last state */
    }
  }, [id]);

  useEffect(() => {
    api
      .get(`/api/servers/${id}/players`)
      .then((data) => {
        setOnline(data.online);
        setMax(data.max);
      })
      .catch(() => {});
  }, [id]);

  useSocketEvent("players:update", (p) => {
    if (p.serverId !== id) return;
    setOnline(p.online);
    if (p.max != null) setMax(p.max);
  });

  useSocketEvent("players:event", (e) => {
    if (e.serverId === id) setEvents((list) => [e, ...list].slice(0, MAX_EVENTS));
  });

  return { online, max, events, reload };
}

export default usePlayers;
