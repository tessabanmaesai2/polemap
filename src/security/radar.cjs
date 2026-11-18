const fs = require('fs');
const path = require('path');
const { SEC_LOGS_FILE } = require('../config.cjs');
const { getThaiNow, readJson, writeJsonAtomic } = require('../utils/core.cjs');

const loginFailures = new Map();   // ip -> { count, firstAttempt, bannedUntil, reason }
const accountAttempts = new Map(); // usernameLower -> { count, firstAttempt, ips: Set, alerted }
const sweepAttempts = new Map();   // ip -> { count, firstAttempt, paths: Set }

const MAX_LOGIN_ATTEMPTS = 7;
const SURGE_IP_MAX_ATTEMPTS = 2;
const MAX_ACCOUNT_SURGE_ATTEMPTS = 8;
const ACCOUNT_WINDOW_MS = 10 * 60 * 1000;
const BAN_DURATION_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const SWEEP_WINDOW_MS = 60 * 1000;
const MAX_SWEEP_HITS = 20;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']).trim();
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function appendSecurityLog(entry) {
  try {
    const logs = readJson(SEC_LOGS_FILE, []);
    const newLog = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      timestamp: getThaiNow(),
      ip: entry.ip || '127.0.0.1',
      method: entry.method || 'GET',
      path: entry.path || '/',
      status: entry.status || 200,
      duration: entry.duration || 1,
      threat: entry.threat || 'INFO',
      reason: entry.reason || 'Normal Traffic',
      ua: entry.ua || '-'
    };
    logs.push(newLog);
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    writeJsonAtomic(SEC_LOGS_FILE, logs);
  } catch (err) {
    console.warn('[SECURITY LOG WARN]', err.message);
  }
}

function initSecurityLogs() {
  if (!fs.existsSync(SEC_LOGS_FILE)) {
    writeJsonAtomic(SEC_LOGS_FILE, [
      {
        id: 'init-1',
        timestamp: getThaiNow(),
        ip: '127.0.0.1',
        method: 'SYSTEM',
        path: '/polemap/server-boot',
        status: 200,
        duration: 1,
        threat: 'INFO',
        reason: 'POLE MAP Security Radar (DEC-026) Initialized',
        ua: 'MaeSaiOS/NodeJS-Engine'
      }
    ]);
  }
}

function isAccountUnderSurge(username) {
  if (!username) return false;
  const key = String(username).trim().toLowerCase();
  const acct = accountAttempts.get(key);
  if (!acct) return false;
  if (Date.now() - acct.firstAttempt > ACCOUNT_WINDOW_MS) {
    accountAttempts.delete(key);
    return false;
  }
  return acct.count >= MAX_ACCOUNT_SURGE_ATTEMPTS;
}

function checkLoginRateLimit(ip, username = '') {
  const now = Date.now();
  const entry = loginFailures.get(ip);
  const maxAllowed = isAccountUnderSurge(username) ? SURGE_IP_MAX_ATTEMPTS : MAX_LOGIN_ATTEMPTS;
  if (!entry) return { allowed: true };

  if (entry.bannedUntil) {
    if (now < entry.bannedUntil) {
      return { allowed: false, waitMin: Math.ceil((entry.bannedUntil - now) / 60000) };
    }
    loginFailures.delete(ip);
    return { allowed: true };
  }

  if (now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginFailures.delete(ip);
    return { allowed: true };
  }

  if (entry.count >= maxAllowed) {
    entry.bannedUntil = now + BAN_DURATION_MS;
    return { allowed: false, waitMin: 15 };
  }
  return { allowed: true };
}

function recordFailedLogin(ip, username = '', req = null) {
  const now = Date.now();
  let maxAllowed = MAX_LOGIN_ATTEMPTS;

  if (username) {
    const key = String(username).trim().toLowerCase();
    if (key) {
      let acct = accountAttempts.get(key);
      if (!acct || (now - acct.firstAttempt > ACCOUNT_WINDOW_MS)) {
        acct = { count: 1, firstAttempt: now, ips: new Set([ip]), alerted: false };
        accountAttempts.set(key, acct);
      } else {
        acct.count += 1;
        acct.ips.add(ip);
        if (acct.count >= MAX_ACCOUNT_SURGE_ATTEMPTS) {
          maxAllowed = SURGE_IP_MAX_ATTEMPTS;
          if (!acct.alerted) {
            acct.alerted = true;
            appendSecurityLog({
              ip,
              method: req?.method || 'POST',
              path: req?.originalUrl || '/polemap/api/auth/login',
              status: 429,
              threat: 'CRITICAL',
              reason: `Distributed Brute-Force Surge on account [${key}] (${acct.count} attempts / ${acct.ips.size} IPs)`,
              ua: req?.headers?.['user-agent'] || '-'
            });
          }
        }
      }
    }
  }

  const entry = loginFailures.get(ip);
  if (!entry || (now - entry.firstAttempt > LOGIN_WINDOW_MS)) {
    loginFailures.set(ip, { count: 1, firstAttempt: now, bannedUntil: 0, reason: 'BRUTE_FORCE' });
  } else {
    entry.count += 1;
    if (entry.count >= maxAllowed) {
      entry.bannedUntil = now + BAN_DURATION_MS;
      entry.reason = 'BRUTE_FORCE';
    }
  }
}

