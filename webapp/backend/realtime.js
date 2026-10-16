/**
 * Tiny holder for the Socket.io server so services can broadcast without
 * importing server.js (avoids circular requires).
 *
 * Rooms:
 *   global            — every authenticated client (server list summaries)
 *   server:<id>       — detail page of one server (stats, players, ops)
 *   terminal:<id>     — clients with the terminal of one server open
 */
let io = null;

module.exports = {
  setIo(instance) {
    io = instance;
  },

  emit(room, event, payload) {
    if (io) io.to(room).emit(event, payload);
  },

  roomSize(room) {
    if (!io) return 0;
    return io.sockets.adapter.rooms.get(room)?.size || 0;
  },
};
