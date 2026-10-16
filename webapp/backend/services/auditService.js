const db = require("../db");

const insert = db.prepare(
  "INSERT INTO audit_log (action, server_id, target, details, ip) VALUES (?, ?, ?, ?, ?)"
);

/**
 * Persistent log of every mutating action performed through the panel.
 */
const auditService = {
  /**
   * @param {{ip?: string}|null} ctx  Express request or socket-derived context.
   * @param {string} action           e.g. "server.create", "terminal.command".
   * @param {{serverId?: number, target?: string, details?: any}} [info]
   */
  log(ctx, action, info = {}) {
    try {
      const details =
        info.details === undefined
          ? null
          : typeof info.details === "string"
            ? info.details
            : JSON.stringify(info.details);
      insert.run(action, info.serverId ?? null, info.target ?? null, details, ctx?.ip || null);
    } catch (err) {
      console.error("[audit] Failed to write entry:", err.message);
    }
  },

  list({ serverId, action, q, limit = 200, before } = {}) {
    const where = [];
    const params = [];
    if (serverId) {
      where.push("a.server_id = ?");
      params.push(serverId);
    }
    if (action) {
      where.push("a.action LIKE ?");
      params.push(`${action}%`);
    }
    if (q) {
      where.push("(a.target LIKE ? OR a.details LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (before) {
      where.push("a.id < ?");
      params.push(before);
    }
    const sql = `
      SELECT a.*, s.name AS server_name
      FROM audit_log a LEFT JOIN servers s ON s.id = a.server_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY a.id DESC LIMIT ?`;
    return db.prepare(sql).all(...params, Math.min(limit, 1000));
  },
};

module.exports = auditService;
