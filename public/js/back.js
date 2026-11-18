const isFileProtocol = window.location.protocol === 'file:';
    const API_BASE = isFileProtocol
      ? 'http://127.0.0.1:3406/polemap/api'
      : (window.location.pathname.startsWith('/polemap') ? '/polemap/api' : '/api');

    if (isFileProtocol) {
      document.getElementById('linkMap').href = 'index.html';
      document.getElementById('linkManage').href = 'manage.html';
    }

    // Default accounts (Row #1 is Locked Superadmin; Survey counts match Excel 100%: dump=220, horn=84, phachara=74, admin=0 survey / 4 edits)
    const FALLBACK_USERS = [
      {
        id: 1,
        username: 'superadmin',
        name: 'ผู้ดูแลระบบสูงสุด (Master Key)',
        role: 'superadmin',
        is_master: true,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 0,
        edit_count: 0,
        last_survey_at: '-'
      },
      {
        id: 2,
        username: 'admin',
        name: 'ผู้ดูแลระบบ',
        role: 'admin',
        is_master: false,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 0,
        edit_count: 4,
        last_survey_at: '-'
      },
      {
        id: 3,
        username: 'horn',
        name: 'เอ',
        role: 'staff',
        is_master: false,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 84,
        edit_count: 0,
        last_survey_at: '17/02/2569 15:44:53'
      },
      {
        id: 4,
        username: 'monitor_msi',
        name: 'เอ๋',
        role: 'staff',
        is_master: false,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 0,
        edit_count: 0,
        last_survey_at: '-'
      },
      {
        id: 5,
        username: 'phachara',
        name: 'เซ็ต',
        role: 'staff',
        is_master: false,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 74,
        edit_count: 0,
        last_survey_at: '30/03/2569 14:16:11'
      },
      {
        id: 6,
        username: 'dump',
        name: 'ดั้ม',
        role: 'staff',
        is_master: false,
        is_active: 1,
        created_at: '17/02/2569 09:00:00',
        last_login: '-',
        survey_count: 220,
        edit_count: 0,
        last_survey_at: '10/11/2569 13:27:28'
      }
    ];

    let allUsers = [...FALLBACK_USERS];
    let secAllLogs = [];
    let secCurrentFilter = 'ALL';
    let secTimer = null;

    function showToast(msg, type = 'info') {
      const wrap = document.getElementById('toastWrap');
      const el = document.createElement('div');
      el.className = 'toast-msg';
      const color = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#3b82f6');
      el.style.borderLeftColor = color;
      el.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info')}" style="color:${color};"></i> <span>${escapeHtml(msg)}</span>`;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    function escapeHtml(str) {
      return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function getAuthHeaders() {
      const token = sessionStorage.getItem('polemap_back_token') || localStorage.getItem('polemap_token') || '';
      return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      };
    }

    // ---------------- AUTHENTICATION GATE (DEC-027 & DEC-028) ----------------
    async function handleSuperLogin(e) {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value.trim();
      const errEl = document.getElementById('loginError');
      const btn = document.getElementById('btnSubmitLogin');
      errEl.style.display = 'none';
      btn.disabled = true;

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, gate: 'back' })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
        const role = String(data.user?.role || '').toLowerCase();
        if (role !== 'superadmin' && role !== 'super admin' && !data.user?.is_master) {
          throw new Error('ระดับ Admin ไม่มีสิทธิ์เข้าถึงห้องความปลอดภัยหลังบ้าน (เฉพาะผู้ถือ Master Key เท่านั้น)');
        }
        sessionStorage.setItem('polemap_back_token', data.token);
        sessionStorage.setItem('polemap_back_user', JSON.stringify(data.user));
        unlockCockpit(data.user);
        showToast(`เข้าสู่ระบบสำเร็จ: ${data.user.name}`, 'success');
      } catch (err) {
        errEl.textContent = err.message || 'ไม่สามารถเข้าสู่ระบบได้';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    }

    function unlockCockpit(user) {
      document.getElementById('authGate').classList.add('hidden');
      document.getElementById('activeAdminName').textContent = `${user.name || user.username} (${(user.role || 'admin').toUpperCase()})`;
      loadUsers();
      loadSecurityLogs();
    }

    function logoutSuperAdmin() {
      sessionStorage.removeItem('polemap_back_token');
      sessionStorage.removeItem('polemap_back_user');
      document.getElementById('loginPass').value = '';
      document.getElementById('authGate').classList.remove('hidden');
      if (secTimer) clearInterval(secTimer);
    }

    // ---------------- TABS ----------------
    function switchTab(tab) {
      document.getElementById('tabBtnUsers').className = 'tab-btn' + (tab === 'users' ? ' active' : '');
      document.getElementById('tabBtnSecurity').className = 'tab-btn' + (tab === 'security' ? ' active-radar' : '');
      document.getElementById('paneUsers').className = 'tab-pane' + (tab === 'users' ? ' active' : '');
      document.getElementById('paneSecurity').className = 'tab-pane' + (tab === 'security' ? ' active' : '');

      if (tab === 'security') {
        loadSecurityLogs();
        if (!secTimer) secTimer = setInterval(loadSecurityLogs, 5000);
      } else {
        if (secTimer) { clearInterval(secTimer); secTimer = null; }
        loadUsers();
      }
    }

    // ---------------- USER MANAGEMENT ----------------
    let currentUsersMeta = null;

    function onDeviceTypeFilterChange() {
      loadUsers();
    }

    async function loadUsers() {
      const filterEl = document.getElementById('deviceTypeFilter');
      const deviceType = filterEl ? filterEl.value : '';
      const qs = deviceType ? `?device_type=${encodeURIComponent(deviceType)}` : '';
      try {
        const res = await fetch(`${API_BASE}/superadmin/users${qs}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.users || data.data)) {
          allUsers = data.users || data.data;
          currentUsersMeta = data.meta || null;
        }
      } catch (err) {
        console.warn('Using preloaded users fallback:', err.message);
      }
      updateUserKpis(deviceType);
      renderUsersTable();
    }

    function updateUserKpis(deviceType = '') {
      const scopeText = deviceType ? `เฉพาะ: ${deviceType}` : 'ทุกประเภทอุปกรณ์';
      const scopeTag = deviceType ? deviceType : 'ทุกประเภท';
      const badgeEl = document.getElementById('kpiScopeBadge');
      if (badgeEl) {
        badgeEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> กำลังแสดง: ${escapeHtml(scopeText)}`;
      }
      const readinessLabelEl = document.getElementById('kpiReadinessLabel');
      if (readinessLabelEl) readinessLabelEl.textContent = `อัตราความพร้อมใช้งาน (${scopeTag})`;
      const polesLabelEl = document.getElementById('kpiPolesLabel');
      if (polesLabelEl) polesLabelEl.textContent = deviceType ? `จุดติดตั้ง (${deviceType})` : 'จุดติดตั้งในระบบ (ทุกประเภท)';
      const topCommLabelEl = document.getElementById('kpiTopCommLabel');
      if (topCommLabelEl) topCommLabelEl.textContent = `ชุมชนที่ติดตั้งสูงสุด (${scopeTag})`;
      const statusLabelEl = document.getElementById('kpiStatusLabel');
      if (statusLabelEl) statusLabelEl.textContent = `สถานะ & ตำแหน่งติดตั้ง (${scopeTag})`;

      if (currentUsersMeta) {
        const total = currentUsersMeta.total_poles ?? 0;
        const bs = currentUsersMeta.by_status || {};
        const okCount = bs['ใช้งานได้'] || 0;
        const brokenCount = bs['ชำรุด'] || 0;
        const missingCount = bs['สูญหาย'] || 0;
        const totalEdits = currentUsersMeta.total_edits || 0;
        const withPhoto = currentUsersMeta.with_photo_count || 0;

        // Card 1: Readiness %
        const pct = total > 0 ? Math.round((okCount / total) * 1000) / 10 : 0;
        const rValEl = document.getElementById('kpiReadinessVal');
        const rSubEl = document.getElementById('kpiReadinessSub');
        if (rValEl) {
          rValEl.textContent = total > 0 ? `${pct}%` : 'ไม่มีข้อมูล';
          rValEl.style.color = pct >= 90 ? '#60a5fa' : (pct >= 70 ? '#fbbf24' : '#f87171');
        }
        if (rSubEl) {
          rSubEl.textContent = `พร้อมใช้ ${okCount} จาก ${total} จุด • มีรูปภาพ ${withPhoto} จุด`;
        }

        // Card 2: Total Poles
        document.getElementById('kpiTotalPoles').textContent = total;
        const polesSubEl = document.getElementById('kpiPolesSub');
        if (polesSubEl) {
          if (!deviceType && currentUsersMeta.by_type) {
            const breakdown = Object.entries(currentUsersMeta.by_type)
              .map(([k, v]) => `${k} ${v}`)
              .join(' • ');
            polesSubEl.textContent = `${currentUsersMeta.communities_count || 0} ชุมชน (${breakdown || 'ไม่มีข้อมูล'})`;
          } else {
            polesSubEl.textContent = `${currentUsersMeta.communities_count || 0} ชุมชนในเขตเทศบาลตำบลแม่สาย`;
          }
        }

        // Card 3: Top Communities
        const topComms = currentUsersMeta.top_communities || [];
        const tcValEl = document.getElementById('kpiTopCommVal');
        const tcSubEl = document.getElementById('kpiTopCommSub');
        if (tcValEl) {
          tcValEl.textContent = topComms[0] ? `${topComms[0].name} (${topComms[0].count} จุด)` : 'ไม่มีข้อมูล (0 จุด)';
        }
        if (tcSubEl) {
          tcSubEl.textContent = topComms.length > 1
            ? topComms.slice(1).map(c => `${c.name} (${c.count})`).join(' • ')
            : (topComms.length === 1 ? 'มีข้อมูล 1 ชุมชนในหมวดนี้' : `ยังไม่มีการติดตั้งประเภท "${scopeTag}"`);
        }

        // Card 4: Status & Location Breakdown
        const locEntries = Object.entries(currentUsersMeta.by_location || {})
          .map(([k, v]) => `${k} ${v}`)
          .join(' • ');
        const statusValEl = document.getElementById('kpiStatusValue');
        const statusSubEl = document.getElementById('kpiStatusSub');
        if (statusValEl) {
          statusValEl.textContent = `ใช้งานได้ ${okCount} จุด`;
          statusValEl.style.color = (brokenCount > 0 || missingCount > 0) ? '#fbbf24' : '#34d399';
        }
        if (statusSubEl) {
          statusSubEl.textContent = `ชำรุด ${brokenCount} • สูญหาย ${missingCount} • ${locEntries || 'ไม่มีจุดติดตั้ง'} • แก้ไข ${totalEdits} ครั้ง`;
        }
      }
    }

    function renderUsersTable() {
      const tbody = document.getElementById('usersTableBody');
      const q = (document.getElementById('userSearchInput').value || '').trim().toLowerCase();

      const filtered = allUsers.filter(u => {
        if (!q) return true;
        return (
          String(u.username || '').toLowerCase().includes(q) ||
          String(u.name || u.full_name || '').toLowerCase().includes(q) ||
          String(u.role || '').toLowerCase().includes(q)
        );
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:36px; color:var(--text-muted);">ไม่พบบัญชีผู้ใช้งานที่ค้นหา</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((u, idx) => {
        const role = String(u.role || 'staff').toLowerCase();
        const roleClass = role === 'superadmin' ? 'role-superadmin' : (role === 'admin' ? 'role-admin' : 'role-staff');
        const roleLabel = role === 'superadmin' ? 'SUPERADMIN' : (role === 'admin' ? 'ADMIN' : 'STAFF');
        const isActive = u.is_active !== 0 && u.is_active !== false;
        const surveyCount = u.survey_count || 0;
        const editCount = u.edit_count || 0;
        const isMaster = Boolean(u.is_master || role === 'superadmin' || u.id === 1);

        return `
          <tr style="${isMaster ? 'background: rgba(245, 158, 11, 0.04);' : ''}">
            <td class="mono" style="color:var(--text-muted);">${idx + 1}</td>
            <td>
              <div class="mono" style="font-weight:700; color:${isMaster ? '#fcd34d' : '#fff'}; font-size:14.5px;">
                ${isMaster ? '<i class="fa-solid fa-crown" style="color:#f59e0b; margin-right:6px;"></i>' : ''}${escapeHtml(u.username)}
              </div>
            </td>
            <td>
              <div style="font-weight:600; color:#f1f5f9;">${escapeHtml(u.name || u.full_name || u.username)}</div>
            </td>
            <td>
              <span class="role-badge ${roleClass}">${roleLabel}</span>
            </td>
            <td>
              ${surveyCount > 0 ? `
                <span class="credit-badge">
                  <i class="fa-solid fa-location-dot"></i> สำรวจ ${surveyCount} จุด
                </span>
              ` : `
                <span style="color:var(--text-muted); font-size:13px;">ไม่ได้ลงสำรวจ (0 จุด)</span>
              `}
            </td>
            <td>
              <span style="font-family:'Kanit',sans-serif; font-weight:600; color:${editCount > 0 ? '#fcd34d' : 'var(--text-muted)'};">
                ${editCount > 0 ? `แก้ไข ${editCount} ครั้ง` : 'ยังไม่เคยแก้ไข'}
              </span>
            </td>
            <td class="mono" style="font-size:12.5px; color:var(--text-sub);">
              ${escapeHtml(u.last_login !== '-' ? u.last_login : (u.last_survey_at || '-'))}
            </td>
            <td>
              <span class="status-pill ${isActive ? 'status-active' : 'status-disabled'}">
                <i class="fa-solid ${isActive ? 'fa-circle-check' : 'fa-circle-xmark'}"></i>
                ${isActive ? 'พร้อมใช้งาน' : 'ระงับชั่วคราว'}
              </span>
            </td>
            <td style="text-align:right;">
              ${isMaster ? `
                <span class="locked-master-pill" title="บัญชีรากฐานของระบบ ล็อกถาวรเพื่อความปลอดภัยสูงสุด">
                  <i class="fa-solid fa-lock"></i> บัญชีระบบ Master Key (ล็อกถาวร)
                </span>
              ` : `
                <div class="action-group" style="justify-content:flex-end;">
                  <button class="btn btn-primary btn-sm" onclick="openEditUserModal('${escapeHtml(u.username)}')" title="แก้ไขไอดี / ชื่อผู้ใช้งาน / สิทธิ์ / สถานะ">
                    <i class="fa-solid fa-user-pen"></i> แก้ไขไอดี/ชื่อ
                  </button>
                  <button class="btn btn-warning btn-sm" onclick="openPasswordModal('${escapeHtml(u.username)}')" title="เปลี่ยนรหัสผ่าน">
                    <i class="fa-solid fa-key"></i> รหัสผ่าน
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="confirmDeleteUser('${escapeHtml(u.username)}')" title="ลบบัญชีผู้ใช้งาน">
                    <i class="fa-solid fa-trash-can"></i> ลบ
                  </button>
                </div>
              `}
            </td>
          </tr>
        `;
      }).join('');
    }

    // ---------------- MODALS: ADD / EDIT / PASSWORD / DELETE ----------------
    function openModal(id) {
      document.getElementById(id).classList.add('show');
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove('show');
    }

    function openAddUserModal() {
      document.getElementById('addUsername').value = '';
      document.getElementById('addFullName').value = '';
      document.getElementById('addPassword').value = '';
      document.getElementById('addRole').value = 'staff';
      openModal('modalAddUser');
    }

    async function submitAddUser(e) {
      e.preventDefault();
      const username = document.getElementById('addUsername').value.trim().toLowerCase();
      const name = document.getElementById('addFullName').value.trim();
      const password = document.getElementById('addPassword').value.trim();
      const role = document.getElementById('addRole').value;

      try {
        const res = await fetch(`${API_BASE}/superadmin/users`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ username, name, password, role, is_active: 1 })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'ไม่สามารถเพิ่มผู้ใช้งานได้');

        closeModal('modalAddUser');
        showToast(`เพิ่มไอดี ${username} (${name}) เรียบร้อยแล้ว`, 'success');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function openEditUserModal(username) {
      const u = allUsers.find(item => item.username.toLowerCase() === username.toLowerCase());
      if (!u) return;

      document.getElementById('editOriginalId').value = u.username;
      document.getElementById('editUsername').value = u.username;
      document.getElementById('editUsername').disabled = Boolean(u.is_master);
      document.getElementById('editFullName').value = u.name || u.full_name || '';
      document.getElementById('editRole').value = (u.role || 'staff').toLowerCase();
      document.getElementById('editActive').value = (u.is_active !== 0 && u.is_active !== false) ? '1' : '0';
      document.getElementById('editOptionalPass').value = '';
      openModal('modalEditUser');
    }

    async function submitEditUser(e) {
      e.preventDefault();
      const origId = document.getElementById('editOriginalId').value;
      const username = document.getElementById('editUsername').value.trim().toLowerCase();
      const name = document.getElementById('editFullName').value.trim();
      const role = document.getElementById('editRole').value;
      const is_active = document.getElementById('editActive').value === '1' ? 1 : 0;
      const password = document.getElementById('editOptionalPass').value.trim();

      try {
        const payload = { username, name, role, is_active };
        if (password) payload.password = password;

        const res = await fetch(`${API_BASE}/superadmin/users/${encodeURIComponent(origId)}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'แก้ไขข้อมูลไม่สำเร็จ');

        closeModal('modalEditUser');
        showToast(`บันทึกการแก้ไขไอดี ${username} เรียบร้อยแล้ว`, 'success');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function openPasswordModal(username) {
      document.getElementById('pwdUserId').value = username;
      document.getElementById('pwdUsernameDisplay').textContent = username;
      document.getElementById('newPasswordInput').value = '';
      document.getElementById('confirmPasswordInput').value = '';
      openModal('modalChangePassword');
    }

    async function submitChangePassword(e) {
      e.preventDefault();
      const userId = document.getElementById('pwdUserId').value;
      const newPass = document.getElementById('newPasswordInput').value.trim();
      const confirmPass = document.getElementById('confirmPasswordInput').value.trim();

      if (newPass !== confirmPass) {
        return showToast('รหัสผ่านทั้งสองช่องไม่ตรงกัน', 'error');
      }

      try {
        const res = await fetch(`${API_BASE}/superadmin/users/${encodeURIComponent(userId)}/password`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ new_password: newPass })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');

        closeModal('modalChangePassword');
        showToast(`เปลี่ยนรหัสผ่านของไอดี ${userId} สำเร็จแล้ว`, 'success');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    async function confirmDeleteUser(username) {
      const targetUser = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
      if (targetUser && targetUser.is_master) {
        return showToast('ไม่สามารถลบบัญชีผู้ดูแลระบบสูงสุดได้', 'error');
      }
      if (!confirm(`ยืนยันการลบบัญชีไอดี "${username}" ออกจากระบบหรือไม่?`)) return;

      try {
        const res = await fetch(`${API_BASE}/superadmin/users/${encodeURIComponent(username)}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'ลบผู้ใช้งานไม่สำเร็จ');

        showToast(`ลบไอดี ${username} เรียบร้อยแล้ว`, 'success');
        await loadUsers();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    // ---------------- SECURITY RADAR (DEC-026) ----------------
    async function loadSecurityLogs() {
      try {
        const res = await fetch(`${API_BASE}/security/logs`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          secAllLogs = data.logs || [];
          renderBannedIps(data.banned_ips || []);
          updateSecStats();
          renderSecurityTable();
        }
      } catch (err) {
        console.warn('Security logs fetch warning:', err.message);
      }
    }

    function updateSecStats() {
      const total = secAllLogs.length;
      let info = 0, warn = 0, crit = 0;
      secAllLogs.forEach(l => {
        if (l.threat === 'CRITICAL') crit++;
        else if (l.threat === 'WARN') warn++;
        else info++;
      });
      document.getElementById('secStatTotal').textContent = total.toLocaleString();
      document.getElementById('secStatInfo').textContent = info.toLocaleString();
      document.getElementById('secStatWarn').textContent = warn.toLocaleString();
      document.getElementById('secStatCrit').textContent = crit.toLocaleString();
    }

    function renderBannedIps(bannedList) {
      const box = document.getElementById('secBannedBox');
      const listEl = document.getElementById('secBannedList');
      if (!bannedList || bannedList.length === 0) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      listEl.innerHTML = bannedList.map(b => `
        <div style="background:rgba(15,23,42,0.85); border:1px solid rgba(239,68,68,0.45); padding:6px 12px; border-radius:8px; display:inline-flex; align-items:center; gap:10px; font-size:12.5px;">
          <span class="mono" style="color:#fca5a5; font-weight:700;">${escapeHtml(b.ip)}</span>
          <span style="color:var(--text-muted);">พยายามผิด ${b.attempts} ครั้ง (เหลือ ${b.remaining_minutes} นาที)</span>
          <button class="btn btn-outline btn-sm" style="padding:2px 8px; font-size:11px;" onclick="unbanIp('${escapeHtml(b.ip)}')">ปลดแบน</button>
        </div>
      `).join('');
    }

    async function unbanIp(ip) {
      try {
        await fetch(`${API_BASE}/security/unban-ip`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ip })
        });
        showToast(`ปลดแบน IP ${ip || 'ทั้งหมด'} เรียบร้อยแล้ว`, 'success');
        loadSecurityLogs();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function setSecFilter(level) {
      secCurrentFilter = level;
      document.querySelectorAll('.sec-filter-btn').forEach(btn => {
        btn.style.background = '';
        btn.style.color = '';
        btn.className = 'btn btn-outline btn-sm sec-filter-btn';
      });
      const activeBtn = document.getElementById(`secFilter-${level}`);
      if (activeBtn) {
        activeBtn.style.background = level === 'CRITICAL' ? '#ef4444' : (level === 'WARN' ? '#f59e0b' : (level === 'INFO' ? '#10b981' : '#3b82f6'));
        activeBtn.style.color = '#fff';
      }
      renderSecurityTable();
    }

    function renderSecurityTable() {
      const tbody = document.getElementById('secLogsBody');
      const q = (document.getElementById('secSearchInput').value || '').trim().toLowerCase();

      const filtered = secAllLogs.filter(l => {
        if (secCurrentFilter !== 'ALL' && l.threat !== secCurrentFilter) return false;
        if (q) {
          const hay = `${l.ip} ${l.path} ${l.reason} ${l.ua} ${l.method}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }).slice().reverse();

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:36px; color:var(--text-muted);">ไม่พบรายการบันทึกเหตุการณ์</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.slice(0, 150).map(l => {
        const tColor = l.threat === 'CRITICAL' ? '#ef4444' : (l.threat === 'WARN' ? '#f59e0b' : '#10b981');
        const tBg = l.threat === 'CRITICAL' ? 'rgba(239,68,68,0.16)' : (l.threat === 'WARN' ? 'rgba(245,158,11,0.16)' : 'rgba(16,185,129,0.14)');
        const sColor = l.status >= 400 ? '#fca5a5' : '#34d399';

        return `
          <tr>
            <td class="mono" style="font-size:12px; color:var(--text-sub); white-space:nowrap;">${escapeHtml(l.timestamp)}</td>
            <td>
              <span style="padding:3px 9px; border-radius:6px; font-size:11px; font-weight:700; background:${tBg}; color:${tColor}; border:1px solid ${tColor}44;">
                ${escapeHtml(l.threat)}
              </span>
            </td>
            <td class="mono" style="font-weight:600; color:#e2e8f0;">${escapeHtml(l.ip)}</td>
            <td class="mono" style="font-size:12px; color:#93c5fd;">${escapeHtml(l.method)}</td>
            <td class="mono" style="font-size:12px; color:#cbd5e1; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(l.path)}">${escapeHtml(l.path)}</td>
            <td class="mono" style="font-size:12px; color:${sColor}; font-weight:700;">${escapeHtml(l.status)} <span style="color:var(--text-muted); font-weight:400;">(${l.duration || 1}ms)</span></td>
            <td style="font-size:13px; color:#f1f5f9;">${escapeHtml(l.reason)}</td>
            <td style="font-size:11.5px; color:var(--text-muted); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(l.ua)}">${escapeHtml(l.ua)}</td>
          </tr>
        `;
      }).join('');
    }

    async function clearSecurityLogs() {
      if (!confirm('ยืนยันการล้างประวัติ Security Audit Logs ทั้งหมดหรือไม่?')) return;
      try {
        await fetch(`${API_BASE}/security/logs`, { method: 'DELETE', headers: getAuthHeaders() });
        showToast('ล้างประวัติ Security Logs เรียบร้อยแล้ว', 'success');
        loadSecurityLogs();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    function exportSecurityLogs() {
      const blob = new Blob([JSON.stringify(secAllLogs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `polemap_security_logs_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // Auto-unlock if already authenticated in sessionStorage, or pre-render table immediately
    window.addEventListener('DOMContentLoaded', () => {
      renderUsersTable();
      updateUserKpis();
      const savedUser = sessionStorage.getItem('polemap_back_user');
      if (savedUser) {
        try {
          unlockCockpit(JSON.parse(savedUser));
        } catch (_) {}
      }
    });
