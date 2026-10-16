import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { closeSocket } from "./socket";
import Header from "./components/Header";
import Login from "./pages/Login";
import ServerList from "./pages/ServerList";
// Heavy pages (xterm, recharts) load on demand
const ServerCreate = lazy(() => import("./pages/ServerCreate"));
const ServerDetail = lazy(() => import("./pages/ServerDetail"));
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import Audit from "./pages/Audit";

export default function App() {
  const [auth, setAuth] = useState("loading"); // 'loading' | 'in' | 'out'

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(() => setAuth("in"))
      .catch(() => setAuth("out"));
    const onExpired = () => {
      closeSocket();
      setAuth("out");
    };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => {});
    closeSocket();
    setAuth("out");
  }, []);

  if (auth === "loading") return <div className="login-wrap"><span className="spinner spinner-lg" /></div>;
  if (auth === "out") return <Login onLogin={() => setAuth("in")} />;

  return (
    <>
      <Header onLogout={logout} />
      <main className="main-content">
        <Suspense fallback={<div className="empty"><span className="spinner" /></div>}>
        <Routes>
          <Route path="/" element={<ServerList />} />
          <Route path="/servers/new" element={<ServerCreate />} />
          <Route path="/servers/:id/*" element={<ServerDetail />} />
          <Route path="/players" element={<Players />} />
          <Route path="/players/:uuid" element={<PlayerDetail />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
    </>
  );
}
