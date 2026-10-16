const dockerService = require("./dockerService");
const { HttpError } = require("../httpError");
const { stripAnsi, stripFormatting } = require("../lib/text");

/**
 * Programmatic RCON access. Uses the `rcon-cli` binary bundled in the
 * itzg/minecraft-server image through `docker exec`, so the backend never
 * needs network access to the RCON port and the password stays in the
 * container environment.
 */
const rconService = {
  /**
   * @param {{container_name: string}} server
   * @param {string} command  Minecraft command without leading slash.
   * @returns {Promise<string>} Plain-text response.
   */
  async exec(server, command) {
    let result;
    try {
      result = await dockerService.exec(server.container_name, ["rcon-cli", command], {
        timeoutMs: 10000,
      });
    } catch (err) {
      if (err.statusCode === 409) throw new HttpError(409, "El servidor no está en ejecución.");
      throw err;
    }
    const output = stripFormatting(stripAnsi(result.output)).trim();
    if (result.exitCode !== 0) {
      throw new HttpError(502, `RCON falló: ${output || "sin respuesta (¿servidor iniciando?)"}`);
    }
    return output;
  },

  /** Like exec() but never throws; returns null on failure. */
  async tryExec(server, command) {
    try {
      return await this.exec(server, command);
    } catch {
      return null;
    }
  },
};

module.exports = rconService;
