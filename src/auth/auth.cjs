const crypto = require('crypto');
const { USERS_FILE, getMasterCredentials, getHmacSecret } = require('../config.cjs');
const { getThaiNow, readJson, writeJsonAtomic, timingSafeEqualStr, verifyPassword } = require('../utils/core.cjs');
const { getClientIp, checkLoginRateLimit, recordFailedLogin, recordSuccessfulLogin } = require('../security/radar.cjs');

const SESSION_TTL = 24 * 60 * 60 * 1000;

function signSessionToken(sessionObj) {
  const payloadObj = {
    u: sessionObj.user,
    n: sessionObj.name,
    r: sessionObj.role,
    m: Boolean(sessionObj.isMaster),
    exp: Date.now() + SESSION_TTL
  };
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getHmacSecret('polemap_session_v1')).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sigHex] = parts;
  const expectedHex = crypto.createHmac('sha256', getHmacSecret('polemap_session_v1')).update(payload).digest('hex');
  if (!timingSafeEqualStr(sigHex, expectedHex)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed && typeof parsed.exp === 'number' && Date.now() <= parsed.exp && parsed.u) {
      return {
        user: parsed.u,
        name: parsed.n || parsed.u,
        role: parsed.r || 'staff',
        isMaster: Boolean(parsed.m),
        expiresAt: parsed.exp
      };
    }
  } catch (_) {}
  return null;
}

function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (bearer && bearer !== 'null' && bearer !== 'undefined') return bearer;
  const qToken = String((req.query && req.query.token) || '').trim();
  if (qToken && qToken !== 'null' && qToken !== 'undefined') return qToken;
  return '';
}

function authenticate(req, res, next) {
  const token = extractToken(req);
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ success: false, error: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' });
  }
  req.user = session.user;
  req.role = session.role;
  req.name = session.name;
  req.isMaster = session.isMaster;
  next();
}

function requireSuperAdmin(req, res, next) {
  const role = String(req.role || '').toLowerCase();
  if (req.isMaster || role === 'superadmin' || role === 'super admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'ระดับ Admin ไม่มีสิทธิ์เข้าถึงห้องควบคุมความปลอดภัย (เฉพาะผู้ถือ Master Key เท่านั้น)'
  });
}

function handleLogin(req, res) {
  try {
    const ip = getClientIp(req);
    const { username, password, gate } = req.body || {};
    const uClean = String(username || '').trim().toLowerCase();
    const pStr = String(password || '').trim();

    const rateCheck = checkLoginRateLimit(ip, uClean);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `IP ของคุณถูกระงับชั่วคราวเนื่องจากล็อกอินผิดพลาดเกินกำหนด กรุณารอ ${rateCheck.waitMin} นาที`
      });
    }

    if (!uClean || !pStr) {
      return res.status(400).json({ success: false, error: 'กรุณากรอก Username และ Password' });
    }

    // 1. Master Key Authentication (strictly from env, timing-safe, no shortcut PIN)
    const { masterKey, masterPassword, configured } = getMasterCredentials();
    const isMasterUser = configured && (uClean === masterKey.toLowerCase());
    if (isMasterUser && timingSafeEqualStr(pStr, masterPassword)) {
      recordSuccessfulLogin(ip, uClean);
      const users = readJson(USERS_FILE, []);
      const uMaster = users.find(u => String(u.username || '').toLowerCase() === masterKey.toLowerCase());
      if (uMaster) {
        uMaster.last_login = getThaiNow();
        writeJsonAtomic(USERS_FILE, users);
      }
      const userObj = {
        username: masterKey,
        name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
        role: 'superadmin',
        is_master: true
      };
      const token = signSessionToken({ user: masterKey, name: userObj.name, role: 'superadmin', isMaster: true });
      return res.json({ success: true, token, user: userObj });
    }

    // 2. Database Users (users.json with PBKDF2 SHA-512)
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => String(u.username || '').toLowerCase() === uClean);
    if (!user || !verifyPassword(pStr, user.salt, user.hash)) {
      recordFailedLogin(ip, uClean, req);
      return res.status(401).json({ success: false, error: 'Username หรือ Password ไม่ถูกต้อง' });
    }

    if (user.is_active === false || user.is_active === 0) {
      return res.status(403).json({ success: false, error: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว' });
    }

    // DEC-027: Block non-superadmin from /back gate
    const roleLower = String(user.role || '').toLowerCase();
    if (gate === 'back' && roleLower !== 'superadmin' && roleLower !== 'super admin' && !user.is_master) {
      return res.status(403).json({
        success: false,
        error: 'ระดับ Admin ไม่มีสิทธิ์เข้าถึงห้องความปลอดภัยหลังบ้าน (เฉพาะผู้ถือ Master Key เท่านั้น)'
      });
    }

    recordSuccessfulLogin(ip, uClean);
    user.last_login = getThaiNow();
    writeJsonAtomic(USERS_FILE, users);

    const token = signSessionToken({
      user: user.username,
      name: user.name || user.username,
      role: user.role || 'staff',
      isMaster: Boolean(user.is_master)
    });

    return res.json({
      success: true,
      token,
      user: {
        username: user.username,
        name: user.name || user.username,
        role: user.role || 'staff',
        is_master: Boolean(user.is_master)
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
    role: req.role,
    is_master: req.isMaster
  });
}

module.exports = {
  authenticate,
  requireSuperAdmin,
  handleLogin,
  handleVerify,
  signSessionToken,
  verifySessionToken
};
