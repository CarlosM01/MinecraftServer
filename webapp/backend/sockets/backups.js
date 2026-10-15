const backupService = require("../services/backupService");

/**
 * Register backup-related Socket.io namespaces on the server.
 *
 * Namespace:
 *   /backups/operations — streams real-time status and logs of background backup/restore/test processes
 *
 * @param {import("socket.io").Server} io
 */
function registerBackupSockets(io) {
  const backupsNs = io.of("/backups/operations");
  
  // Register namespace with the singleton backup service
  backupService.setNamespace(backupsNs);
  
  backupsNs.on("connection", (socket) => {
    console.log(`[backups/operations] Client connected: ${socket.id}`);
    
    // 1. Send current status immediately on connection
    const currentStatus = backupService.getStatus();
    socket.emit("status", {
      activeOp: currentStatus.activeOp,
      status: currentStatus.status,
    });
    
    // 2. Dump the current in-memory log history to catch up
    socket.emit("log_history", currentStatus.logs);
    
    socket.on("disconnect", () => {
      console.log(`[backups/operations] Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = registerBackupSockets;
