/**
 * Format milliseconds into a human-readable uptime string.
 * @param {number} ms
 * @returns {string}
 */
export function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600) / 60);
  const secs  = totalSec % 60;

  const parts = [];
  if (days > 0)  parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  if (days === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

/**
 * Format an ISO date string into a short local string.
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Human-readable byte size. */
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / 1024 ** i).toFixed(i ? 1 : 0))} ${units[i]}`;
}

/** Megabytes → "1.5 GB" / "512 MB". */
export function formatMb(mb) {
  if (mb == null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** Seconds → "3h 12m". */
export function formatDuration(seconds) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** "hace 5 min" style relative time. */
export function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export const STATUS_LABELS = {
  online: "En línea",
  starting: "Iniciando",
  stopped: "Detenido",
  restarting: "Reiniciando",
  crashloop: "Crash loop",
  missing: "Sin contenedor",
};

export const TYPE_LABELS = {
  VANILLA: "Vanilla",
  PAPER: "Paper",
  PURPUR: "Purpur",
  FABRIC: "Fabric",
  QUILT: "Quilt",
  FORGE: "Forge",
  NEOFORGE: "NeoForge",
  MODRINTH: "Modpack (Modrinth)",
};

/** Player avatar (works for online-mode UUIDs; falls back to the name). */
export function avatarUrl(player, size = 32) {
  const id = player.uuid && !player.uuid.startsWith("offline:") ? player.uuid : player.name;
  return `https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size}`;
}
