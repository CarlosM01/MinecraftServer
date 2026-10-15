const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

class GoogleDriveService {
  constructor() {
    this.serverRootDir = path.resolve(__dirname, "..", "..");
    this.backupDir = path.join(this.serverRootDir, "backup");
    
    // Path to the config file
    this.configDir = path.join(__dirname, "..", "config");
    this.configFile = path.join(this.configDir, "google_drive.json");
    
    // Default configuration
    this.config = {
      clientId: "",
      clientSecret: "",
      folderName: "Minecraft Server Backups",
      rollingLimit: 5,
      tokens: null,
    };
    
    // Initialize OAuth2 client placeholder
    this.oauth2Client = null;
    
    // Load config from disk
    this.loadConfig();
  }

  /**
   * Loads config from local JSON file.
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, "utf8");
        const parsed = JSON.parse(data);
        this.config = { ...this.config, ...parsed };
        this._initOAuth2Client();
      }
    } catch (err) {
      console.error("[GoogleDriveService] Error loading config:", err);
    }
  }

  /**
   * Saves config to local JSON file.
   */
  saveConfig(newConfig = {}) {
    try {
      this.config = { ...this.config, ...newConfig };
      
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), "utf8");
      this._initOAuth2Client();
      console.log("[GoogleDriveService] Configuration saved successfully.");
    } catch (err) {
      console.error("[GoogleDriveService] Error saving config:", err);
      throw err;
    }
  }

  /**
   * Initializes or updates the OAuth2 client.
   * @private
   */
  _initOAuth2Client() {
    const { clientId, clientSecret } = this.config;
    if (!clientId || !clientSecret) {
      this.oauth2Client = null;
      return;
    }
    
    // Use the backend redirect endpoint
    const redirectUri = "http://localhost:3001/api/google-drive/callback";
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    
    if (this.config.tokens) {
      this.oauth2Client.setCredentials(this.config.tokens);
    }
    
    // Listen for automatic token refreshes
    this.oauth2Client.on("tokens", (tokens) => {
      console.log("[GoogleDriveService] Tokens refreshed automatically.");
      const updatedTokens = { ...this.config.tokens, ...tokens };
      this.saveConfig({ tokens: updatedTokens });
    });
  }

  /**
   * Verifies if Google Drive is configured and linked.
   */
  isLinked() {
    return !!(this.oauth2Client && this.config.tokens);
  }

  /**
   * Generates authorization URL for user login.
   * @param {string} origin Frontend origin (to redirect back to after authorization)
   */
  getAuthUrl(origin = "http://localhost:3000") {
    if (!this.oauth2Client) {
      throw new Error("Google Drive API is not configured. Please save your Client ID and Client Secret first.");
    }
    
    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ];
    
    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
      state: origin, // Send original URL back
    });
  }

  /**
   * Handles the OAuth callback by exchanging authorization code for tokens.
   * @param {string} code Authorization code from Google
   */
  async handleCallback(code) {
    if (!this.oauth2Client) {
      throw new Error("OAuth2 client not initialized.");
    }
    
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    
    // Save tokens to configuration
    this.saveConfig({ tokens });
    console.log("[GoogleDriveService] Successfully authorized and stored tokens.");
  }

  /**
   * Disconnects Google Drive by clearing local tokens.
   */
  disconnect() {
    this.saveConfig({ tokens: null });
    this.oauth2Client = null;
    console.log("[GoogleDriveService] Disconnected and cleared tokens.");
  }

  /**
   * Retrieves user email and info of the linked Google Drive account.
   */
  async getLinkedAccount() {
    if (!this.isLinked()) {
      return null;
    }
    
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      const res = await oauth2.userinfo.get();
      return res.data.email;
    } catch (err) {
      console.error("[GoogleDriveService] Error fetching linked account info:", err.message);
      // If unauthorized, token might be invalid
      if (err.status === 401) {
        this.disconnect();
      }
      return null;
    }
  }

  /**
   * Returns a reference to the active Google Drive instance.
   * @private
   */
  _getDriveInstance() {
    if (!this.isLinked()) {
      throw new Error("Google Drive is not linked. Please authorize your account first.");
    }
    return google.drive({ version: "v3", auth: this.oauth2Client });
  }

  /**
   * Retrieves or creates the backup folder in Google Drive.
   * @param {any} drive Google Drive instance
   * @returns {Promise<string>} Folder ID
   */
  async getOrCreateFolder(drive) {
    const folderName = this.config.folderName || "Minecraft Server Backups";
    
    // Search for existing folder
    const searchRes = await drive.files.list({
      q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
    });
    
    if (searchRes.data.files && searchRes.data.files.length > 0) {
      return searchRes.data.files[0].id;
    }
    
    // Create new folder
    console.log(`[GoogleDriveService] Creating backup folder: "${folderName}"`);
    const fileMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };
    
    const folder = await drive.files.create({
      resource: fileMetadata,
      fields: "id",
    });
    
    return folder.data.id;
  }

  /**
   * Lists remote backups inside the Google Drive backups folder.
   */
  async listRemoteBackups() {
    if (!this.isLinked()) return [];
    
    try {
      const drive = this._getDriveInstance();
      const folderId = await this.getOrCreateFolder(drive);
      
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, size, mimeType, createdTime)",
        orderBy: "createdTime desc",
        spaces: "drive",
      });
      
      return (res.data.files || []).map((file) => ({
        id: file.id,
        name: file.name,
        size: parseInt(file.size || 0, 10),
        mtime: file.createdTime,
      }));
    } catch (err) {
      console.error("[GoogleDriveService] Failed to list remote backups:", err.message);
      throw err;
    }
  }

  /**
   * Uploads a local backup file to the backup folder on Google Drive.
   * @param {string} localFilePath Absolute path of the local backup file
   */
  async uploadBackup(localFilePath) {
    if (!this.isLinked()) {
      throw new Error("Google Drive integration is not active or configured.");
    }
    
    const filename = path.basename(localFilePath);
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found for upload: ${localFilePath}`);
    }
    
    try {
      const drive = this._getDriveInstance();
      const folderId = await this.getOrCreateFolder(drive);
      
      console.log(`[GoogleDriveService] Initiating upload for "${filename}" to Google Drive...`);
      const fileMetadata = {
        name: filename,
        parents: [folderId],
      };
      
      const media = {
        mimeType: "application/gzip",
        body: fs.createReadStream(localFilePath),
      };
      
      const res = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id, name, size",
      });
      
      console.log(`[GoogleDriveService] Successfully uploaded: ${res.data.name} (ID: ${res.data.id})`);
      
      // Auto-prune remote backups to satisfy the rolling limit
      await this.pruneRemoteBackups();
      
      return res.data;
    } catch (err) {
      console.error(`[GoogleDriveService] Failed to upload "${filename}":`, err.message);
      throw err;
    }
  }

  /**
   * Deletes oldest remote backups from Google Drive if count exceeds the rolling limit.
   */
  async pruneRemoteBackups() {
    const limit = parseInt(this.config.rollingLimit, 10);
    if (isNaN(limit) || limit <= 0) return;
    
    try {
      const drive = this._getDriveInstance();
      const folderId = await this.getOrCreateFolder(drive);
      
      // Fetch sorted list (newest first)
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, createdTime)",
        orderBy: "createdTime desc",
        spaces: "drive",
      });
      
      const files = res.data.files || [];
      if (files.length > limit) {
        const toPrune = files.slice(limit);
        console.log(`[GoogleDriveService] Rolling limit reached (${limit}). Pruning ${toPrune.length} older cloud backup(s)...`);
        
        for (const file of toPrune) {
          await drive.files.delete({ fileId: file.id });
          console.log(`[GoogleDriveService] Pruned old remote backup: ${file.name}`);
        }
      }
    } catch (err) {
      console.error("[GoogleDriveService] Error during auto-pruning remote backups:", err.message);
    }
  }

  /**
   * Downloads a remote backup file by ID from Google Drive to local backups folder.
   * @param {string} fileId Google Drive File ID
   * @param {string} filename Output local backup file name
   */
  async downloadBackup(fileId, filename) {
    if (!this.isLinked()) {
      throw new Error("Google Drive integration is not active or configured.");
    }
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    
    const safeFilename = path.basename(filename);
    const destPath = path.join(this.backupDir, safeFilename);
    
    try {
      const drive = this._getDriveInstance();
      console.log(`[GoogleDriveService] Downloading backup ID "${fileId}" to "${destPath}"...`);
      
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" }
      );
      
      const destStream = fs.createWriteStream(destPath);
      
      return new Promise((resolve, reject) => {
        res.data
          .on("end", () => {
            console.log(`[GoogleDriveService] Download finished: ${destPath}`);
            resolve(destPath);
          })
          .on("error", (err) => {
            console.error(`[GoogleDriveService] Download stream error for file ID ${fileId}:`, err);
            reject(err);
          })
          .pipe(destStream);
      });
    } catch (err) {
      console.error(`[GoogleDriveService] Failed to download file ID "${fileId}":`, err.message);
      throw err;
    }
  }

  /**
   * Deletes a remote backup archive from Google Drive.
   * @param {string} fileId Google Drive File ID
   */
  async deleteRemoteBackup(fileId) {
    try {
      const drive = this._getDriveInstance();
      await drive.files.delete({ fileId });
      console.log(`[GoogleDriveService] Deleted remote backup ID: ${fileId}`);
    } catch (err) {
      console.error(`[GoogleDriveService] Failed to delete remote backup ID "${fileId}":`, err.message);
      throw err;
    }
  }
}

module.exports = new GoogleDriveService();
