const { USERS_FILE, POLES_FILE, getMasterCredentials } = require('../config.cjs');
const { getThaiNow, parseThaiTimestamp, readJson, writeJsonAtomic, hashPassword } = require('../utils/core.cjs');

function getMasterKeyLower() {
  return (getMasterCredentials().masterKey || 'thedatazero').toLowerCase();
}

function isProtectedMasterUser(user) {
  const mk = getMasterKeyLower();
  const uname = String(user?.username || '').toLowerCase();
  const role = String(user?.role || '').toLowerCase();
  return Boolean(user?.is_master || uname === mk || uname === 'thedatazero' || role === 'superadmin');
}

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

function buildUsersWithStats(deviceTypeFilter = '') {
  const users = readJson(USERS_FILE, []);
  const poles = readJson(POLES_FILE, []);

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

  const byType = {};
  poles.forEach(p => {
    const dt = String(p.device_type || 'ลำโพง').trim() || 'ลำโพง';
    byType[dt] = (byType[dt] || 0) + 1;
  });

  const cleanFilter = String(deviceTypeFilter || '').trim();
  const filteredPoles = cleanFilter
    ? poles.filter(p => (String(p.device_type || 'ลำโพง').trim() || 'ลำโพง') === cleanFilter)
    : poles;

  const communitiesSet = new Set();
  const communityCounts = {};
  const locationCounts = {};
  const byStatus = { 'ใช้งานได้': 0, 'ชำรุด': 0, 'สูญหาย': 0 };
  let totalEdits = 0;
  let withPhotoCount = 0;
  const statsMap = {};

  filteredPoles.forEach(p => {
    const comm = String(p.community || '').trim();
    if (comm) {
      communitiesSet.add(comm);
      communityCounts[comm] = (communityCounts[comm] || 0) + 1;
    }
    const loc = String(p.location_type || 'เสาไฟ').trim() || 'เสาไฟ';
    locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    if (p.image_url || p.image || (Array.isArray(p.images) && p.images.length > 0)) {
      withPhotoCount++;
    }
    const stVal = String(p.status || 'ใช้งานได้').trim() || 'ใช้งานได้';
    byStatus[stVal] = (byStatus[stVal] || 0) + 1;

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
      totalEdits++;
      if (!statsMap[editor]) {
        statsMap[editor] = { survey_count: 0, edit_count: 0, last_survey_at: '-', max_ts: 0 };
      }
      statsMap[editor].edit_count++;
    }
  });

  const mappedUsers = users.map((u, idx) => {
    const key = u.username.toLowerCase();
    const st = statsMap[key] || { survey_count: 0, edit_count: 0, last_survey_at: '-' };
    return {
      id: u.id || (idx + 1),
      username: u.username,
      name: u.name || u.username,
      full_name: u.name || u.username,
      role: u.role || 'staff',
      is_master: isProtectedMasterUser(u),
      is_active: u.is_active !== undefined ? u.is_active : 1,
      created_at: u.created_at || '-',
      updated_at: u.updated_at || '-',
      last_login: u.last_login || '-',
      survey_count: st.survey_count,
      edit_count: st.edit_count,
      last_survey_at: st.last_survey_at
    };
  });

  const topCommunities = Object.entries(communityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return {
    users: mappedUsers,
    meta: {
      total_poles: filteredPoles.length,
      all_poles_total: poles.length,
      communities_count: communitiesSet.size,
      top_communities: topCommunities,
      by_location: locationCounts,
      with_photo_count: withPhotoCount,
      device_type: cleanFilter || 'ALL',
      by_type: byType,
      by_status: byStatus,
      total_edits: totalEdits
    }
  };
}

function handleGetUsers(req, res) {
  const deviceTypeFilter = String((req.query && req.query.device_type) || '').trim();
  const result = buildUsersWithStats(deviceTypeFilter);
  res.json({ success: true, users: result.users, data: result.users, meta: result.meta });
}

