import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import BackupsPanel from "../../components/BackupsPanel";
import { ErrorNotice } from "../../components/ui";
import { useBackupOperations } from "../../hooks";

function FromBackup({ server, backups }) {
  const navigate = useNavigate();
  const [backup, setBackup] = useState("");
  const [name, setName] = useState(`${server.name} (copia)`);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const files = backups.filter((b) => !b.isDir);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.post(`/api/servers/${server.id}/from-backup`, { backup, name });
      navigate(`/servers/${s.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!files.length) return null;
  return (
    <section className="glass-card card stack">
      <div className="card-title" style={{ margin: 0 }}>Crear un servidor nuevo desde un backup</div>
      <p className="muted text-sm">Útil para probar una actualización o recuperar algo sin tocar este servidor. Se crea detenido, con otro puerto.</p>
      <div className="row">
        <select className="select" style={{ maxWidth: 380 }} value={backup} onChange={(e) => setBackup(e.target.value)}>
          <option value="">Elige un backup…</option>
          {files.map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 260 }} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-muted btn-sm" disabled={!backup || !name || busy} onClick={create}>{busy ? "Creando…" : "Crear servidor"}</button>
      </div>
      <ErrorNotice error={error} />
    </section>
  );
}

export default function BackupsTab({ server }) {
  const ops = useBackupOperations(server.id, 300);
  return (
    <div className="stack">
      <BackupsPanel
        serverId={server.id}
        serverName={server.name}
        slug={server.slug}
        refresh={ops.fetchBackups}
        backups={ops.backups}
        loading={ops.loading}
        error={ops.error}
        activeOp={ops.activeOp}
        opStatus={ops.opStatus}
        logs={ops.logs}
        triggerBackup={ops.triggerBackup}
        triggerTest={ops.triggerTest}
        triggerRestore={ops.triggerRestore}
        deleteBackup={ops.deleteBackup}
        clearLogs={ops.clearLogs}
      />
      <FromBackup server={server} backups={ops.backups} />
    </div>
  );
}
