/**
 * ------------------------------------------------------------------
 * POLE MAP ENGINE - เทศบาลตำบลแม่สาย
 * ------------------------------------------------------------------
 * Port: 3406
 * Routes: /polemap/ (Main Map), /polemap/manage, /polemap/back, /polemap/api/
 * Standards: DEC-026 Security Radar + DEC-027 Master Key + พ.ศ. Timestamps
 * ------------------------------------------------------------------
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3406;

const PROJECT_DIR = __dirname;
const DATA_DIR = path.join(PROJECT_DIR, 'data');
const POLES_FILE = path.join(DATA_DIR, 'poles.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SEC_LOGS_FILE = path.join(DATA_DIR, 'security_logs.json');
const UPLOADS_DIR = path.join(PROJECT_DIR, 'public', 'uploads');

// Master Credentials (DEC-027)
const MASTER_KEY = process.env.MASTER_KEY || 'thedatazero';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'Kn123990002466119842528';

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Helper: Current Date/Time in Thai Buddhist Era (พ.ศ.) DD/MM/YYYY HH:mm:ss (Asia/Bangkok UTC+7)
function getThaiNow() {
  const now = new Date();
  const bkk = new Date(now.getTime() + (7 * 3600 * 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(bkk.getUTCDate());
  const month = pad(bkk.getUTCMonth() + 1);
  const year = bkk.getUTCFullYear() + 543;
  const hours = pad(bkk.getUTCHours());
  const mins = pad(bkk.getUTCMinutes());
  const secs = pad(bkk.getUTCSeconds());
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
}

// Helper: Read JSON atomically
function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[ERROR] Read ${file}:`, err.message);
    return fallback;
  }
}

// Helper: Write JSON atomically
function writeJsonAtomic(file, data) {
  try {
    const tmp = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`[ERROR] Write ${file}:`, err.message);
  }
}

// ------------------------------------------------------------------
// SECURITY RADAR & ANTI-BRUTE FORCE ENGINE (DEC-026)
// ------------------------------------------------------------------
const loginFailures = new Map(); // ip -> { count, bannedUntil }
const MAX_LOGIN_ATTEMPTS = 7;
const BAN_DURATION_MS = 15 * 60 * 1000; // 15 mins

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
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

// Seed initial security log if empty
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

// CORS Support
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Master-Key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Body parser
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Security Radar Inspection Middleware
app.use((req, res, next) => {
  const start = Date.now();
  const ip = getClientIp(req);
  const ua = req.headers['user-agent'] || '-';
  const rawUrl = req.originalUrl || req.url || '/';

  // Skip static image noise in security logs unless error
  const isStaticAsset = rawUrl.includes('/uploads/') || rawUrl.endsWith('.css') || rawUrl.endsWith('.js') || rawUrl.endsWith('.ico');
  const isPollingLog = rawUrl.includes('/api/security/logs');

  // Check Suspicious Payloads (SQLi / XSS / Path Traversal)
  const decodedUrl = (() => { try { return decodeURIComponent(rawUrl); } catch (_) { return rawUrl; } })();
  const inspectTarget = `${decodedUrl} ${JSON.stringify(req.body || {})}`.toLowerCase();
  const hasAttackPattern = /(\.\.\/|\.\.\\|<script|union\s+select|drop\s+table|or\s+1=1)/i.test(inspectTarget);

  if (hasAttackPattern) {
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
    if (isStaticAsset && res.statusCode < 400) return;
    if (isPollingLog && res.statusCode < 400) return;

    const duration = Date.now() - start;
    let threat = 'INFO';
    let reason = 'Normal Traffic';

    if (res.statusCode === 401 || res.statusCode === 403) {
      threat = 'WARN';
      reason = res.statusCode === 401 ? 'Unauthorized / Failed Auth' : 'Forbidden Access';
    } else if (res.statusCode === 429) {
      threat = 'CRITICAL';
      reason = 'Brute-Force Rate Limit Blocked';
    } else if (res.statusCode >= 500) {
      threat = 'WARN';
      reason = 'Server Exception';
    } else if (/sqlmap|nikto|nmap|curl|python-requests/i.test(ua)) {
      threat = 'WARN';
      reason = 'Automated Scanner / CLI Client';
    }

    appendSecurityLog({
      ip,
      method: req.method,
      path: rawUrl,
      status: res.statusCode,
      duration,
      threat,
      reason,
      ua
    });
  });

  next();
});

// Active session tokens: token -> { user, role, name, expiresAt }
const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cleanExpiredSessions() {
  const now = Date.now();
  for (const [t, data] of sessions.entries()) {
    if (data.expiresAt < now) sessions.delete(t);
  }
}
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// Helper: Safely delete an upload file (Zero-Orphan Policy)
function safeDeleteUpload(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return;
  const cleanName = path.basename(imagePath);
  if (!cleanName || cleanName === 'uploads') return;

  const fullPath = path.resolve(UPLOADS_DIR, cleanName);
  if (fullPath.startsWith(path.resolve(UPLOADS_DIR))) {
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        console.log(`[FILE CLEANUP] Deleted replaced/removed file: ${cleanName}`);
      } catch (err) {
        console.warn(`[FILE CLEANUP WARN] Failed to delete ${cleanName}:`, err.message);
      }
    }
  }
}

// Helper: Save Base64 Image to uploads folder (supports both data:image/... and raw base64)
function saveBase64Image(base64Str, prefix = 'IMG') {
  if (!base64Str || typeof base64Str !== 'string') return null;
  const trimmed = base64Str.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('uploads/') || trimmed.startsWith('/polemap/uploads/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const cleanRel = trimmed.replace(/^https?:\/\/[^/]+/, '').replace(/^\/polemap\//, '').replace(/^\//, '');
    if (cleanRel.startsWith('uploads/')) return cleanRel;
    return null;
  }

  let ext = 'jpg';
  let rawBase64 = trimmed;
  const match = trimmed.match(/^data:image\/([a-zA-Z0-9.+]+);base64,(.+)$/);
  if (match) {
    const rawExt = match[1].toLowerCase();
    ext = rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg');
    rawBase64 = match[2];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (!buffer || buffer.length < 16) return null;

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomStr = crypto.randomBytes(3).toString('hex');
  const filename = `${prefix}_${dateStr}_${randomStr}.${ext}`;

  const diskPath = path.resolve(UPLOADS_DIR, filename);
  if (!diskPath.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error('Path traversal detected');
  }

  fs.writeFileSync(diskPath, buffer);
  return `uploads/${filename}`;
}

// Authentication Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' });
  }

  const session = sessions.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }

  req.user = session.user;
  req.role = session.role;
  req.name = session.name;
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() || req.query.token;
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    if (session.expiresAt >= Date.now()) {
      req.user = session.user;
      req.role = session.role;
      req.name = session.name;
    }
  }
  next();
}

// ------------------------------------------------------------------
// API HANDLERS: AUTHENTICATION
// ------------------------------------------------------------------

function handleLogin(req, res) {
  try {
    const ip = getClientIp(req);
    const failRecord = loginFailures.get(ip);
    if (failRecord && failRecord.bannedUntil && failRecord.bannedUntil > Date.now()) {
      const waitMin = Math.ceil((failRecord.bannedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        error: `IP ของคุณถูกระงับชั่วคราวเนื่องจากล็อกอินผิดพลาดเกินกำหนด กรุณารอ ${waitMin} นาที`
      });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'กรุณากรอก Username และ Password' });
    }

    const uClean = String(username).trim().toLowerCase();
    const pStr = String(password).trim();

    // 1. Check Master Key (DEC-027)
    if (uClean === 'thedatazero' || uClean === MASTER_KEY.toLowerCase()) {
      if (pStr === MASTER_PASSWORD || pStr === '19842528') {
        loginFailures.delete(ip);
        const users = readJson(USERS_FILE, []);
        const uMaster = users.find(u => u.username.toLowerCase() === 'thedatazero');
        if (uMaster) {
          uMaster.last_login = getThaiNow();
          writeJsonAtomic(USERS_FILE, users);
        }

        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, {
          user: 'thedatazero',
          name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
          role: 'superadmin',
          expiresAt: Date.now() + SESSION_TTL
        });
        return res.json({
          success: true,
          token,
          user: {
            username: 'thedatazero',
            name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
            role: 'superadmin'
          }
        });
      }
    }

    // 2. Check Database Users
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => u.username.toLowerCase() === uClean);
    if (!user) {
      const count = (failRecord ? failRecord.count : 0) + 1;
      loginFailures.set(ip, {
        count,
        bannedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + BAN_DURATION_MS : 0
      });
      return res.status(401).json({ success: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    if (user.is_active === false || user.is_active === 0) {
      return res.status(403).json({ success: false, error: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว' });
    }

    const calcHash = crypto.pbkdf2Sync(pStr, user.salt, 10000, 64, 'sha512').toString('hex');
    if (calcHash !== user.hash) {
      const count = (failRecord ? failRecord.count : 0) + 1;
      loginFailures.set(ip, {
        count,
        bannedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + BAN_DURATION_MS : 0
      });
      return res.status(401).json({ success: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    // DEC-027: Block Admin/Staff from accessing /back gate
    if (req.body.gate === 'back' && String(user.role || '').toLowerCase() !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'ระดับ Admin ไม่มีสิทธิ์เข้าถึงห้องความปลอดภัยหลังบ้าน (เฉพาะผู้ถือ Master Key เท่านั้น)'
      });
    }

    loginFailures.delete(ip);
    user.last_login = getThaiNow();
    writeJsonAtomic(USERS_FILE, users);

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      user: user.username,
      name: user.name || user.username,
      role: user.role || 'staff',
      expiresAt: Date.now() + SESSION_TTL
    });

    return res.json({
      success: true,
      token,
      user: {
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

function handleVerify(req, res) {
  return res.json({
    success: true,
    user: req.user,
    name: req.name,
    role: req.role
  });
}

// ------------------------------------------------------------------
// API HANDLERS: USER MANAGEMENT + SURVEY CREDIT (for /polemap/back)
// ------------------------------------------------------------------

function parseThaiTimestamp(str) {
  if (!str || typeof str !== 'string') return 0;
  const parts = str.trim().split(' ');
  const dParts = (parts[0] || '').split('/').map(Number);
  if (dParts.length !== 3) return 0;
  const tParts = (parts[1] || '00:00:00').split(':').map(Number);
  return new Date(dParts[2] - 543, dParts[1] - 1, dParts[0], tParts[0] || 0, tParts[1] || 0, tParts[2] || 0).getTime() || 0;
}

function buildUsersWithStats() {
  const users = readJson(USERS_FILE, []);
  const poles = readJson(POLES_FILE, []);

  // Ensure every user has a stable id & fields
  let modified = false;
  users.forEach((u, idx) => {
    if (!u.id) {
      u.id = idx + 1;
      modified = true;
    }
    if (u.is_active === undefined) {
      u.is_active = 1;
      modified = true;
    }
  });
  if (modified) writeJsonAtomic(USERS_FILE, users);

  const statsMap = {};
  poles.forEach(p => {
    const creator = String(p.created_by || '').trim().toLowerCase();
    const editor = String(p.updated_by || '').trim().toLowerCase();
    if (creator) {
      if (!statsMap[creator]) {
        statsMap[creator] = { survey_count: 0, edit_count: 0, last_survey_at: '-', max_ts: 0 };
      }
      statsMap[creator].survey_count++;
      const ts = parseThaiTimestamp(p.created_at);
      if (ts >= statsMap[creator].max_ts && p.created_at) {
        statsMap[creator].max_ts = ts;
        statsMap[creator].last_survey_at = p.created_at;
      }
    }
    if (editor) {
      if (!statsMap[editor]) {
        statsMap[editor] = { survey_count: 0, edit_count: 0, last_survey_at: '-', max_ts: 0 };
      }
      statsMap[editor].edit_count++;
    }
  });

  return users.map((u, idx) => {
    const key = u.username.toLowerCase();
    const st = statsMap[key] || { survey_count: 0, edit_count: 0, last_survey_at: '-' };
    const isMaster = Boolean(u.is_master || key === 'thedatazero' || String(u.role || '').toLowerCase() === 'superadmin');
    return {
      id: u.id || (idx + 1),
      username: u.username,
      name: u.name || u.username,
      full_name: u.name || u.username,
      role: u.role || 'staff',
      is_master: isMaster,
      is_active: u.is_active !== undefined ? u.is_active : 1,
      created_at: u.created_at || '-',
      updated_at: u.updated_at || '-',
      last_login: u.last_login || '-',
      survey_count: st.survey_count,
      edit_count: st.edit_count,
      last_survey_at: st.last_survey_at
    };
  });
}

function handleGetUsers(req, res) {
  const safeUsers = buildUsersWithStats();
  res.json({ success: true, users: safeUsers, data: safeUsers });
}

function handleCreateOrSaveUser(req, res) {
  try {
    const { username, password, name, full_name, role, is_active } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'กรุณาระบุ Username' });
    const uClean = String(username).trim().toLowerCase();
    const displayName = (name || full_name || '').trim();
    const users = readJson(USERS_FILE, []);
    let user = users.find(u => u.username.toLowerCase() === uClean);

    if (user) {
      if (displayName) user.name = displayName;
      if (role !== undefined && String(role).trim() !== '') user.role = String(role).trim().toLowerCase();
      if (is_active !== undefined) user.is_active = is_active ? 1 : 0;
      if (password !== undefined && String(password).trim() !== '') {
        user.salt = crypto.randomBytes(16).toString('hex');
        user.hash = crypto.pbkdf2Sync(String(password).trim(), user.salt, 10000, 64, 'sha512').toString('hex');
      }
      user.updated_at = getThaiNow();
    } else {
      if (!password || String(password).trim() === '') {
        return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสผ่านสำหรับบัญชีผู้ใช้ใหม่' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      user = {
        id: uClean,
        username: uClean,
        name: displayName || `เจ้าหน้าที่ (${uClean})`,
        role: (role || 'staff').toLowerCase(),
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
        salt,
        hash: crypto.pbkdf2Sync(String(password).trim(), salt, 10000, 64, 'sha512').toString('hex'),
        created_at: getThaiNow(),
        last_login: '-'
      };
      users.push(user);
    }

    writeJsonAtomic(USERS_FILE, users);
    res.json({ success: true, message: 'บันทึกบัญชีผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function handleUpdateUserById(req, res) {
  try {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const { username, name, full_name, role, is_active, password } = req.body;
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => String(u.id || u.username).toLowerCase() === targetId || u.username.toLowerCase() === targetId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' });
    }
    if (user.is_master || user.username.toLowerCase() === 'thedatazero') {
      return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร ไม่สามารถแก้ไขผ่านหน้าเว็บได้' });
    }

    // Allow renaming username if not thedatazero
    if (username && String(username).trim().toLowerCase() !== user.username.toLowerCase()) {
      if (user.username.toLowerCase() === 'thedatazero') {
        return res.status(403).json({ success: false, error: 'ไม่สามารถเปลี่ยน Username ของ Master Key ได้' });
      }
      const newU = String(username).trim().toLowerCase();
      if (users.some(u => u !== user && u.username.toLowerCase() === newU)) {
        return res.status(400).json({ success: false, error: 'Username นี้มีอยู่ในระบบแล้ว' });
      }
      user.username = newU;
      user.id = newU;
    }

    const displayName = (name !== undefined ? name : full_name);
    if (displayName !== undefined && String(displayName).trim() !== '') {
      user.name = String(displayName).trim();
    }
    if (role !== undefined && String(role).trim() !== '') {
      user.role = String(role).trim().toLowerCase();
    }
    if (is_active !== undefined) {
      if (user.username.toLowerCase() === 'thedatazero' && !is_active) {
        return res.status(403).json({ success: false, error: 'ไม่สามารถระงับบัญชี Master Key ได้' });
      }
      user.is_active = is_active ? 1 : 0;
    }
    if (password !== undefined && String(password).trim() !== '') {
      user.salt = crypto.randomBytes(16).toString('hex');
      user.hash = crypto.pbkdf2Sync(String(password).trim(), user.salt, 10000, 64, 'sha512').toString('hex');
    }
    user.updated_at = getThaiNow();

    writeJsonAtomic(USERS_FILE, users);
    res.json({ success: true, message: 'อัปเดตข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function handleUpdatePasswordById(req, res) {
  try {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const { new_password, password } = req.body;
    const pwd = String(new_password || password || '').trim();
    if (!pwd || pwd.length < 4) {
      return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }

    const users = readJson(USERS_FILE, []);
    const user = users.find(u => String(u.id || u.username).toLowerCase() === targetId || u.username.toLowerCase() === targetId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' });
    }
    if (user.is_master || user.username.toLowerCase() === 'thedatazero') {
      return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร ไม่สามารถแก้ไขผ่านหน้าเว็บได้' });
    }

    user.salt = crypto.randomBytes(16).toString('hex');
    user.hash = crypto.pbkdf2Sync(pwd, user.salt, 10000, 64, 'sha512').toString('hex');
    user.updated_at = getThaiNow();

    writeJsonAtomic(USERS_FILE, users);
    res.json({ success: true, message: `เปลี่ยนรหัสผ่านของ ${user.username} สำเร็จแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

function handleDeleteUser(req, res) {
  try {
    const target = String(req.params.username || req.params.id || '').trim().toLowerCase();
    if (!target) return res.status(400).json({ success: false, error: 'ไม่ระบุชื่อผู้ใช้' });
    if (target === 'thedatazero') {
      return res.status(403).json({ success: false, error: 'ไม่สามารถลบบัญชี Master Key Superadmin ได้' });
    }
    const users = readJson(USERS_FILE, []);
    const idx = users.findIndex(u => u.username.toLowerCase() === target || String(u.id || '').toLowerCase() === target);
    if (idx === -1) return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้นี้' });
    const removed = users[idx];
    users.splice(idx, 1);
    writeJsonAtomic(USERS_FILE, users);
    res.json({ success: true, message: `ลบบัญชี ${removed.username} เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// ------------------------------------------------------------------
// API HANDLERS: SECURITY RADAR (DEC-026)
// ------------------------------------------------------------------

function handleGetSecurityLogs(req, res) {
  const logs = readJson(SEC_LOGS_FILE, []);
  const now = Date.now();
  const bannedList = [];
  for (const [ip, data] of loginFailures.entries()) {
    if (data.bannedUntil && data.bannedUntil > now) {
      bannedList.push({
        ip,
        attempts: data.count,
        remaining_minutes: Math.ceil((data.bannedUntil - now) / 60000)
      });
    }
  }
  res.json({
    success: true,
    logs,
    banned_ips: bannedList
  });
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
  const { ip } = req.body;
  if (ip) {
    loginFailures.delete(ip);
  } else {
    loginFailures.clear();
  }
  res.json({ success: true, message: `ปลดแบน IP ${ip || 'ทั้งหมด'} เรียบร้อยแล้ว` });
}

// ------------------------------------------------------------------
// API HANDLERS: POLES CRUD
// ------------------------------------------------------------------

// Helper: Build Username -> Safe Display Name map from users.json (Never expose raw login IDs on UI)
function getUserDisplayNameMap() {
  const users = readJson(USERS_FILE, []);
  const map = {
    'thedatazero': 'ผู้ดูแลระบบสูงสุด',
    'admin': 'ผู้ดูแลระบบ',
    'horn': 'เอ',
    'monitor_msi': 'เอ๋',
    'phachara': 'เซ็ต',
    'dump': 'ดั้ม'
  };
  users.forEach(u => {
    if (u.username && u.name) {
      map[String(u.username).trim().toLowerCase()] = String(u.name).trim();
    }
  });
  return map;
}

function resolveDisplayName(rawIdOrName, nameMap) {
  if (!rawIdOrName) return '';
  const key = String(rawIdOrName).trim().toLowerCase();
  return nameMap[key] || String(rawIdOrName).trim();
}

function enrichPoleDisplayNames(pole, nameMap) {
  return {
    ...pole,
    created_by_name: pole.created_by ? resolveDisplayName(pole.created_by, nameMap) : '',
    updated_by_name: pole.updated_by ? resolveDisplayName(pole.updated_by, nameMap) : ''
  };
}

function handleGetPoles(req, res) {
  const poles = readJson(POLES_FILE, []);
  const nameMap = getUserDisplayNameMap();
  const enriched = poles.map(p => enrichPoleDisplayNames(p, nameMap));
  res.json({ success: true, count: enriched.length, data: enriched });
}

function handleGetSinglePole(req, res) {
  const { id } = req.params;
  const poles = readJson(POLES_FILE, []);
  const pole = poles.find(p => p.id === id);
  if (!pole) return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลจุดติดตั้ง' });
  const nameMap = getUserDisplayNameMap();
  res.json({ success: true, data: enrichPoleDisplayNames(pole, nameMap) });
}

// Create new pole -> sets created_by and created_at (พ.ศ.), leaves updated_by and updated_at empty
function handleCreatePole(req, res) {
  try {
    const body = req.body;
    const name = body.name || body.Name;
    const coords = body.coordinates || body.Coordinates || (body.lat && body.lng ? `${body.lat},${body.lng}` : '');
    if (!name || !coords) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อจุดติดตั้งและพิกัด GPS' });
    }

    let lat = parseFloat(body.lat || body.Lat);
    let lng = parseFloat(body.lng || body.Lng);
    if ((!lat || !lng) && coords) {
      const parts = String(coords).split(',');
      if (parts.length === 2) {
        lat = parseFloat(parts[0].trim());
        lng = parseFloat(parts[1].trim());
      }
    }

    let savedImagePath = '';
    const imgPayload = body.image || body.Image || body.imageBase64;
    if (imgPayload) {
      try {
        savedImagePath = saveBase64Image(imgPayload) || '';
      } catch (e) {
        return res.status(400).json({ success: false, error: 'รูปภาพไม่ถูกต้อง' });
      }
    }

    const actor = req.user || body.created_by || body.user || body.updated_by || 'admin';
    const thaiNow = getThaiNow();

    let locType = body.location_type || 'เสาไฟ';
    if (locType === 'เสา (Pole)' || locType === 'เสาเทศบาล') locType = 'เสาไฟ';

    const poles = readJson(POLES_FILE, []);
    const newPole = {
      id: body.id || body.ID || crypto.randomUUID(),
      pole_code: body.pole_code || ('MS-' + String(poles.length + 1).padStart(3, '0')),
      community: (body.community || body.Community || 'ไม่ระบุชุมชน').trim(),
      name: name.trim(),
      device_type: body.device_type || 'ลำโพง',
      location_type: locType,
      note: (body.note || body.Note || '').trim(),
      status: body.status || body.Status || 'ใช้งานได้',
      lat: lat || 0,
      lng: lng || 0,
      coordinates: String(coords || `${lat},${lng}`).trim(),
      image: savedImagePath,
      image_url: savedImagePath ? (`/polemap/${savedImagePath}`) : '',
      created_at: thaiNow,
      created_by: String(actor).trim(),
      updated_at: '',
      updated_by: ''
    };

    poles.unshift(newPole);
    writeJsonAtomic(POLES_FILE, poles);
    const nameMap = getUserDisplayNameMap();
    const enrichedNew = enrichPoleDisplayNames(newPole, nameMap);

    res.json({
      success: true,
      message: 'เพิ่มจุดติดตั้งสำเร็จ',
      id: enrichedNew.id,
      image: enrichedNew.image_url,
      created_at: enrichedNew.created_at,
      created_by: enrichedNew.created_by,
      created_by_name: enrichedNew.created_by_name,
      updatedAt: enrichedNew.created_at,
      updatedBy: enrichedNew.created_by_name,
      data: enrichedNew
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Update pole -> NEVER overwrites created_by / created_at! Sets updated_by and updated_at (พ.ศ.)
function handleUpdatePole(req, res) {
  try {
    const { id } = req.params;
    const body = req.body;

    const poles = readJson(POLES_FILE, []);
    const index = poles.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'ไม่พบจุดติดตั้งที่ต้องการแก้ไข' });
    }

    const existing = poles[index];
    let newImagePath = existing.image;

    const imgPayload = body.image !== undefined ? body.image : (body.imageBase64 !== undefined ? body.imageBase64 : body.Image);
    if (imgPayload && typeof imgPayload === 'string' && !imgPayload.startsWith('uploads/') && !imgPayload.startsWith('/polemap/uploads/') && !imgPayload.startsWith('http')) {
      try {
        const saved = saveBase64Image(imgPayload);
        if (saved) {
          if (existing.image && existing.image !== saved) {
            safeDeleteUpload(existing.image);
          }
          newImagePath = saved;
        }
      } catch (e) {
        return res.status(400).json({ success: false, error: 'อัปโหลดภาพไม่สำเร็จ' });
      }
    } else if ((imgPayload === '' || body.removeImage === true) && existing.image && (body.removeImage === true || body.Image === '' || body.image === '')) {
      safeDeleteUpload(existing.image);
      newImagePath = '';
    }

    let coords = body.coordinates !== undefined ? String(body.coordinates).trim() : (body.Coordinates !== undefined ? String(body.Coordinates).trim() : existing.coordinates);
    let lat = existing.lat;
    let lng = existing.lng;
    if (coords) {
      const parts = coords.split(',');
      if (parts.length === 2) {
        lat = parseFloat(parts[0].trim());
        lng = parseFloat(parts[1].trim());
      }
    }

    const editor = req.user || body.updated_by || body.user || 'admin';
    const thaiNow = getThaiNow();

    let locType = body.location_type !== undefined ? body.location_type : (existing.location_type || 'เสาไฟ');
    if (locType === 'เสา (Pole)' || locType === 'เสาเทศบาล') locType = 'เสาไฟ';

    const updatedPole = {
      ...existing,
      community: body.community !== undefined ? String(body.community).trim() : (body.Community !== undefined ? String(body.Community).trim() : existing.community),
      name: body.name !== undefined ? String(body.name).trim() : (body.Name !== undefined ? String(body.Name).trim() : existing.name),
      device_type: body.device_type !== undefined ? body.device_type : (existing.device_type || 'ลำโพง'),
      location_type: locType,
      note: body.note !== undefined ? String(body.note).trim() : (body.Note !== undefined ? String(body.Note).trim() : existing.note),
      status: body.status !== undefined ? body.status : (body.Status !== undefined ? body.Status : existing.status),
      lat,
      lng,
      coordinates: coords,
      image: newImagePath,
      image_url: newImagePath ? (`/polemap/${newImagePath}`) : '',
      // Preserve initial creation audit fields strictly
      created_at: existing.created_at || existing.updated_at || thaiNow,
      created_by: existing.created_by || existing.updated_by || 'admin',
      // Set latest modification audit fields in Buddhist Era (พ.ศ.)
      updated_at: thaiNow,
      updated_by: String(editor).trim()
    };

    poles[index] = updatedPole;
    writeJsonAtomic(POLES_FILE, poles);
    const nameMap = getUserDisplayNameMap();
    const enrichedUpdated = enrichPoleDisplayNames(updatedPole, nameMap);

    res.json({
      success: true,
      message: 'บันทึกการแก้ไขสำเร็จ',
      id: enrichedUpdated.id,
      image: enrichedUpdated.image_url,
      updated_at: enrichedUpdated.updated_at,
      updated_by: enrichedUpdated.updated_by,
      updated_by_name: enrichedUpdated.updated_by_name,
      created_by_name: enrichedUpdated.created_by_name,
      updatedAt: enrichedUpdated.updated_at,
      updatedBy: enrichedUpdated.updated_by_name,
      data: enrichedUpdated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Delete pole (With automatic cleanup of its image file)
function handleDeletePole(req, res) {
  try {
    const { id } = req.params;
    const poles = readJson(POLES_FILE, []);
    const index = poles.findIndex(p => p.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'ไม่พบจุดติดตั้งที่ต้องการลบ' });
    }

    const [removed] = poles.splice(index, 1);
    if (removed.image) {
      safeDeleteUpload(removed.image);
    }

    writeJsonAtomic(POLES_FILE, poles);
    res.json({ success: true, msg: 'ลบจุดติดตั้งและไฟล์ภาพเรียบร้อยแล้ว', message: 'ลบจุดติดตั้งและไฟล์ภาพเรียบร้อยแล้ว' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Summary statistics
function handleSummary(req, res) {
  const poles = readJson(POLES_FILE, []);
  const byStatus = { 'ใช้งานได้': 0, 'ชำรุด': 0, 'สูญหาย': 0 };
  const byType = {};
  const byLocation = {};
  const byCommunity = {};

  poles.forEach(p => {
    const s = p.status || 'ใช้งานได้';
    byStatus[s] = (byStatus[s] || 0) + 1;

    const t = p.device_type || 'ลำโพง';
    byType[t] = (byType[t] || 0) + 1;

    const loc = p.location_type || 'เสาไฟ';
    byLocation[loc] = (byLocation[loc] || 0) + 1;

    const c = p.community || 'ไม่ระบุชุมชน';
    byCommunity[c] = (byCommunity[c] || 0) + 1;
  });

  res.json({
    success: true,
    total: poles.length,
    byStatus,
    byType,
    byLocation,
    byCommunity,
    generated_at: getThaiNow(),
    msg: `สรุปข้อมูลทั้งสิ้น ${poles.length} จุดติดตั้ง (ณ ${getThaiNow()})`,
    url: '/polemap/manage'
  });
}

// Register API Routes on both prefix formats
const apiPrefixes = ['/polemap/api', '/api'];
apiPrefixes.forEach(prefix => {
  app.post(`${prefix}/auth/login`, handleLogin);
  app.get(`${prefix}/auth/verify`, authenticate, handleVerify);

  // Superadmin & Users Management Routes
  app.get(`${prefix}/superadmin/users`, optionalAuth, handleGetUsers);
  app.post(`${prefix}/superadmin/users`, optionalAuth, handleCreateOrSaveUser);
  app.put(`${prefix}/superadmin/users/:id`, optionalAuth, handleUpdateUserById);
  app.put(`${prefix}/superadmin/users/:id/password`, optionalAuth, handleUpdatePasswordById);
  app.delete(`${prefix}/superadmin/users/:id`, optionalAuth, handleDeleteUser);

  app.get(`${prefix}/users`, optionalAuth, handleGetUsers);
  app.post(`${prefix}/users`, optionalAuth, handleCreateOrSaveUser);
  app.put(`${prefix}/users/:id`, optionalAuth, handleUpdateUserById);
  app.put(`${prefix}/users/:id/password`, optionalAuth, handleUpdatePasswordById);
  app.delete(`${prefix}/users/:username`, optionalAuth, handleDeleteUser);

  // Security Radar Routes (DEC-026)
  app.get(`${prefix}/security/logs`, optionalAuth, handleGetSecurityLogs);
  app.delete(`${prefix}/security/logs`, optionalAuth, handleClearSecurityLogs);
  app.post(`${prefix}/security/unban-ip`, optionalAuth, handleUnbanIp);

  // Poles Routes
  app.get(`${prefix}/poles`, handleGetPoles);
  app.get(`${prefix}/speakers`, handleGetPoles);
  app.get(`${prefix}/poles/:id`, handleGetSinglePole);
  app.post(`${prefix}/poles`, optionalAuth, handleCreatePole);
  app.put(`${prefix}/poles/:id`, optionalAuth, handleUpdatePole);
  app.delete(`${prefix}/poles/:id`, optionalAuth, handleDeletePole);

  app.get(`${prefix}/reports/summary`, handleSummary);
  app.get(`${prefix}/health`, (req, res) => res.json({ status: 'ok', service: 'POLE MAP', time: getThaiNow() }));
});

// ------------------------------------------------------------------
// STATIC FILES & HTML PAGES (Strict lowercase routing)
// ------------------------------------------------------------------

app.use('/polemap/uploads', express.static(UPLOADS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/polemap/public', express.static(path.join(PROJECT_DIR, 'public')));
app.use('/public', express.static(path.join(PROJECT_DIR, 'public')));

app.get(['/polemap', '/polemap/', '/', '/index', '/index.html', '/polemap/index', '/polemap/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PROJECT_DIR, 'index.html'));
});

app.get(['/polemap/manage', '/manage', '/manage.html', '/polemap/manage.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PROJECT_DIR, 'manage.html'));
});

app.get(['/polemap/back', '/back', '/back.html', '/polemap/back.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path.join(PROJECT_DIR, 'back.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(` POLE MAP SERVER RUNNING ON PORT: ${PORT}`);
  console.log(` Main Map:    http://127.0.0.1:${PORT}/polemap/`);
  console.log(` Management:  http://127.0.0.1:${PORT}/polemap/manage`);
  console.log(` Security:    http://127.0.0.1:${PORT}/polemap/back`);
  console.log(` REST API:    http://127.0.0.1:${PORT}/polemap/api/poles`);
  console.log(`=======================================================`);
});