function recordSuccessfulLogin(ip, username = '') {
  loginFailures.delete(ip);
  if (username) {
    const key = String(username).trim().toLowerCase();
    if (key) accountAttempts.delete(key);
  }
}

function isIpSweepBanned(ip) {
  const entry = loginFailures.get(ip);
  if (!entry || !entry.bannedUntil || entry.reason !== 'SWEEP_404_401') return false;
  if (Date.now() < entry.bannedUntil) return true;
  loginFailures.delete(ip);
  return false;
}

function recordSweepHit(ip, urlPath, statusCode, req = null) {
  if (!ip || (statusCode !== 404 && statusCode !== 401)) return false;
  if (isIpSweepBanned(ip)) return true;

  const now = Date.now();
  let entry = sweepAttempts.get(ip);
  if (!entry || (now - entry.firstAttempt > SWEEP_WINDOW_MS)) {
    sweepAttempts.set(ip, { count: 1, firstAttempt: now, paths: new Set([urlPath]) });
    return false;
  }

  entry.count += 1;
  if (entry.paths.size < 25) entry.paths.add(urlPath);

  if (entry.count >= MAX_SWEEP_HITS) {
    loginFailures.set(ip, {
      count: entry.count,
      firstAttempt: entry.firstAttempt,
      bannedUntil: now + BAN_DURATION_MS,
      reason: 'SWEEP_404_401'
    });
    sweepAttempts.delete(ip);
    appendSecurityLog({
      ip,
      method: req?.method || 'GET',
      path: urlPath,
      status: 429,
      threat: 'CRITICAL',
      reason: `404/401 Path Sweep Detected (${entry.count} hits/min) — IP auto-banned 15m`,
      ua: req?.headers?.['user-agent'] || '-'
    });
    return true;
  }
  return false;
}

function sanitizeInspectableBody(body) {
  if (!body || typeof body !== 'object') return '';
  const clone = {};
  for (const [k, v] of Object.entries(body)) {
    if (k === 'image' || k === 'Image' || k === 'imageBase64' || k === 'password' || k === 'new_password') continue;
    clone[k] = typeof v === 'string' && v.length > 500 ? v.slice(0, 500) : v;
  }
  return JSON.stringify(clone);
}