function handleCreateOrSaveUser(req, res) {
  try {
    const { username, password, name, full_name, role, is_active } = req.body || {};
    if (!username) return res.status(400).json({ success: false, error: 'กรุณาระบุ Username' });
    const uClean = String(username).trim().toLowerCase();
    if (uClean === getMasterKeyLower() || uClean === 'thedatazero') {
      return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร ไม่สามารถสร้างทับหรือแก้ไขผ่านหน้าเว็บได้' });
    }

    const displayName = String(name || full_name || '').trim();
    const users = readJson(USERS_FILE, []);
    let user = users.find(u => String(u.username || '').toLowerCase() === uClean);

    if (user) {
      if (isProtectedMasterUser(user)) {
        return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร' });
      }
      if (displayName) user.name = displayName;
      if (role !== undefined && String(role).trim() !== '') user.role = String(role).trim().toLowerCase();
      if (is_active !== undefined) user.is_active = is_active ? 1 : 0;
      if (password !== undefined && String(password).trim() !== '') {
        const creds = hashPassword(String(password).trim());
        user.salt = creds.salt;
        user.hash = creds.hash;
      }
      user.updated_at = getThaiNow();
    } else {
      if (!password || String(password).trim() === '') {
        return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสผ่านสำหรับบัญชีผู้ใช้ใหม่' });
      }
      const creds = hashPassword(String(password).trim());
      user = {
        id: uClean,
        username: uClean,
        name: displayName || `เจ้าหน้าที่ (${uClean})`,
        role: (role || 'staff').toLowerCase(),
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
        salt: creds.salt,
        hash: creds.hash,
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
    const { username, name, full_name, role, is_active, password } = req.body || {};
    const users = readJson(USERS_FILE, []);
    const user = users.find(u => String(u.id || u.username).toLowerCase() === targetId || String(u.username || '').toLowerCase() === targetId);
    if (!user) return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' });
    if (isProtectedMasterUser(user)) {
      return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร ไม่สามารถแก้ไขผ่านหน้าเว็บได้' });
    }

    if (username && String(username).trim().toLowerCase() !== String(user.username || '').toLowerCase()) {
      const newU = String(username).trim().toLowerCase();
      if (newU === getMasterKeyLower() || newU === 'thedatazero' || users.some(u => u !== user && String(u.username || '').toLowerCase() === newU)) {
        return res.status(400).json({ success: false, error: 'Username นี้ไม่สามารถใช้งานหรือมีอยู่ในระบบแล้ว' });
      }
      user.username = newU;
      user.id = newU;
    }

    const displayName = (name !== undefined ? name : full_name);
    if (displayName !== undefined && String(displayName).trim() !== '') user.name = String(displayName).trim();
    if (role !== undefined && String(role).trim() !== '') user.role = String(role).trim().toLowerCase();
    if (is_active !== undefined) user.is_active = is_active ? 1 : 0;
    if (password !== undefined && String(password).trim() !== '') {
      const creds = hashPassword(String(password).trim());
      user.salt = creds.salt;
      user.hash = creds.hash;
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
    const { new_password, password } = req.body || {};
    const pwd = String(new_password || password || '').trim();
    if (!pwd || pwd.length < 4) {
      return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' });
    }

    const users = readJson(USERS_FILE, []);
    const user = users.find(u => String(u.id || u.username).toLowerCase() === targetId || String(u.username || '').toLowerCase() === targetId);
    if (!user) return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ' });
    if (isProtectedMasterUser(user)) {
      return res.status(403).json({ success: false, error: 'บัญชีระบบ Master Key ถูกล็อกถาวร ไม่สามารถแก้ไขผ่านหน้าเว็บได้' });
    }

    const creds = hashPassword(pwd);
    user.salt = creds.salt;
    user.hash = creds.hash;
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
    const users = readJson(USERS_FILE, []);
    const idx = users.findIndex(u => String(u.username || '').toLowerCase() === target || String(u.id || '').toLowerCase() === target);
    if (idx === -1) return res.status(404).json({ success: false, error: 'ไม่พบบัญชีผู้ใช้นี้' });
    if (isProtectedMasterUser(users[idx])) {
      return res.status(403).json({ success: false, error: 'ไม่สามารถลบบัญชี Master Key Superadmin ได้' });
    }
    const removed = users.splice(idx, 1)[0];
    writeJsonAtomic(USERS_FILE, users);
    res.json({ success: true, message: `ลบบัญชี ${removed.username} เรียบร้อยแล้ว` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getUserDisplayNameMap,
  resolveDisplayName,
  buildUsersWithStats,
  handleGetUsers,
  handleCreateOrSaveUser,
  handleUpdateUserById,
  handleUpdatePasswordById,
  handleDeleteUser
};
