const isFile = window.location.protocol === 'file:';
    const API_BASE = isFile ? 'http://127.0.0.1:3406/polemap/api' : (window.location.pathname.startsWith('/polemap') ? '/polemap/api' : '/api');
    const UPLOAD_BASE = isFile ? 'http://127.0.0.1:3406/polemap/' : (window.location.pathname.startsWith('/polemap') ? '/polemap/' : '/');

    let allRows = [];
    let activeUploadRowId = null;
    let currentModalRowId = null;
    let newRowBase64Image = '';
    let currentUser = null;
    let currentUserDisplayName = '';

    const USER_DISPLAY_MAP = {
      'thedatazero': 'ผู้ดูแลระบบสูงสุด',
      'admin': 'ผู้ดูแลระบบ',
      'horn': 'เอ',
      'monitor_msi': 'เอ๋',
      'phachara': 'เซ็ต',
      'dump': 'ดั้ม'
    };

    function getSafeDisplayName(raw) {
      if (!raw) return '';
      const key = String(raw).trim().toLowerCase();
      return USER_DISPLAY_MAP[key] || String(raw).trim();
    }

    let currentPhotoFilter = ''; // '' | 'missing' | 'has'

    function updateManageKpis(sourceRows) {
      const rows = Array.isArray(sourceRows) ? sourceRows : allRows;
      const total = rows.length;
      let active = 0, broken = 0, missing = 0, photos = 0;
      const comms = new Set();
      rows.forEach(r => {
        const s = (r.status || 'ใช้งานได้').trim();
        if (s === 'ใช้งานได้') active++;
        else if (s === 'ชำรุด') broken++;
        else if (s === 'สูญหาย') missing++;
        if (r.image && String(r.image).trim() !== '') photos++;
        if (r.community) comms.add(r.community);
      });

      const fComm = document.getElementById('sheet-filter-comm')?.value || '';
      const fType = document.getElementById('sheet-filter-type')?.value || '';

      const elTotal = document.getElementById('kpi-total');
      if (elTotal) elTotal.textContent = total.toLocaleString();
      const elComm = document.getElementById('kpi-comm-count');
      if (elComm) {
        if (fType && fComm) {
          elComm.textContent = `${fType} • ${fComm}`;
        } else if (fType) {
          elComm.textContent = `ประเภท: ${fType} (${comms.size} ชุมชน)`;
        } else if (fComm) {
          elComm.textContent = `ชุมชน: ${fComm}`;
        } else {
          elComm.textContent = `${comms.size || 10} ชุมชนในเขตเทศบาล`;
        }
      }
      const elAct = document.getElementById('kpi-active');
      if (elAct) elAct.textContent = active.toLocaleString();
      const elBrk = document.getElementById('kpi-broken');
      if (elBrk) elBrk.textContent = broken.toLocaleString();
      const elMis = document.getElementById('kpi-missing');
      if (elMis) elMis.textContent = missing.toLocaleString();
      const elPho = document.getElementById('kpi-photos');
      if (elPho) elPho.textContent = `${photos}/${total}`;
      const elPhoSub = document.getElementById('kpi-photos-sub');
      if (elPhoSub) {
        const waitCount = total - photos;
        if (currentPhotoFilter === 'missing') {
          elPhoSub.textContent = `กำลังกรอง: รออัปโหลด ${waitCount} จุด (คลิกอีกทีเพื่อดูที่มีรูป)`;
        } else if (currentPhotoFilter === 'has') {
          elPhoSub.textContent = `กำลังกรอง: มีรูปแล้ว ${photos} จุด (คลิกอีกทีเพื่อแสดงทั้งหมด)`;
        } else {
          elPhoSub.textContent = `มีรูป ${photos} จุด • รออัปโหลด ${waitCount} จุด`;
        }
      }
    }

    function filterByKpiStatus(statusVal) {
      if (statusVal === '') {
        currentPhotoFilter = '';
      }
      const sel = document.getElementById('sheet-filter-stat');
      if (sel) {
        sel.value = statusVal;
        renderGrid();
      }
      document.querySelectorAll('.kpi-strip .kpi-card').forEach(c => c.classList.remove('active-filter'));
      if (statusVal === '') document.getElementById('kpi-card-all')?.classList.add('active-filter');
      else if (statusVal === 'ใช้งานได้') document.getElementById('kpi-card-active')?.classList.add('active-filter');
      else if (statusVal === 'ชำรุด') document.getElementById('kpi-card-broken')?.classList.add('active-filter');
      else if (statusVal === 'สูญหาย') document.getElementById('kpi-card-missing')?.classList.add('active-filter');
    }

    function toggleKpiPhotoFilter() {
      if (currentPhotoFilter === '') currentPhotoFilter = 'missing';
      else if (currentPhotoFilter === 'missing') currentPhotoFilter = 'has';
      else currentPhotoFilter = '';

      document.querySelectorAll('.kpi-strip .kpi-card').forEach(c => c.classList.remove('active-filter'));
      if (currentPhotoFilter !== '') {
        document.getElementById('kpi-card-photos')?.classList.add('active-filter');
      } else {
        document.getElementById('kpi-card-all')?.classList.add('active-filter');
      }
      renderGrid();
    }

    function showToast(msg, isError = false) {
      const el = document.getElementById('toast-msg');
      el.textContent = msg;
      el.style.background = isError ? '#dc3545' : '#198754';
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 3000);
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function initManageAuth() {
      const token = localStorage.getItem('polemap_token');
      if (!token) {
        document.getElementById('login-gate').style.display = 'flex';
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.user) {
          currentUser = json.user;
          currentUserDisplayName = json.name || getSafeDisplayName(json.user);
          document.getElementById('current-user-label').textContent = `ผู้ใช้งาน: ${currentUserDisplayName}`;
          document.getElementById('login-gate').style.display = 'none';
          reloadSheetData();
        } else {
          document.getElementById('login-gate').style.display = 'flex';
        }
      } catch (e) {
        document.getElementById('login-gate').style.display = 'flex';
      }
    }

    async function submitManageLogin(e) {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value.trim();
      const errEl = document.getElementById('login-err');
      const btn = document.getElementById('btn-login-submit');

      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'กำลังตรวจสอบ...';

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const json = await res.json();
        if (json.success && json.token) {
          localStorage.setItem('polemap_token', json.token);
          localStorage.setItem('polemap_user', JSON.stringify(json.user));
          currentUser = json.user.username;
          currentUserDisplayName = json.user.name || getSafeDisplayName(json.user.username);
          document.getElementById('current-user-label').textContent = `ผู้ใช้งาน: ${currentUserDisplayName}`;
          document.getElementById('login-gate').style.display = 'none';
          showToast(`ยินดีต้อนรับ ${currentUserDisplayName}`);
          reloadSheetData();
        } else {
          errEl.textContent = json.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์พอร์ต 3406 ได้';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'เข้าสู่ระบบ';
      }
    }

    function logoutManage() {
      localStorage.removeItem('polemap_token');
      localStorage.removeItem('polemap_user');
      currentUser = null;
      document.getElementById('current-user-label').textContent = 'ยังไม่ได้เข้าสู่ระบบ';
      document.getElementById('login-gate').style.display = 'flex';
    }

    async function reloadSheetData() {
      const tbody = document.getElementById('grid-tbody');
      tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 40px; color:#9aa0a6;"><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดข้อมูลทั้ง 378 จุดติดตั้ง...</td></tr>';
      try {
        const res = await fetch(`${API_BASE}/poles`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          allRows = json.data;
          updateManageKpis();
          populateCommunityFilter();
          renderGrid();
          document.getElementById('footer-summary').textContent = `เชื่อมต่อสำเร็จ • ข้อมูลทั้งหมด ${allRows.length} จุดติดตั้ง`;
        } else {
          tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 40px; color:var(--danger);">เกิดข้อผิดพลาด: ${json.error || 'Server Error'}</td></tr>`;
        }
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding: 40px; color:var(--danger);">ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ที่ ${API_BASE} ได้</td></tr>`;
      }
    }

    function populateCommunityFilter() {
      const sel = document.getElementById('sheet-filter-comm');
      const dl = document.getElementById('community-datalist');
      const curVal = sel.value;
      const comms = new Set();
      allRows.forEach(r => { if (r.community) comms.add(r.community); });
      sel.innerHTML = '<option value="">ชุมชน: ทั้งหมด</option>';
      dl.innerHTML = '';
      Array.from(comms).sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);

        const dOpt = document.createElement('option');
        dOpt.value = c;
        dl.appendChild(dOpt);
      });
      sel.value = curVal;
    }

    function renderGrid() {
      const tbody = document.getElementById('grid-tbody');
      const q = document.getElementById('sheet-search').value.toLowerCase().trim();
      const fComm = document.getElementById('sheet-filter-comm').value;
      const fType = document.getElementById('sheet-filter-type').value;
      const fStat = document.getElementById('sheet-filter-stat').value;

      const kpiBaseRows = allRows.filter(r => {
        if (fComm && r.community !== fComm) return false;
        if (fType && (r.device_type || 'ลำโพง') !== fType) return false;
        if (q) {
          const str = `${r.name} ${r.community} ${r.device_type} ${r.location_type} ${r.note} ${r.coordinates} ${r.created_by} ${r.updated_by} ${r.created_by_name || ''} ${r.updated_by_name || ''}`.toLowerCase();
          if (!str.includes(q)) return false;
        }
        return true;
      });

      updateManageKpis(kpiBaseRows);

      const filtered = kpiBaseRows.filter(r => {
        if (fStat && (r.status || 'ใช้งานได้') !== fStat) return false;
        const hasImg = !!(r.image && String(r.image).trim() !== '');
        if (currentPhotoFilter === 'missing' && hasImg) return false;
        if (currentPhotoFilter === 'has' && !hasImg) return false;
        return true;
      });

      document.getElementById('status-counter').textContent = `แสดง ${filtered.length} จาก ${allRows.length} รายการ`;

      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 30px; color:#9aa0a6;">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>';
        return;
      }

      const locOptions = ['เสาไฟ', 'เสาอื่นๆ', 'อาคาร/ห้องควบคุม', 'ศาลาชุมชน', 'อื่นๆ'];

      tbody.innerHTML = filtered.map((r, idx) => {
        const imgSrc = r.image ? (r.image.startsWith('http') ? r.image : (UPLOAD_BASE + r.image.replace(/^\//, ''))) : '';
        const thumbHtml = imgSrc
          ? `<div class="photo-cell-group">
               <img src="${imgSrc}" class="cell-thumb" title="คลิกเพื่อดูรูปขนาดใหญ่" onclick="openPhotoAction('${r.id}', '${imgSrc}')" onerror="this.outerHTML='<div class=\\'cell-thumb-empty\\' title=\\'คลิกเพื่ออัปโหลดรูปภาพ\\' onclick=\\'triggerPhotoUpload(&quot;${r.id}&quot;)\\'><i class=\\'fa-solid fa-camera\\'></i></div>'" />
               <div class="photo-btn-stack">
                 <button type="button" class="btn-photo-mini" onclick="triggerPhotoUpload('${r.id}')" title="อัปโหลดรูปใหม่แทนที่รูปเดิม"><i class="fa-solid fa-upload"></i> แก้รูป</button>
                 <button type="button" class="btn-photo-mini del" onclick="deletePhotoOnly('${r.id}', '${escapeHtml(r.name)}')" title="ลบรูปภาพออกจากจุดนี้"><i class="fa-solid fa-trash-can"></i> ลบรูป</button>
               </div>
             </div>`
          : `<div class="photo-cell-group">
               <div class="cell-thumb-empty" title="ยังไม่มีรูปภาพ คลิกเพื่ออัปโหลด" onclick="triggerPhotoUpload('${r.id}')"><i class="fa-solid fa-camera"></i></div>
               <div class="photo-btn-stack">
                 <button type="button" class="btn-photo-mini" onclick="triggerPhotoUpload('${r.id}')"><i class="fa-solid fa-upload"></i> อัปโหลด</button>
               </div>
             </div>`;

        let curLoc = r.location_type || 'เสาไฟ';
        if (curLoc === 'เสา (Pole)' || curLoc === 'เสาเทศบาล') curLoc = 'เสาไฟ';
        else if (curLoc.includes('อาคาร') || curLoc.includes('ตู้ควบคุม')) curLoc = 'อาคาร/ห้องควบคุม';

        const locSelectHtml = locOptions.map(o => `<option value="${o}" ${curLoc === o ? 'selected' : ''}>${o}</option>`).join('');

        const createdBy = escapeHtml(r.created_by_name || getSafeDisplayName(r.created_by || 'เจ้าหน้าที่'));
        const createdAt = escapeHtml(r.created_at || '-');
        const updatedBy = escapeHtml(r.updated_by ? (r.updated_by_name || getSafeDisplayName(r.updated_by)) : '');
        const updatedAt = escapeHtml(r.updated_at || '');

        const createdHtml = `
          <div class="audit-box">
            <span class="audit-user"><i class="fa-solid fa-user-plus" style="font-size:10px; color:#198754;"></i> ${createdBy}</span>
            <span class="audit-time">${createdAt}</span>
          </div>
        `;

        const updatedHtml = updatedBy
          ? `<div class="audit-box">
               <span class="audit-user edited"><i class="fa-solid fa-pen" style="font-size:10px;"></i> ${updatedBy}</span>
               <span class="audit-time">${updatedAt}</span>
             </div>`
          : `<div class="audit-box" style="color:#cbd5e1;">- ยังไม่เคยแก้ไข -</div>`;

        return `
          <tr id="row-${r.id}">
            <td class="col-idx">${idx + 1}</td>
            <td>${thumbHtml}</td>
            <td>
              <select class="cell-select" id="type-${r.id}">
                <option value="ลำโพง" ${r.device_type === 'ลำโพง' ? 'selected' : ''}>ลำโพง</option>
                <option value="ลำโพงไร้สาย" ${r.device_type === 'ลำโพงไร้สาย' ? 'selected' : ''}>ลำโพงไร้สาย</option>
                <option value="กล้องวงจรปิด" ${r.device_type === 'กล้องวงจรปิด' ? 'selected' : ''}>กล้องวงจรปิด</option>
                <option value="เครื่องขยายเสียง" ${r.device_type === 'เครื่องขยายเสียง' ? 'selected' : ''}>เครื่องขยายเสียง</option>
                <option value="เซิฟเวอร์วงจรปิด" ${r.device_type === 'เซิฟเวอร์วงจรปิด' ? 'selected' : ''}>เซิฟเวอร์วงจรปิด</option>
              </select>
            </td>
            <td><input type="text" class="cell-input" id="name-${r.id}" value="${escapeHtml(r.name)}" /></td>
            <td><input type="text" class="cell-input" id="comm-${r.id}" list="community-datalist" value="${escapeHtml(r.community)}" /></td>
            <td>
              <select class="cell-select" id="loc-${r.id}">
                ${locSelectHtml}
              </select>
            </td>
            <td>
              <select class="cell-select" id="stat-${r.id}">
                <option value="ใช้งานได้" ${r.status === 'ใช้งานได้' ? 'selected' : ''}>ใช้งานได้</option>
                <option value="ชำรุด" ${r.status === 'ชำรุด' ? 'selected' : ''}>ชำรุด</option>
                <option value="สูญหาย" ${r.status === 'สูญหาย' ? 'selected' : ''}>สูญหาย</option>
              </select>
            </td>
            <td><input type="text" class="cell-input" style="font-family:monospace; font-size:12px;" id="coords-${r.id}" value="${escapeHtml(r.coordinates || '')}" /></td>
            <td><input type="text" class="cell-input" id="note-${r.id}" value="${escapeHtml(r.note || '')}" placeholder="-" /></td>
            <td id="created-cell-${r.id}">${createdHtml}</td>
            <td id="updated-cell-${r.id}">${updatedHtml}</td>
            <td style="text-align:center;">
              <button class="btn-row-save" onclick="saveRow('${r.id}')" title="บันทึกการแก้ไขแถวนี้"><i class="fa-solid fa-floppy-disk"></i></button>
              <button class="btn-row-del" onclick="deleteRow('${r.id}', '${escapeHtml(r.name)}')" title="ลบจุดติดตั้งนี้"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      }).join('');
    }

    async function saveRow(id) {
      if (!currentUser) {
        document.getElementById('login-gate').style.display = 'flex';
        return;
      }
      const name = document.getElementById(`name-${id}`).value.trim();
      const community = document.getElementById(`comm-${id}`).value.trim();
      const device_type = document.getElementById(`type-${id}`).value;
      const location_type = document.getElementById(`loc-${id}`).value;
      const status = document.getElementById(`stat-${id}`).value;
      const coordinates = document.getElementById(`coords-${id}`).value.trim();
      const note = document.getElementById(`note-${id}`).value.trim();

      if (!name || !coordinates) {
        showToast('กรุณากรอกชื่อจุดติดตั้งและพิกัด GPS', true);
        return;
      }

      const token = localStorage.getItem('polemap_token') || '';
      try {
        const res = await fetch(`${API_BASE}/poles/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name,
            community,
            device_type,
            location_type,
            status,
            coordinates,
            note,
            updated_by: currentUser
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const idx = allRows.findIndex(r => r.id === id);
          if (idx !== -1) allRows[idx] = json.data;
          updateManageKpis();
          const uCell = document.getElementById(`updated-cell-${id}`);
          const safeEditor = json.data.updated_by_name || getSafeDisplayName(json.data.updated_by);
          if (uCell) {
            uCell.innerHTML = `
              <div class="audit-box">
                <span class="audit-user edited"><i class="fa-solid fa-pen" style="font-size:10px;"></i> ${escapeHtml(safeEditor)}</span>
                <span class="audit-time">${escapeHtml(json.data.updated_at)}</span>
              </div>
            `;
          }
          showToast(`บันทึก "${name}" สำเร็จ (แก้ไขโดย ${safeEditor})`);
        } else {
          showToast(json.error || 'บันทึกไม่สำเร็จ', true);
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', true);
      }
    }

    async function deletePhotoOnly(id, name) {
      if (!currentUser) {
        document.getElementById('login-gate').style.display = 'flex';
        return;
      }
      if (!confirm(`ยืนยันการลบรูปภาพของจุด "${name}" ?\n(ไฟล์รูปภาพจะถูกลบออกจากดิสก์ทันที แต่ข้อมูลพิกัดและชื่อเสายังคงอยู่)`)) return;

      const token = localStorage.getItem('polemap_token') || '';
      try {
        const res = await fetch(`${API_BASE}/poles/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            image: '',
            removeImage: true,
            updated_by: currentUser
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const idx = allRows.findIndex(r => r.id === id);
          if (idx !== -1) allRows[idx] = json.data;
          updateManageKpis();
          renderGrid();
          showToast(`ลบรูปภาพของ "${name}" เรียบร้อยแล้ว`);
        } else {
          showToast(json.error || 'ลบรูปภาพไม่สำเร็จ', true);
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการลบรูปภาพ', true);
      }
    }

    async function deleteCurrentModalPhoto() {
      if (!currentModalRowId) return;
      const targetId = currentModalRowId;
      const rowObj = allRows.find(r => r.id === targetId);
      closeImageModal();
      await deletePhotoOnly(targetId, rowObj ? rowObj.name : targetId);
    }

    async function deleteRow(id, name) {
      if (!currentUser) {
        document.getElementById('login-gate').style.display = 'flex';
        return;
      }
      if (!confirm(`ยืนยันการลบจุดติดตั้ง "${name}" ทั้งแถว?\n(ข้อมูลและไฟล์รูปภาพของจุดนี้จะถูกลบออกจากดิสก์ทันที)`)) return;

      const token = localStorage.getItem('polemap_token') || '';
      try {
        const res = await fetch(`${API_BASE}/poles/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success) {
          allRows = allRows.filter(r => r.id !== id);
          updateManageKpis();
          renderGrid();
          showToast(`ลบ "${name}" เรียบร้อยแล้ว`);
        } else {
          showToast(json.error || 'ลบไม่สำเร็จ', true);
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการลบ', true);
      }
    }

    function openPhotoAction(id, imgSrc) {
      currentModalRowId = id;
      document.getElementById('zoom-img').src = imgSrc;
      document.getElementById('img-modal').style.display = 'flex';
    }

    function closeImageModal() {
      document.getElementById('img-modal').style.display = 'none';
      document.getElementById('zoom-img').src = '';
      currentModalRowId = null;
    }

    function replaceCurrentModalPhoto() {
      if (!currentModalRowId) return;
      const targetId = currentModalRowId;
      closeImageModal();
      triggerPhotoUpload(targetId);
    }

    function triggerPhotoUpload(id) {
      activeUploadRowId = id;
      const input = document.getElementById('cell-photo-input');
      input.value = '';
      input.click();
    }

    function compressImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const MAX_SIZE = 1024;
            let w = img.width;
            let h = img.height;
            if (w > h && w > MAX_SIZE) {
              h = Math.round((h * MAX_SIZE) / w);
              w = MAX_SIZE;
            } else if (h > MAX_SIZE) {
              w = Math.round((w * MAX_SIZE) / h);
              h = MAX_SIZE;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.70));
          };
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    async function handleCellPhotoUpload(event) {
      const file = event.target.files[0];
      if (!file || !activeUploadRowId) return;
      const id = activeUploadRowId;
      const token = localStorage.getItem('polemap_token') || '';

      try {
        showToast('กำลังย่อขนาดภาพและอัปโหลด...');
        const base64 = await compressImageFile(file);
        const res = await fetch(`${API_BASE}/poles/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            image: base64,
            updated_by: currentUser || 'admin'
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          const idx = allRows.findIndex(r => r.id === id);
          if (idx !== -1) allRows[idx] = json.data;
          updateManageKpis();
          renderGrid();
          showToast('เปลี่ยนรูปภาพและลบไฟล์ภาพเก่าเรียบร้อยแล้ว');
        } else {
          showToast(json.error || 'อัปโหลดรูปไม่สำเร็จ', true);
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการย่อและอัปโหลดรูปภาพ', true);
      }
    }

    function openAddRowModal() {
      if (!currentUser) {
        document.getElementById('login-gate').style.display = 'flex';
        return;
      }
      newRowBase64Image = '';
      document.getElementById('new-name').value = '';
      document.getElementById('new-coords').value = '';
      document.getElementById('new-note').value = '';
      document.getElementById('new-photo-file').value = '';
      document.getElementById('new-photo-preview').textContent = '';
      document.getElementById('add-modal').style.display = 'flex';
    }

    async function handleNewModalPhoto(e) {
      const file = e.target.files[0];
      if (!file) return;
      newRowBase64Image = await compressImageFile(file);
      document.getElementById('new-photo-preview').textContent = 'ย่อขนาดภาพพร้อมบันทึกแล้ว (1024px JPEG)';
    }

    function fetchCurrentGps() {
      if (!navigator.geolocation) {
        showToast('เบราว์เซอร์ไม่รองรับ GPS', true);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('new-coords').value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
          showToast('ดึงพิกัด GPS สำเร็จ');
        },
        () => showToast('ไม่สามารถดึงพิกัดได้', true),
        { enableHighAccuracy: true }
      );
    }

    async function submitNewRow() {
      const name = document.getElementById('new-name').value.trim();
      const community = document.getElementById('new-community').value.trim() || 'ไม่ระบุชุมชน';
      const device_type = document.getElementById('new-type').value;
      const location_type = document.getElementById('new-loc').value;
      const status = document.getElementById('new-status').value;
      const coordinates = document.getElementById('new-coords').value.trim();
      const note = document.getElementById('new-note').value.trim();

      if (!name || !coordinates) {
        showToast('กรุณากรอกชื่อจุดติดตั้งและพิกัด GPS', true);
        return;
      }

      const token = localStorage.getItem('polemap_token') || '';
      try {
        const res = await fetch(`${API_BASE}/poles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name,
            community,
            device_type,
            location_type,
            status,
            coordinates,
            note,
            image: newRowBase64Image,
            created_by: currentUser || 'admin'
          })
        });
        const json = await res.json();
        if (json.success && json.data) {
          allRows.unshift(json.data);
          updateManageKpis();
          populateCommunityFilter();
          renderGrid();
          document.getElementById('add-modal').style.display = 'none';
          const safeCreator = json.data.created_by_name || getSafeDisplayName(json.data.created_by);
          showToast(`เพิ่มจุดติดตั้ง "${name}" สำเร็จ (ผู้ลงข้อมูล: ${safeCreator})`);
        } else {
          showToast(json.error || 'เพิ่มข้อมูลไม่สำเร็จ', true);
        }
      } catch (err) {
        showToast('เกิดข้อผิดพลาดในการบันทึก', true);
      }
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeImageModal();
        document.getElementById('add-modal').style.display = 'none';
      }
    });

    window.addEventListener('DOMContentLoaded', initManageAuth);
