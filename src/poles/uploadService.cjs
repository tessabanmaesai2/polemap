const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR } = require('../config.cjs');

function detectImageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'png';
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'webp';
  return null;
}

function safeDeleteUpload(imagePath) {
  if (!imagePath || typeof imagePath !== 'string') return;
  const cleanName = path.basename(imagePath);
  if (!cleanName || cleanName === 'uploads') return;

  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const fullPath = path.resolve(uploadsRoot, cleanName);
  if (fullPath.startsWith(uploadsRoot + path.sep) && fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.warn(`[FILE CLEANUP WARN] Failed to delete ${cleanName}:`, err.message);
    }
  }
}

function saveBase64Image(base64Str, prefix = 'IMG') {
  if (!base64Str || typeof base64Str !== 'string') return null;
  const trimmed = base64Str.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('uploads/') || trimmed.startsWith('/polemap/uploads/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const cleanRel = trimmed.replace(/^https?:\/\/[^/]+/, '').replace(/^\/polemap\//, '').replace(/^\//, '');
    if (cleanRel.startsWith('uploads/')) return cleanRel;
    return null;
  }

  let rawBase64 = trimmed;
  const match = trimmed.match(/^data:image\/[a-zA-Z0-9.+]+;base64,(.+)$/);
  if (match) {
    rawBase64 = match[1];
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  const ext = detectImageExtension(buffer);
  if (!ext) {
    throw new Error('ไฟล์รูปภาพไม่ถูกต้อง (รองรับเฉพาะ JPG, PNG, WebP)');
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const randomStr = crypto.randomBytes(3).toString('hex');
  const filename = `${prefix}_${dateStr}_${randomStr}.${ext}`;

  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const diskPath = path.resolve(uploadsRoot, filename);
  if (!diskPath.startsWith(uploadsRoot + path.sep)) {
    throw new Error('Path traversal detected');
  }

  fs.writeFileSync(diskPath, buffer);
  return `uploads/${filename}`;
}

module.exports = {
  detectImageExtension,
  safeDeleteUpload,
  saveBase64Image
};
