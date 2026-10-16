const dockerService = require("./dockerService");
const monitor = require("./serverMonitor");
const auditService = require("./auditService");
const { HttpError } = require("../httpError");

const MAX_COMMAND_LENGTH = 1000;

/**
 * Interactive console: output comes from the shared `docker attach` stream
 * kept by serverMonitor (relayed to the `terminal:<id>` room); input is
 * written line by line to the server's stdin.
 */
const terminalService = {
  /** Recent console output (raw, with ANSI colours) for a joining client. */
  async history(row, tail = 500) {
    const info = await dockerService.inspect(row.container_name);
    if (!info) return "";
    return dockerService.logsTail(row.container_name, tail);
  },

  /**
   * Send a command typed in the panel terminal.
   * Only printable single lines are accepted: raw control characters
   * (Ctrl+C, the Ctrl+P Ctrl+Q detach sequence…) could kill or detach the
   * server process.
   */
  send(row, rawLine, ctx) {
    const line = String(rawLine ?? "").replace(/^\//, "").trim();
    if (!line) throw new HttpError(400, "Comando vacío.");
    if (line.length > MAX_COMMAND_LENGTH) throw new HttpError(400, "Comando demasiado largo.");
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(line)) throw new HttpError(400, "El comando contiene caracteres de control.");
    if (!monitor.write(row.id, line)) throw new HttpError(409, "La consola no está disponible (¿servidor detenido?).");
    auditService.log(ctx, "terminal.command", { serverId: row.id, target: row.name, details: line });
  },
};

module.exports = terminalService;
