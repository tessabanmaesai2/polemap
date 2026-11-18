const fs = require('fs');
const crypto = require('crypto');

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

function parseThaiTimestamp(str) {
  if (!str || typeof str !== 'string') return 0;
  const parts = str.trim().split(' ');
  const dParts = (parts[0] || '').split('/').map(Number);
  if (dParts.length !== 3) return 0;
  const tParts = (parts[1] || '00:00:00').split(':').map(Number);
  return new Date(dParts[2] - 543, dParts[1] - 1, dParts[0], tParts[0] || 0, tParts[1] || 0, tParts[2] || 0).getTime() || 0;
}

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

function writeJsonAtomic(file, data) {
  try {
    const tmp = `${file}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error(`[ERROR] Write ${file}:`, err.message);
    return false;
  }
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 10000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const calcHash = crypto.pbkdf2Sync(String(password), String(salt), 10000, 64, 'sha512').toString('hex');
  return timingSafeEqualStr(calcHash, String(expectedHash));
}

module.exports = {
  getThaiNow,
  parseThaiTimestamp,
  readJson,
  writeJsonAtomic,
  timingSafeEqualStr,
  hashPassword,
  verifyPassword
};
