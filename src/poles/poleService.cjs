const crypto = require('crypto');
const { POLES_FILE } = require('../config.cjs');
const { getThaiNow, readJson, writeJsonAtomic } = require('../utils/core.cjs');
const { getUserDisplayNameMap, resolveDisplayName } = require('../users/userService.cjs');
const { safeDeleteUpload, saveBase64Image } = require('./uploadService.cjs');

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

function handleCreatePole(req, res) {
  try {
    const body = req.body || {};
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
        return res.status(400).json({ success: false, error: e.message || 'รูปภาพไม่ถูกต้อง' });
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
      community: String(body.community || body.Community || 'ไม่ระบุชุมชน').trim(),
      name: String(name).trim(),
      device_type: body.device_type || 'ลำโพง',
      location_type: locType,
      note: String(body.note || body.Note || '').trim(),
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

function handleUpdatePole(req, res) {
  try {
    const { id } = req.params;
    const body = req.body || {};

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
        return res.status(400).json({ success: false, error: e.message || 'อัปโหลดภาพไม่สำเร็จ' });
      }
    } else if ((imgPayload === '' || body.removeImage === true) && existing.image && (body.removeImage === true || body.Image === '' || body.image === '')) {
      safeDeleteUpload(existing.image);
      newImagePath = '';
    }

    const coords = body.coordinates !== undefined ? String(body.coordinates).trim() : (body.Coordinates !== undefined ? String(body.Coordinates).trim() : existing.coordinates);
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
      created_at: existing.created_at || existing.updated_at || thaiNow,
      created_by: existing.created_by || existing.updated_by || 'admin',
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

module.exports = {
  handleGetPoles,
  handleGetSinglePole,
  handleCreatePole,
  handleUpdatePole,
  handleDeletePole,
  handleSummary
};
