const express = require("express");
const path = require("path");
const googleDriveService = require("../services/googleDriveService");
const backupService = require("../services/backupService");

const router = express.Router();

/**
 * GET /api/google-drive/config
 * Retrieve Google Drive settings.
 */
router.get("/config", (req, res) => {
  try {
    const config = googleDriveService.config;
    res.json({
      clientId: config.clientId || "",
      clientSecretSet: !!config.clientSecret,
      folderName: config.folderName || "Minecraft Server Backups",
      rollingLimit: parseInt(config.rollingLimit || 5, 10),
    });
  } catch (err) {
    console.error("[GET /api/google-drive/config] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/google-drive/config
 * Save Google Drive settings.
 */
router.post("/config", (req, res) => {
  const { clientId, clientSecret, folderName, rollingLimit } = req.body;
  try {
    const update = {
      clientId: clientId || "",
      folderName: folderName || "Minecraft Server Backups",
      rollingLimit: isNaN(parseInt(rollingLimit, 10)) ? 5 : parseInt(rollingLimit, 10),
    };
    
    // Only update client secret if provided
    if (clientSecret !== undefined && clientSecret !== "") {
      update.clientSecret = clientSecret;
    }
    
    googleDriveService.saveConfig(update);
    res.json({ message: "Google Drive settings saved successfully." });
  } catch (err) {
    console.error("[POST /api/google-drive/config] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/google-drive/status
 * Retrieve active link status and user email.
 */
router.get("/status", async (req, res) => {
  try {
    const isLinked = googleDriveService.isLinked();
    let email = null;
    if (isLinked) {
      email = await googleDriveService.getLinkedAccount();
    }
    
    res.json({
      isLinked: googleDriveService.isLinked(), // might get unlinked if getLinkedAccount returns null / token expired
      email,
      folderName: googleDriveService.config.folderName,
      rollingLimit: googleDriveService.config.rollingLimit,
    });
  } catch (err) {
    console.error("[GET /api/google-drive/status] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/google-drive/auth-url
 * Generate the consent redirect URL.
 */
router.get("/auth-url", (req, res) => {
  const origin = req.query.origin || "http://localhost:3000";
  try {
    const url = googleDriveService.getAuthUrl(origin);
    res.json({ url });
  } catch (err) {
    console.error("[GET /api/google-drive/auth-url] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/google-drive/callback
 * OAuth callback. Exchanged code, redirects back to dashboard.
 */
router.get("/callback", async (req, res) => {
  const { code, state } = req.query; // 'state' contains the client origin redirect url
  const redirectOrigin = state || "http://localhost:3000";
  
  try {
    if (!code) {
      throw new Error("No authorization code provided by Google.");
    }
    
    await googleDriveService.handleCallback(code);
    res.redirect(`${redirectOrigin}?google_link=success`);
  } catch (err) {
    console.error("[GET /api/google-drive/callback] Error:", err.message);
    res.redirect(`${redirectOrigin}?google_link=error&message=${encodeURIComponent(err.message)}`);
  }
});

/**
 * POST /api/google-drive/disconnect
 * Disconnect the active Google account by deleting tokens.
 */
router.post("/disconnect", (req, res) => {
  try {
    googleDriveService.disconnect();
    res.json({ message: "Google Drive account disconnected successfully." });
  } catch (err) {
    console.error("[POST /api/google-drive/disconnect] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/google-drive/list
 * List remote backups from Google Drive.
 */
router.get("/list", async (req, res) => {
  try {
    const list = await googleDriveService.listRemoteBackups();
    res.json({ backups: list });
  } catch (err) {
    console.error("[GET /api/google-drive/list] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/google-drive/upload/:filename
 * Manually upload a local backup file to Google Drive.
 */
router.post("/upload/:filename", async (req, res) => {
  const { filename } = req.params;
  try {
    const localFilePath = path.join(backupService.backupDir, path.basename(filename));
    const uploadRes = await googleDriveService.uploadBackup(localFilePath);
    res.json({ message: "Backup file uploaded successfully.", id: uploadRes.id });
  } catch (err) {
    console.error(`[POST /api/google-drive/upload/${filename}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/google-drive/download/:id
 * Manually download a remote backup file from Google Drive to local backups repository.
 */
router.post("/download/:id", async (req, res) => {
  const { id } = req.params;
  const { filename } = req.body;
  try {
    if (!filename) {
      throw new Error("Missing filename in request body.");
    }
    
    await googleDriveService.downloadBackup(id, filename);
    res.json({ message: `Backup downloaded successfully: ${filename}` });
  } catch (err) {
    console.error(`[POST /api/google-drive/download/${id}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/google-drive/delete/:id
 * Delete a remote backup from Google Drive.
 */
router.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await googleDriveService.deleteRemoteBackup(id);
    res.json({ message: "Remote backup archive deleted successfully." });
  } catch (err) {
    console.error(`[DELETE /api/google-drive/delete/${id}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
