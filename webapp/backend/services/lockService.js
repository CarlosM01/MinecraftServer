const realtime = require("../realtime");
const { HttpError } = require("../httpError");

/**
 * In-memory mutex per server. Long operations (backup, restore, update,
 * clone, world changes, start/stop) must hold the lock so they never overlap.
 */
class LockService {
  constructor() {
    this.locks = new Map(); // serverId -> { op, since }
  }

  get(serverId) {
    return this.locks.get(Number(serverId)) || null;
  }

  acquire(serverId, op) {
    const id = Number(serverId);
    const current = this.locks.get(id);
    if (current) {
      throw new HttpError(409, `Operación '${current.op}' en curso para este servidor. Espera a que termine.`);
    }
    this.locks.set(id, { op, since: new Date().toISOString() });
    this._broadcast(id);
  }

  release(serverId) {
    const id = Number(serverId);
    this.locks.delete(id);
    this._broadcast(id);
  }

  /**
   * Run `fn` while holding the lock; always releases it afterwards.
   * @template T
   * @param {number} serverId
   * @param {string} op
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withLock(serverId, op, fn) {
    this.acquire(serverId, op);
    try {
      return await fn();
    } finally {
      this.release(serverId);
    }
  }

  _broadcast(id) {
    const payload = { serverId: id, lock: this.get(id) };
    realtime.emit(`server:${id}`, "server:lock", payload);
    realtime.emit("global", "server:lock", payload);
  }
}

module.exports = new LockService();
