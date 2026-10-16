const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const auditService = require("../services/auditService");

const COOKIE_NAME = "mcp_token";

/* ── Helpers ───────────────────────────────────────────────── */

function passwordMatches(candidate) {
  if (!config.adminPassword) return false;
  // Hash both sides so timingSafeEqual gets equal-length buffers
  const a = crypto.createHash("sha256").update(String(candidate)).digest();
  const b = crypto.createHash("sha256").update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function parseCookies(header = "") {
  const out = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

/* ── Login rate limiting (per IP) ─────────────────────────── */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map(); // ip -> { count, resetAt }

function isRateLimited(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < Date.now()) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

/* ── Router: /api/auth ─────────────────────────────────────── */

const router = express.Router();

router.post("/login", (req, res) => {
  const ip = req.ip;
  if (!config.adminPassword) {
    return res.status(503).json({ error: "ADMIN_PASSWORD no está configurado en webapp/backend/.env." });
  }
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Demasiados intentos. Prueba de nuevo en unos minutos." });
  }
  if (!passwordMatches(req.body?.password || "")) {
    recordFailure(ip);
    auditService.log(req, "auth.login_failed");
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }

  attempts.delete(ip);
  const token = jwt.sign({ sub: "admin" }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: config.sessionHours * 3600 * 1000,
  });
  auditService.log(req, "auth.login");
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  const payload = verifyToken(req.cookies?.[COOKIE_NAME]);
  if (!payload) return res.status(401).json({ error: "No autenticado." });
  res.json({ user: payload.sub, configured: Boolean(config.adminPassword) });
});

/* ── Middleware ────────────────────────────────────────────── */

function requireAuth(req, res, next) {
  if (verifyToken(req.cookies?.[COOKIE_NAME])) return next();
  res.status(401).json({ error: "No autenticado." });
}

/** Socket.io middleware: reads the same httpOnly cookie from the handshake. */
function socketAuth(socket, next) {
  const cookies = parseCookies(socket.handshake.headers.cookie);
  if (verifyToken(cookies[COOKIE_NAME])) return next();
  next(new Error("unauthorized"));
}

module.exports = { router, requireAuth, socketAuth };
