import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { BACKEND_URL } from "./api";

/**
 * One Socket.io connection for the whole app (authenticated by the session
 * cookie). Created lazily after login, closed on logout.
 */
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL || undefined, {
      transports: ["websocket"],
      withCredentials: true,
      reconnectionDelay: 2000,
    });
  }
  return socket;
}

export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Connection state of the shared socket. */
export function useSocketConnected() {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}

/**
 * Subscribe to a socket event. The handler can change between renders
 * without re-registering the listener.
 */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const s = getSocket();
    const fn = (payload) => ref.current(payload);
    s.on(event, fn);
    return () => s.off(event, fn);
  }, [event]);
}

/**
 * Join a server room (server:<id> or terminal:<id>) while mounted, and
 * re-join after reconnects.
 * @param {"subscribe"|"terminal:join"} joinEvent
 */
export function useServerRoom(serverId, joinEvent = "subscribe") {
  useEffect(() => {
    if (!serverId) return;
    const s = getSocket();
    const leaveEvent = joinEvent === "subscribe" ? "unsubscribe" : "terminal:leave";
    const join = () => s.emit(joinEvent, { serverId: Number(serverId) });
    if (s.connected) join();
    s.on("connect", join);
    return () => {
      s.off("connect", join);
      s.emit(leaveEvent, { serverId: Number(serverId) });
    };
  }, [serverId, joinEvent]);
}
