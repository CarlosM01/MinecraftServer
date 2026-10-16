/** Remove ANSI escape sequences (colours, cursor movement). */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[=>]/g, "");
}

/** Remove Minecraft legacy formatting codes (§a, §l, …). */
function stripFormatting(str) {
  return str.replace(/§[0-9a-fk-orx]/gi, "");
}

/**
 * Normalise a console line: no ANSI, no JLine prompt residue.
 * JLine redraws the prompt as "> ....\r\x1b[K<message>\r", so like a real
 * terminal we keep only what follows the last carriage return.
 */
function cleanLine(line) {
  const segments = line.replace(/\r+$/, "").split("\r");
  const last = segments[segments.length - 1];
  return stripFormatting(stripAnsi(last)).replace(/^>\s*/, "").trimEnd();
}

module.exports = { stripAnsi, stripFormatting, cleanLine };
