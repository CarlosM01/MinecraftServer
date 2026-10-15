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