function securityRadarMiddleware(req, res, next) {
  const start = Date.now();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '-';
  const rawUrl = req.originalUrl || req.url || '/';
  const urlPath = req.path || rawUrl;
  const lowerPath = urlPath.toLowerCase();

  if (isIpSweepBanned(ip) && !lowerPath.includes('/security/')) {
    return res.status(429).json({
      success: false,
      error: 'ตรวจพบการสแกนระบบผิดปกติ ระบบระงับ IP ชั่วคราว 15 นาที (404/401 Sweep Shield)'
    });
  }

  const ext = path.extname(urlPath).toLowerCase();
  const isStaticAsset = rawUrl.includes('/uploads/') || rawUrl.includes('/public/') ||
    ['.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff2', '.ttf'].includes(ext);
  const isPollingLog = rawUrl.includes('/api/security/logs');

  // Sensitive file & traversal probe shield
  if (lowerPath.includes('..') || lowerPath.endsWith('.env') || lowerPath.endsWith('.git') || lowerPath.includes('/security_logs.json')) {
    appendSecurityLog({ ip, method: req.method, path: rawUrl, status: 403, duration: Date.now() - start, threat: 'CRITICAL', reason: 'Blocked Sensitive File Probe', ua });
    return res.status(403).json({ success: false, error: 'Blocked by Security Radar (DEC-026)' });
  }

  // WAF payload check (skip raw base64 image & password fields)
  const decodedUrl = (() => { try { return decodeURIComponent(rawUrl); } catch (_) { return rawUrl; } })();
  const inspectTarget = `${decodedUrl} ${sanitizeInspectableBody(req.body)}`.toLowerCase();
  if (/(\.\.\/|\.\.\\|<script|union\s+select|drop\s+table|or\s+1=1)/i.test(inspectTarget)) {
    appendSecurityLog({
      ip,
      method: req.method,
      path: rawUrl,
      status: 403,
      duration: Date.now() - start,
      threat: 'CRITICAL',
      reason: 'WAF Blocked: Malicious Payload / Injection Attempt',
      ua
    });
    return res.status(403).json({ success: false, error: 'Blocked by Security Radar (DEC-026)' });
  }

  res.on('finish', () => {
    if (!isStaticAsset && (res.statusCode === 404 || res.statusCode === 401)) {
      recordSweepHit(ip, urlPath, res.statusCode, req);
    }

    const isImportantVisit = !isStaticAsset && req.method === 'GET' && (
      lowerPath === '/polemap' || lowerPath === '/polemap/' ||
      lowerPath === '/polemap/manage' || lowerPath === '/polemap/back'
    );
    const isScannerUa = /sqlmap|nikto|nmap|curl|python-requests/i.test(ua);
    const isErrorOrAuthEvent = res.statusCode >= 400 || rawUrl.includes('/auth/login');

    // Audit Disk DoS protection: only persist meaningful security/navigation events
    if (!isImportantVisit && !isScannerUa && !isErrorOrAuthEvent) return;
    if (isPollingLog && res.statusCode < 400) return;

    let threat = 'INFO';
    let reason = isImportantVisit ? `Page Visit: ${urlPath}` : 'Auth / Security Event';
    if (res.statusCode === 401 || res.statusCode === 403) {
      threat = 'WARN';
      reason = res.statusCode === 401 ? 'Unauthorized / Failed Auth' : 'Forbidden Access';
    } else if (res.statusCode === 429) {
      threat = 'CRITICAL';
      reason = 'Brute-Force / Sweep Rate Limit Blocked';
    } else if (res.statusCode >= 500) {
      threat = 'WARN';
      reason = 'Server Exception';
    } else if (isScannerUa) {
      threat = 'WARN';
      reason = 'Automated Scanner / CLI Client';
    }

    appendSecurityLog({
      ip,
      method: req.method,
      path: rawUrl,
      status: res.statusCode,
      duration: Date.now() - start,
      threat,
      reason,
      ua
    });
  });

  next();
}

function handleGetSecurityLogs(req, res) {
  const logs = readJson(SEC_LOGS_FILE, []);
  const now = Date.now();
  const bannedList = [];
  for (const [ip, data] of loginFailures.entries()) {
    if (data.bannedUntil && data.bannedUntil > now) {
      bannedList.push({
        ip,
        reason: data.reason || 'BRUTE_FORCE',
        attempts: data.count,
        remaining_minutes: Math.ceil((data.bannedUntil - now) / 60000)
      });
    }
  }
  res.json({ success: true, logs, banned_ips: bannedList });
}

function handleClearSecurityLogs(req, res) {
  writeJsonAtomic(SEC_LOGS_FILE, [
    {
      id: 'clear-' + Date.now(),
      timestamp: getThaiNow(),
      ip: getClientIp(req),
      method: 'DELETE',
      path: '/polemap/api/security/logs',
      status: 200,
      duration: 1,
      threat: 'INFO',
      reason: 'Security Audit Logs Cleared by Super Admin',
      ua: req.headers['user-agent'] || '-'
    }
  ]);
  res.json({ success: true, message: 'ล้างประวัติ Security Logs เรียบร้อยแล้ว' });
}

function handleUnbanIp(req, res) {
  const { ip } = req.body || {};
  if (ip) {
    loginFailures.delete(ip);
    sweepAttempts.delete(ip);
  } else {
    loginFailures.clear();
    sweepAttempts.clear();
  }
  res.json({ success: true, message: `ปลดแบน IP ${ip || 'ทั้งหมด'} เรียบร้อยแล้ว` });
}

function resetRadarStateForTests() {
  loginFailures.clear();
  accountAttempts.clear();
  sweepAttempts.clear();
}

module.exports = {
  getClientIp,
  initSecurityLogs,
  securityRadarMiddleware,
  checkLoginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
  handleGetSecurityLogs,
  handleClearSecurityLogs,
  handleUnbanIp,
  resetRadarStateForTests
};
