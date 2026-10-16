const fs = require("fs");
const path = require("path");
const multer = require("multer");
const config = require("../config");
const serverService = require("../services/serverService");

const UPLOAD_DIR = path.join(config.serversRoot, ".tmp-uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Attach the server row for routes under /servers/:id. */
function loadServer(req, res, next) {
  try {
    req.row = serverService.getRow(req.params.id);
    next();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

/** Multer instance writing to a temp dir; services move files into place. */
function upload(maxBytes) {
  return multer({ dest: UPLOAD_DIR, limits: { fileSize: maxBytes, files: 1 } });
}

module.exports = { loadServer, upload, UPLOAD_DIR };
