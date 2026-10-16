/**
 * Error carrying an HTTP status so routes can forward it unchanged.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Wrap an async Express handler and turn thrown errors into JSON responses.
 */
function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
      if (!res.headersSent) res.status(status).json({ error: err.message });
    }
  };
}

module.exports = { HttpError, asyncRoute };
