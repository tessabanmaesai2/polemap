// === Script Section 1 ===
/**
 * ------------------------------------------------------------------
 * MAESAI REST API BRIDGE FOR POLE MAP
 * Maps original google.script.run proxies to Express REST API
 * Supports both http://127.0.0.1:3406 and file:/// local inspection
 * ------------------------------------------------------------------
 */
(function() {
    const isFile = window.location.protocol === 'file:';
    const API_BASE = isFile ? 'http://127.0.0.1:3406/polemap/api' : (window.location.pathname.startsWith('/polemap') ? '/polemap/api' : '/api');
    const UPLOAD_BASE = isFile ? 'http://127.0.0.1:3406/polemap/' : (window.location.pathname.startsWith('/polemap') ? '/polemap/' : '/');

    window.google = window.google || {};
    window.google.script = window.google.script || {};
    
    function createRunProxy(successHandler, failureHandler) {
        return {
            getSpeakerData_Proxy: async function() {
                try {
                    const res = await fetch(API_BASE + '/poles');
                    const json = await res.json();
                    if (json.success && Array.isArray(json.data)) {
                        const data = json.data.map(item => {
                            const copy = Object.assign({}, item);
                            copy.ID = item.id;
                            copy.id = item.id;
                            copy.Community = item.community;
                            copy.community = item.community;
                            copy.Name = item.name;
                            copy.name = item.name;
                            copy.Note = item.note;
                            copy.note = item.note;
                            copy.Status = item.status;
                            copy.status = item.status;
                            copy.Coordinates = item.coordinates || (item.lat && item.lng ? item.lat + ',' + item.lng : '');
                            copy.coordinates = copy.Coordinates;
                            copy.Lat = parseFloat(item.lat);
                            copy.lat = copy.Lat;
                            copy.Lng = parseFloat(item.lng);
                            copy.lng = copy.Lng;
                            copy.device_type = item.device_type || 'ลำโพง';
                            copy.location_type = (item.location_type && item.location_type !== 'เสา (Pole)' && item.location_type !== 'เสาเทศบาล') ? item.location_type : 'เสาไฟ';
                            copy.created_at = item.created_at || '';
                            copy.created_by = item.created_by || '';
                            copy.created_by_name = item.created_by_name || '';
                            copy.updated_at = item.updated_at || '';
                            copy.updated_by = item.updated_by || '';
                            copy.updated_by_name = item.updated_by_name || '';

                            if (item.image) {
                                if (item.image.startsWith('http')) {
                                    copy.Image = item.image;
                                    copy.image = item.image;
                                } else {
                                    copy.Image = UPLOAD_BASE + item.image.replace(/^\//, '');
                                    copy.image = copy.Image;
                                }
                            } else {
                                copy.Image = '';
                                copy.image = '';
                            }
                            return copy;
                        });
                        if (successHandler) successHandler(data);
                    } else {
                        if (failureHandler) failureHandler(new Error(json.error || 'Failed to load'));
                    }
                } catch(e) {
                    console.error('getSpeakerData_Proxy error:', e);
                    if (failureHandler) failureHandler(e);
                }
            },
            saveSpeaker_Proxy: async function(payload) {
                try {
                    const id = payload.id || payload.ID;
                    const url = id ? (API_BASE + '/poles/' + id) : (API_BASE + '/poles');
                    const method = id ? 'PUT' : 'POST';

                    const res = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sessionStorage.getItem('polemap_token') || localStorage.getItem('polemap_token') || '') },
                        body: JSON.stringify(payload)
                    });
                    const json = await res.json();
                    if (json.success) {
                        if (successHandler) successHandler(json);
                    } else {
                        if (failureHandler) failureHandler(new Error(json.error || json.msg || 'Save failed'));
                    }
                } catch(e) {
                    console.error('saveSpeaker_Proxy error:', e);
                    if (failureHandler) failureHandler(e);
                }
            },
            deleteSpeaker_Proxy: async function(id, user) {
                try {
                    const res = await fetch(API_BASE + '/poles/' + id, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (sessionStorage.getItem('polemap_token') || localStorage.getItem('polemap_token') || '') },
                        body: JSON.stringify({ user: user })
                    });
                    const json = await res.json();
                    if (json.success) {
                        if (successHandler) successHandler(json);
                    } else {
                        if (failureHandler) failureHandler(new Error(json.error || 'Delete failed'));
                    }
                } catch(e) {
                    console.error('deleteSpeaker_Proxy error:', e);
                    if (failureHandler) failureHandler(e);
                }
            },
            verifyLogin_Proxy: async function(u, p) {
                try {
                    const res = await fetch(API_BASE + '/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: u, password: p })
                    });
                    const json = await res.json();
                    if (json.success) {
                        if (json.token) sessionStorage.setItem('polemap_token', json.token);
                        if (successHandler) successHandler({
                            success: true,
                            user: json.user,
                            token: json.token
                        });
                    } else {
                        if (successHandler) successHandler({
                            success: false,
                            msg: json.error || 'Login failed'
                        });
                    }
                } catch(e) {
                    console.error('verifyLogin_Proxy error:', e);
                    if (successHandler) successHandler({ success: false, msg: e.message });
                }
            },
            PrintModule_generateSummaryReport_Proxy: async function(standalone) {
                try {
                    const res = await fetch(API_BASE + '/reports/summary');
                    const json = await res.json();
                    if (json.success) {
                        if (successHandler) successHandler(json);
                    } else {
                        if (failureHandler) failureHandler(new Error('Summary failed'));
                    }
                } catch(e) {
                    if (failureHandler) failureHandler(e);
                }
            }
        };
    }

    window.google.script.run = {
        withSuccessHandler: function(successCb) {
            return {
                withFailureHandler: function(failureCb) {
                    return createRunProxy(successCb, failureCb);
                },
                ...createRunProxy(successCb, console.error)
            };
        },
        withFailureHandler: function(failureCb) {
            return {
                withSuccessHandler: function(successCb) {
                    return createRunProxy(successCb, failureCb);
                },
                ...createRunProxy(null, failureCb)
            };
        }
    };
})();

// === Script Section 2 ===
// 🚀 SCRIPT START CHECKS
        console.log("✅ Main Script Loaded");

        // 🚀 DEFINTIVE LOGIN HANDLER
        window.openLoginModal = function () {
            try {
                console.log("🔓 Attempting to open Login Modal...");
                var modal = document.getElementById('login-modal');
                if (!modal) {
                    alert("Fatal: Login modal missing from body!");
                    return;
                }

                if (window.currentUser) {
                    if (confirm("ยืนยันออกจากระบบ?")) {
                        window.currentUser = null;
                        sessionStorage.removeItem('polemap_token');
                        localStorage.removeItem('polemap_token');
                        localStorage.removeItem('ms_speaker_auth');
                        window.updateAuthUI();
                        window.renderListView();
                        window.showToast("ออกจากระบบเรียบร้อย");
                    }
                } else {
                    // 🔐 Persistence: Pre-fill credentials if saved
                    try {
                        var creds = localStorage.getItem('ms_speaker_creds');
                        if (creds) {
                            var data = JSON.parse(creds);
                            document.getElementById('l-user').value = data.u || "";
                            document.getElementById('l-pass').value = data.p || "";
                            document.getElementById('l-remember').checked = true;
                        }
                    } catch (e) { console.warn("Creds Restore Error", e); }

                    modal.style.display = 'flex';
                    setTimeout(function () {
                        var input = document.getElementById('l-user');
                        if (input) input.focus();
                    }, 100);
                }
            } catch (e) {
                alert("Login Error: " + e.message);
            }
        };




        var COMMUNITIES = [
            "แม่สาย หมู่ 1", "ดอยเวา หมู่ 2", "เวียงพาน หมู่ 3",
            "ป่ายางผาแตก หมู่ 10", "เหมืองแดง หมู่ 2", "ป่ายางชุม หมู่ 6",
            "เกาะทราย หมู่ 7", "ป่ายาง หมู่ 8", "ไม้ลุงขน หมู่ 10",
            "ดอยงาม หมู่ 2"
        ];

        var allData = [];
        var currentItem = null;
        var map = null;
        var markers = [];
        var currentUser = null;

        // 🛡️ Safe Display Name Map (Never expose raw login IDs on UI)
        var USER_DISPLAY_MAP = {
            "thedatazero": "ผู้ดูแลระบบสูงสุด",
            "admin": "ผู้ดูแลระบบ",
            "horn": "เอ",
            "monitor_msi": "เอ๋",
            "phachara": "เซ็ต",
            "dump": "ดั้ม"
        };

        window.getSafeUserName = function (raw) {
            if (!raw) return "-";
            var key = String(raw).trim().toLowerCase();
            return USER_DISPLAY_MAP[key] || String(raw).trim();
        };

        // 🛰️ Realtime GPS & Fullscreen State
        window.gpsWatchId = null;
        window.isRealtimeGpsOn = false;
        window.userGpsMarker = null;
        window.userGpsCircle = null;
        window.lastUserGpsPos = null;
        window.hasCenteredOnGpsOnce = false;
        window.isMapFullscreen = false;
        window.enteredAddFromFullscreen = false;
        window.photoOrientationMode = 'auto'; // 'auto' | 'portrait' | 'landscape'
        window.fullscreenOrientMode = 'portrait'; // 'portrait' | 'landscape'

        window.detectDeviceAndOrientation = function () {
            var ua = navigator.userAgent || "";
            var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
            var isCoarse = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
            var isMobile = isMobileUA || (isCoarse && window.innerWidth <= 1024);

            var orient = 'portrait';
            if (window.screen && window.screen.orientation && window.screen.orientation.type) {
                orient = window.screen.orientation.type.indexOf('landscape') !== -1 ? 'landscape' : 'portrait';
            } else if (typeof window.orientation === 'number') {
                orient = (Math.abs(window.orientation) === 90) ? 'landscape' : 'portrait';
            } else {
                orient = (window.innerWidth > window.innerHeight) ? 'landscape' : 'portrait';
            }

            return {
                isMobile: isMobile,
                deviceLabel: isMobile ? "มือถือ / แท็บเล็ต" : "คอมพิวเตอร์ (PC)",
                orientation: orient,
                orientLabel: orient === 'landscape' ? "แนวนอน (Landscape)" : "แนวตั้ง (Portrait)"
            };
        };

        window.setPhotoOrientationMode = function (mode) {
            window.photoOrientationMode = mode || 'auto';
            ['auto', 'portrait', 'landscape'].forEach(function (m) {
                var btn = document.getElementById('orient-pill-' + m);
                if (btn) {
                    if (m === window.photoOrientationMode) btn.classList.add('active');
                    else btn.classList.remove('active');
                }
            });

            var info = window.detectDeviceAndOrientation();
            var effective = window.photoOrientationMode === 'auto' ? info.orientation : window.photoOrientationMode;
            var hintEl = document.getElementById('photo-orient-hint');
            if (hintEl) {
                var modeTxt = effective === 'landscape' ? 'ภาพถ่ายแนวนอน (Landscape)' : 'ภาพถ่ายแนวตั้ง (Portrait)';
                hintEl.textContent = '(' + (window.photoOrientationMode === 'auto' ? 'อัตโนมัติ: ' + modeTxt : 'บังคับ: ' + modeTxt) + ')';
            }

            var previewBox = document.getElementById('img-preview-add');
            if (previewBox && !document.getElementById('base64-add').value) {
                if (effective === 'landscape') {
                    previewBox.style.height = '155px';
                    previewBox.style.maxWidth = '100%';
                    previewBox.style.margin = '0 auto';
                } else {
                    previewBox.style.height = '210px';
                    previewBox.style.maxWidth = '200px';
                    previewBox.style.margin = '0 auto';
                }
            }
        };

        // 🛰️ 1. REALTIME GPS TRACKING (Works in Normal Map & Fullscreen Portrait/Landscape)
        window.toggleRealtimeGps = function () {
            if (window.isRealtimeGpsOn) {
                window.stopRealtimeGps();
            } else {
                window.startRealtimeGps();
            }
        };

        window.startRealtimeGps = function () {
            if (!navigator.geolocation) {
                window.showToast("เบราว์เซอร์นี้ไม่รองรับระบบระบุพิกัด GPS");
                return;
            }
            window.isRealtimeGpsOn = true;
            window.hasCenteredOnGpsOnce = false;
            var btn = document.getElementById('btn-live-gps');
            if (btn) {
                btn.classList.add('gps-active');
                btn.innerHTML = '<i class="fas fa-location-crosshairs fa-spin"></i> GPS ทำงาน';
            }
            var hud = document.getElementById('gps-live-hud');
            if (hud) hud.style.display = 'inline-flex';
            var coordsLabel = document.getElementById('gps-live-coords');
            if (coordsLabel) coordsLabel.textContent = 'กำลังจับสัญญาณดาวเทียม...';

            if (window.gpsWatchId !== null) {
                navigator.geolocation.clearWatch(window.gpsWatchId);
            }

            window.gpsWatchId = navigator.geolocation.watchPosition(
                function (pos) {
                    var lat = pos.coords.latitude;
                    var lng = pos.coords.longitude;
                    var acc = Math.round(pos.coords.accuracy || 10);
                    window.lastUserGpsPos = { lat: lat, lng: lng, acc: acc };

                    var btnLive = document.getElementById('btn-live-gps');
                    if (btnLive) {
                        btnLive.innerHTML = '<i class="fas fa-location-crosshairs"></i> ปิด GPS';
                    }

                    var info = window.detectDeviceAndOrientation();
                    var hudEl = document.getElementById('gps-live-coords');
                    if (hudEl) {
                        hudEl.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (±' + acc + 'ม. • ' + (info.isMobile ? (info.orientation === 'landscape' ? 'มือถือแนวนอน' : 'มือถือแนวตั้ง') : 'PC') + ')';
                    }

                    if (map) {
                        var dotIcon = L.divIcon({
                            className: 'custom-gps-live-icon',
                            html: '<div class="gps-user-dot-wrap"><div class="gps-user-dot-pulse"></div><div class="gps-user-dot-core"></div></div>',
                            iconSize: [22, 22],
                            iconAnchor: [11, 11]
                        });

                        if (!window.userGpsMarker) {
                            window.userGpsMarker = L.marker([lat, lng], { icon: dotIcon, zIndexOffset: 2000 })
                                .addTo(map)
                                .bindPopup('<b>ตำแหน่งปัจจุบันของคุณ (Realtime GPS)</b><br>ความแม่นยำ ±' + acc + ' เมตร');
                        } else {
                            window.userGpsMarker.setLatLng([lat, lng]);
                            window.userGpsMarker.setPopupContent('<b>ตำแหน่งปัจจุบันของคุณ (Realtime GPS)</b><br>ความแม่นยำ ±' + acc + ' เมตร');
                        }

                        if (!window.userGpsCircle) {
                            window.userGpsCircle = L.circle([lat, lng], {
                                radius: Math.min(acc, 150),
                                color: '#0d6efd',
                                weight: 1,
                                fillColor: '#0d6efd',
                                fillOpacity: 0.12
                            }).addTo(map);
                        } else {
                            window.userGpsCircle.setLatLng([lat, lng]);
                            window.userGpsCircle.setRadius(Math.min(acc, 150));
                        }

                        if (!window.hasCenteredOnGpsOnce) {
                            window.hasCenteredOnGpsOnce = true;
                            map.setView([lat, lng], Math.max(map.getZoom(), 17));
                            window.showToast("จับพิกัด GPS สำเร็จ (±" + acc + " เมตร)");
                        }
                    }
                },
                function (err) {
                    var hudEl = document.getElementById('gps-live-coords');
                    if (hudEl) hudEl.textContent = 'สัญญาณ GPS ขัดข้อง กรุณาเปิด Location';
                    window.showToast("ไม่สามารถดึงพิกัด GPS ได้ กรุณาอนุญาตการเข้าถึงตำแหน่ง");
                },
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
            );
        };

        window.stopRealtimeGps = function () {
            window.isRealtimeGpsOn = false;
            if (window.gpsWatchId !== null) {
                navigator.geolocation.clearWatch(window.gpsWatchId);
                window.gpsWatchId = null;
            }
            if (map && window.userGpsMarker) {
                map.removeLayer(window.userGpsMarker);
                window.userGpsMarker = null;
            }
            if (map && window.userGpsCircle) {
                map.removeLayer(window.userGpsCircle);
                window.userGpsCircle = null;
            }
            var btn = document.getElementById('btn-live-gps');
            if (btn) {
                btn.classList.remove('gps-active');
                btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> เปิด GPS';
            }
            var hud = document.getElementById('gps-live-hud');
            if (hud) hud.style.display = 'none';
            window.showToast("ปิดระบบติดตามพิกัด GPS แล้ว");
        };

        window.centerOnMyGps = function () {
            if (window.lastUserGpsPos && map) {
                map.setView([window.lastUserGpsPos.lat, window.lastUserGpsPos.lng], 18);
                if (window.userGpsMarker) window.userGpsMarker.openPopup();
            } else {
                window.startRealtimeGps();
            }
        };

        // 🗺️ 2. FULLSCREEN MAP (Portrait & Landscape + Device Detection + Mode Selector)
        window.handleFullscreenMapClick = function () {
            if (window.isMapFullscreen) {
                window.exitFullscreenMap();
            } else {
                window.openFullscreenModePicker();
            }
        };

        window.openFullscreenModePicker = function () {
            var info = window.detectDeviceAndOrientation();
            var detText = document.getElementById('fs-device-detected-text');
            if (detText) {
                detText.innerHTML = 'ตรวจพบอุปกรณ์: <b style="color:var(--primary);">' + info.deviceLabel + '</b> • แนวหน้าจอปัจจุบัน: <b>' + info.orientLabel + '</b>';
            }
            var autoBtnLbl = document.getElementById('fs-auto-orient-btn-label');
            if (autoBtnLbl) {
                autoBtnLbl.textContent = info.orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง';
            }

            var cPort = document.getElementById('orient-card-portrait');
            var cLand = document.getElementById('orient-card-landscape');
            if (cPort && cLand) {
                cPort.classList.toggle('selected', info.orientation === 'portrait');
                cLand.classList.toggle('selected', info.orientation === 'landscape');
            }

            var modal = document.getElementById('fs-mode-modal');
            if (modal) modal.style.display = 'flex';
        };

        window.applyFullscreenMode = function (chosenMode) {
            window.closeModal('fs-mode-modal');
            var info = window.detectDeviceAndOrientation();
            var targetOrient = (chosenMode === 'auto' || !chosenMode) ? info.orientation : chosenMode;

            window.fullscreenOrientMode = targetOrient;
            window.setPhotoOrientationMode(chosenMode === 'auto' ? 'auto' : targetOrient);

            if (!window.isMapVisible) {
                window.toggleMap();
            }

            window.isMapFullscreen = true;
            document.body.classList.add('map-fullscreen-active');
            document.body.classList.remove('fs-orient-portrait', 'fs-orient-landscape');
            document.body.classList.add(targetOrient === 'landscape' ? 'fs-orient-landscape' : 'fs-orient-portrait');

            var fsBtn = document.getElementById('btn-fullscreen-map');
            if (fsBtn) {
                fsBtn.classList.add('fs-active');
                fsBtn.innerHTML = '<i class="fas fa-compress"></i> ย่อแผนที่';
            }
            var toggleBtn = document.getElementById('btn-toggle-map');
            if (toggleBtn) toggleBtn.style.display = 'none';

            var orientLabel = document.getElementById('fs-orient-label');
            if (orientLabel) {
                orientLabel.textContent = (info.isMobile ? '' : 'PC • ') + (targetOrient === 'landscape' ? 'โหมดแนวนอน (ถ่ายรูปแนวนอน)' : 'โหมดแนวตั้ง (ถ่ายรูปแนวตั้ง)');
            }

            if (info.isMobile) {
                var docEl = document.documentElement;
                var reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
                if (reqFs && !document.fullscreenElement) {
                    try {
                        var p = reqFs.call(docEl);
                        if (p && p.then) {
                            p.then(function () {
                                if (screen.orientation && screen.orientation.lock) {
                                    screen.orientation.lock(targetOrient === 'landscape' ? 'landscape' : 'portrait').catch(function () {});
                                }
                            }).catch(function () {});
                        }
                    } catch (_) {}
                } else if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock(targetOrient === 'landscape' ? 'landscape' : 'portrait').catch(function () {});
                }
            }

            window.showToast(targetOrient === 'landscape' ? "เปิดแผนที่เต็มจอ: โหมดแนวนอน (ถ่ายภาพแนวนอน)" : "เปิดแผนที่เต็มจอ: โหมดแนวตั้ง (ถ่ายภาพแนวตั้ง)");

            setTimeout(function () {
                if (map) map.invalidateSize();
            }, 220);
        };

        window.exitFullscreenMap = function () {
            window.isMapFullscreen = false;
            document.body.classList.remove('map-fullscreen-active', 'fs-orient-portrait', 'fs-orient-landscape');

            var fsBtn = document.getElementById('btn-fullscreen-map');
            if (fsBtn) {
                fsBtn.classList.remove('fs-active');
                fsBtn.innerHTML = '<i class="fas fa-expand"></i> เต็มจอ';
            }
            var toggleBtn = document.getElementById('btn-toggle-map');
            if (toggleBtn) toggleBtn.style.display = 'flex';

            if (screen.orientation && screen.orientation.unlock) {
                try { screen.orientation.unlock(); } catch (_) {}
            }
            if (document.fullscreenElement && document.exitFullscreen) {
                try { document.exitFullscreen().catch(function () {}); } catch (_) {}
            }

            setTimeout(function () {
                if (map) map.invalidateSize();
            }, 220);
        };

        window.quickAddFromMap = function () {
            if (!currentUser) {
                document.getElementById('login-modal').style.display = 'flex';
                window.showToast("กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนเพิ่มจุดติดตั้ง");
                return;
            }
            window.enteredAddFromFullscreen = window.isMapFullscreen;
            if (window.isMapFullscreen) {
                document.body.classList.remove('map-fullscreen-active');
            }
            var backFsBtn = document.getElementById('btn-back-to-fs');
            if (backFsBtn) {
                backFsBtn.style.display = window.enteredAddFromFullscreen ? 'inline-flex' : 'none';
            }
            window.switchPage('add', document.getElementById('nav-add'));
        };

        window.returnToFullscreenFromAdd = function () {
            window.switchPage('list', document.getElementById('nav-list'));
            window.applyFullscreenMode(window.fullscreenOrientMode || 'auto');
        };

        window.addEventListener('resize', function () {
            if (window.isMapFullscreen) {
                if (window.photoOrientationMode === 'auto') {
                    var info = window.detectDeviceAndOrientation();
                    window.fullscreenOrientMode = info.orientation;
                    document.body.classList.remove('fs-orient-portrait', 'fs-orient-landscape');
                    document.body.classList.add(info.orientation === 'landscape' ? 'fs-orient-landscape' : 'fs-orient-portrait');
                    var orientLabel = document.getElementById('fs-orient-label');
                    if (orientLabel) {
                        orientLabel.textContent = (info.isMobile ? '' : 'PC • ') + (info.orientation === 'landscape' ? 'โหมดแนวนอน (ถ่ายรูปแนวนอน)' : 'โหมดแนวตั้ง (ถ่ายรูปแนวตั้ง)');
                    }
                }
                if (map) setTimeout(function () { map.invalidateSize(); }, 150);
            }
        });

        window.onload = function () {
            try {
                console.log("App Standalone V3.8.5 Enterprise Starting...");
                initUI();
                initMap();
                checkStoredAuth();
                loadMasterData();
            } catch (e) {
                alert("Initialization Error: " + e.message);
            }
        };

        function checkStoredAuth() {
            var saved = localStorage.getItem('ms_speaker_auth');
            var tok = sessionStorage.getItem('polemap_token') || localStorage.getItem('polemap_token');
            if (saved && tok) {
                try {
                    currentUser = JSON.parse(saved);
                    updateAuthUI();
                } catch (e) {
                    localStorage.removeItem('ms_speaker_auth');
                }
            }
        }

        function initUI() {
            var fComm = document.getElementById('filter-community');
            var aComm = document.getElementById('add-community');
            var eComm = document.getElementById('edit-community');
            for (var i = 0; i < COMMUNITIES.length; i++) {
                var c = COMMUNITIES[i];
                fComm.add(new Option(c, c));
                aComm.add(new Option(c, c));
                eComm.add(new Option(c, c));
            }
            document.getElementById('search-input').oninput = renderListView;
            document.getElementById('filter-status').onchange = renderListView;
            document.getElementById('filter-community').onchange = renderListView;
            var devF = document.getElementById('filter-device-type'); if (devF) devF.onchange = renderListView;

            // 🚀 FIX: Event binding restored to inline HTML for maximum reliability
            // document.getElementById('auth-action').addEventListener... removed
            window.setPhotoOrientationMode('auto');
        }

        // 🛡️ SAFE LOGIN LOGIC (Restored)
        // Legacy function removed


        window.submitLogin = function () {
            var u = document.getElementById('l-user').value;
            var p = document.getElementById('l-pass').value;
            var remember = document.getElementById('l-remember').checked;

            if (!u || !p) return window.showToast("กรุณากรอก Username/Password");

            var btn = document.getElementById('btn-login');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังตรวจสอบ...';

            google.script.run
                .withSuccessHandler(function (res) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> เข้าสู่ระบบ';

                    if (res.success) {
                        currentUser = res.user;
                        // 🔐 V3 Persistence Logic: Set if checked, CLEAR if unchecked
                        if (remember) {
                            localStorage.setItem('ms_speaker_auth', JSON.stringify(res.user));
                            if (res.token) localStorage.setItem('polemap_token', res.token);
                            localStorage.setItem('ms_speaker_creds', JSON.stringify({ u: u }));
                        } else {
                            localStorage.removeItem('ms_speaker_auth');
                            localStorage.removeItem('polemap_token');
                            localStorage.removeItem('ms_speaker_creds');
                        }

                        updateAuthUI();
                        window.closeModal('login-modal');
                        renderListView();
                        window.showToast("เข้าสู่ระบบสำเร็จ: คุณ " + res.user.name);

                        // Clear inputs if NOT remembering
                        if (!remember) {
                            document.getElementById('l-user').value = "";
                            document.getElementById('l-pass').value = "";
                        }
                    } else {
                        window.showToast(res.msg);
                    }
                })
                .withFailureHandler(function (err) {
                    btn.disabled = false;
                    btn.innerHTML = 'เข้าสู่ระบบ';
                    window.showToast("การเชื่อมต่อล้มเหลว");
                })
                .verifyLogin_Proxy(u, p);
        };

        function updateAuthUI() {
            var info = document.getElementById('user-info');
            var act = document.getElementById('auth-action');
            var navAdd = document.getElementById('nav-add');

            // Clear user-info as requested (Minimalist UI)
            if (info) info.innerHTML = "";

            if (currentUser) {
                act.innerHTML = '<i class="fas fa-sign-out-alt"></i> Logout';
                act.style.background = 'rgba(220, 53, 69, 0.3)';
            } else {
                act.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
                act.style.background = '';
                if (document.getElementById('page-add').classList.contains('active')) {
                    window.switchPage('list', document.getElementById('nav-list'));
                }
            }
        }

        function initMap() {
            map = L.map('map').setView([20.4335, 99.8860], 14);
            var googleRoad = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                attribution: 'Google Maps'
            });
            var googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                attribution: 'Google Satellite'
            });
            googleRoad.addTo(map);
            L.control.layers({ 'แผนที่ถนน (Google Road)': googleRoad, 'ภาพถ่ายดาวเทียม (Satellite)': googleHybrid }, null, { position: 'bottomleft' }).addTo(map);
            setTimeout(function () { if (map) map.invalidateSize(); }, 500);
        }

        function loadMasterData() {
            document.getElementById('list-container').innerHTML = '<div style="text-align:center; padding:30px; color:#aaa;"><i class="fas fa-sync fa-spin"></i> กำลังโหลดพิกัดล่าสุด...</div>';
            google.script.run
                .withSuccessHandler(function (data) {
                    allData = data;
                    document.getElementById('data-count').innerText = "พบ " + data.length + " จุดติดตั้ง";
                    updateStatusCounts();
                    renderListView();
                })
                .getSpeakerData_Proxy();
        }

        function updateStatusCounts() {
            var counts = { 'ใช้งานได้': 0, 'ชำรุด': 0, 'สูญหาย': 0 };
            allData.forEach(function (item) {
                if (counts[item.status] !== undefined) counts[item.status]++;
            });

            // Update Filter Dropdown
            var filterSel = document.getElementById('filter-status');
            filterSel.options[1].text = "ใช้งานได้ (" + counts['ใช้งานได้'] + ")";
            filterSel.options[2].text = "ชำรุด (" + counts['ชำรุด'] + ")";
            filterSel.options[3].text = "สูญหาย (" + counts['สูญหาย'] + ")";

            // Update Edit Dropdown (Staff Only)
            var editSel = document.getElementById('edit-status');
            if (editSel) {
                editSel.options[0].text = "ใช้งานได้";
                editSel.options[1].text = "ชำรุด";
                editSel.options[2].text = "สูญหาย";
            }
        }

        function renderListView() {
            var container = document.getElementById('list-container');
            var query = document.getElementById('search-input').value.toLowerCase();
            var fStat = document.getElementById('filter-status').value;
            var fComm = document.getElementById('filter-community').value;
            var fDev = document.getElementById('filter-device-type') ? document.getElementById('filter-device-type').value : '';

            container.innerHTML = "";
            markers.forEach(function (m) { map.removeLayer(m); });
            markers = [];

            var filteredCount = 0;
            allData.forEach(function (item) {
                var hay = ((item.name || '') + ' ' + (item.community || '') + ' ' + (item.device_type || 'ลำโพง') + ' ' + (item.location_type || 'เสาไฟ') + ' ' + (item.note || '') + ' ' + (item.pole_code || '') + ' ' + (item.created_by || '')).toLowerCase();
                if (query && hay.indexOf(query) === -1) return;
                if (fStat && item.status !== fStat) return;
                if (fComm && item.community !== fComm) return;
                if (fDev && (item.device_type || 'ลำโพง') !== fDev) return;

                filteredCount++;
                var iconColor = item.status === 'ใช้งานได้' ? 'green' : (item.status === 'ชำรุด' ? 'red' : 'grey');
                var markerIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-' + iconColor + '.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                });

                // 🗺️ Marker Interaction (Sticky Scroll-Over Flow)
                var m = L.marker([item.lat, item.lng], { icon: markerIcon })
                    .addTo(map)
                    .bindPopup('<b>' + item.name + '</b><br>' + item.community, {
                        autoPan: false, // 🚫 Keep map steady
                        closeButton: false
                    })
                    .on('click', function (e) {
                        L.DomEvent.stopPropagation(e);
                        if (window.isMapFullscreen) {
                            window.openDetail(item);
                            return;
                        }
                        // 🚀 Trigger scroll instantly
                        window.scrollToCard(item.id);
                    });
                markers.push(m);

                var card = document.createElement('div');
                card.className = 'card';
                card.id = 'card-' + item.id;
                card.onclick = function () { window.openDetail(item); };

                // Status Badge Logic (Uses badge-ui for standard UI)
                var sTerm = (item.status || "").trim();
                var statusColor = sTerm === 'ใช้งานได้' ? 'var(--success)' : (sTerm === 'ชำรุด' ? 'var(--danger)' : 'var(--gray)');
                var statusBadge = '<span class="badge-ui" style="background:' + statusColor + '; padding:2px 8px; font-size:10px;">' + item.status + '</span>';

                card.style.borderLeftColor = statusColor;

                var devLabel = (item.device_type || 'ลำโพง') + ' • ' + (item.location_type || 'เสาไฟ');

                card.innerHTML = '<div class="card-info" style="flex:1;">' +
                    '<div class="card-title" style="margin-bottom:0;">' + item.name + '</div>' +
                    '<div class="card-sub" style="font-size:14px; font-weight:500; color:#0d6efd; margin-top:4px;">' + item.community + '</div>' +
                    '<div style="color:#6c757d; font-size:12px; font-weight:400; margin-top:2px;">' + devLabel + '</div>' +
                    '</div>' +
                    '<div style="flex:0.6; display:flex; justify-content:center; align-items:center;">' +
                    statusBadge +
                    '</div>';

                // 📸 Updated V3.8.5: List View is Clean (No Thumbnails)
                card.innerHTML += '<div class="btn-nav-small" onclick="window.navDirect(' + item.lat + ',' + item.lng + ')" title="นำทาง">' +
                    '<i class="fas fa-location-arrow"></i></div>';

                container.appendChild(card);
            });

            document.getElementById('data-count').innerText = "แสดง " + filteredCount + " จาก " + allData.length + " จุด";
            if (filteredCount === 0) {
                container.innerHTML = '<div style="text-align:center; padding:30px; color:#ccc; background:white; border-radius:15px;">ไม่พบพิกัดที่ค้นหา</div>';
            }
        }

        // 🔦 Scroll & Highlight Logic (Smart Natural Flow)
        // 🔦 Scroll & Highlight Logic (Precision Sticky Jump)
        window.scrollToCard = function (id) {
            var card = document.getElementById('card-' + id);
            var mapOuter = document.getElementById('map-outer-wrapper');
            if (!card) return;

            // 🎯 Phase 1: Robust Offset Calculation
            var headH = 70;
            var isM = (window.isMapVisible && mapOuter && mapOuter.style.display !== 'none');
            var mapH = isM ? mapOuter.offsetHeight : 0;
            var gap = 15;

            var absTop = 0, curr = card;
            while (curr) {
                absTop += curr.offsetTop;
                curr = curr.offsetParent;
            }

            // 📍 Result: Card stops reliably below the sticky map or header
            var targetY = absTop - (headH + mapH + gap);

            // 🚀 Smooth & Precise Scroll
            window.scrollTo({ top: targetY, behavior: 'smooth' });

            // ✨ Highlighting
            var old = document.querySelector('.card-highlight');
            if (old) old.classList.remove('card-highlight');
            card.classList.add('card-highlight');
            setTimeout(function () { if (card) card.classList.remove('card-highlight'); }, 2000);
        };

        // 🚀 Improved Map Toggle: Handle position and height transitions
        // Initialize Visibility
        window.isMapVisible = true;

        window.toggleMap = function () {
            var mapContainer = document.getElementById('map-container');
            var btn = document.getElementById('btn-toggle-map');
            if (!mapContainer || !btn) return;

            window.isMapVisible = !window.isMapVisible;

            if (window.isMapVisible) {
                mapContainer.style.display = 'block';
                btn.innerHTML = '<i class="fas fa-eye-slash"></i> ซ่อนแผนที่';
            } else {
                mapContainer.style.display = 'none';
                btn.innerHTML = '<i class="fas fa-map"></i> แสดงแผนที่';
            }
            if (map) setTimeout(function () { map.invalidateSize(); }, 300);
        };

        // 🚀 Removed complex scroll/collapse logic to ensure maximum stability

        // ❌ Removed Floating Card Functions (Reverted)

        window.navDirect = function (lat, lng) {
            event.stopPropagation();
            window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng, '_blank');
        };

        window.openDetailById = function (id) {
            var item = allData.find(function (it) { return it.id == id; });
            if (item) {
                window.scrollToCard(id); // Just scroll to it
                map.setView([item.lat, item.lng], 16);
            }
        };

        window.openDetail = function (item) {
            try {
                currentItem = item;
                window.toggleEditMode(false);

                // 1. Header: Name
                var nameEl = document.getElementById('d-name');
                if (nameEl) nameEl.innerText = item.name;

                // 2. Note
                var noteEl = document.getElementById('d-note');
                if (noteEl) {
                    noteEl.innerText = item.note || "-";
                    noteEl.style.fontSize = "1rem";
                    noteEl.style.fontWeight = "bold";
                    noteEl.style.color = "#333";
                    noteEl.style.marginTop = "10px";
                    noteEl.style.marginBottom = "10px";
                }

                // 3. Community & Geo
                var commEl = document.getElementById('d-community');
                if (commEl) commEl.innerText = (item.device_type || 'ลำโพง') + ' • ' + (item.location_type || 'เสาไฟ');

                var geoContainer = document.getElementById('d-geo');
                if (geoContainer) {
                    var latVal = parseFloat(item.lat) || 0;
                    var lngVal = parseFloat(item.lng) || 0;
                    geoContainer.innerHTML = '<span style="color:#aaa; font-size:0.9rem; font-family:monospace;">' + latVal.toFixed(6) + ', ' + lngVal.toFixed(6) + '</span>' +
                        '<span style="margin:0 10px; color:#ddd;">|</span>' +
                        '<span style="color:var(--primary); font-weight:500;">' + (item.community || "-") + '</span>';
                }

                // 4. Image
                var imgArea = document.getElementById('d-image-area');
                if (imgArea) imgArea.remove();

                if (item.Image) {
                    var imgDiv = document.createElement('div');
                    imgDiv.id = 'd-image-area';
                    imgDiv.style = "width:100%; height:250px; background:#f0f2f5; border-radius:12px; margin-top:10px; overflow:hidden; position:relative; cursor:zoom-in; display:flex; justify-content:center; align-items:center;";

                    imgDiv.onclick = function (e) {
                        e.stopPropagation();
                        window.openImgModal(item.Image);
                    };

                    var imgTag = document.createElement('img');
                    imgTag.src = item.Image;
                    imgTag.style = "max-width:100%; max-height:100%; object-fit:contain; display:block;";
                    imgTag.onerror = function () { imgDiv.remove(); };

                    imgDiv.appendChild(imgTag);

                    if (geoContainer && geoContainer.parentNode) {
                        geoContainer.parentNode.insertBefore(imgDiv, geoContainer.nextSibling);
                    }
                }

                // 5. Date (Buddhist Era พ.ศ. Creator + Latest Editor using Safe Display Name, never raw ID)
                var dateEl = document.getElementById('d-date');
                if (dateEl) {
                    var auditLines = [];
                    if (item.created_at || item.created_by) {
                        var creatorDisplay = item.created_by_name || window.getSafeUserName(item.created_by);
                        auditLines.push('สำรวจครั้งแรกโดย: ' + creatorDisplay + ' (' + (item.created_at || '-') + ')');
                    }
                    if (item.updated_at || item.updated_by) {
                        var editorDisplay = item.updated_by_name || window.getSafeUserName(item.updated_by);
                        auditLines.push('แก้ไขล่าสุดโดย: ' + editorDisplay + ' (' + (item.updated_at || '-') + ')');
                    }
                    dateEl.innerHTML = auditLines.join('<br>');
                }

                // 6. Badge
                var badge = document.getElementById('d-badge');
                if (badge) {
                    badge.innerText = item.status;
                    var sTerm = (item.status || "").trim();
                    badge.style.background = sTerm === 'ใช้งานได้' ? 'var(--success)' : (sTerm === 'ชำรุด' ? 'var(--danger)' : 'var(--gray)');
                }

                // 7. Admin Panel
                var adminPanel = document.getElementById('admin-panel');
                if (adminPanel) adminPanel.style.display = currentUser ? 'flex' : 'none';

                // 8. Map Toggle
                var mapBtn = document.getElementById('btn-toggle-map');
                if (mapBtn) mapBtn.style.display = 'none';

                // Show Modal
                var modal = document.getElementById('detail-modal');
                if (modal) {
                    modal.style.display = 'flex';
                    var content = modal.querySelector('.modal-content');
                    if (content) content.scrollTop = 0;
                }
            } catch (e) {
                console.warn("openDetail Minor Error (Supressed):", e);
            }
        };

        // 🗺️ Map Toggle Logic (Global Scope)
        window.isMapVisible = true;
        window.toggleMap = function () {
            var mapEl = document.getElementById('map');
            var mapCont = document.getElementById('map-container');
            var btn = document.getElementById('btn-toggle-map');
            if (!mapEl || !btn || !mapCont) return;

            window.isMapVisible = !window.isMapVisible;

            if (window.isMapVisible) {
                mapCont.style.display = "block";
                mapCont.style.height = "300px";
                mapCont.style.position = "sticky";
                mapEl.style.height = "300px";
                mapEl.style.opacity = "1";
                btn.innerHTML = '<i class="fas fa-eye-slash"></i> ซ่อนแผนที่';
            } else {
                mapCont.style.display = "none";
                mapCont.style.height = "0";
                mapCont.style.position = "relative";
                mapEl.style.height = "0";
                mapEl.style.opacity = "0";
                btn.innerHTML = '<i class="fas fa-map"></i> แสดงแผนที่';
            }

            // 🛡️ Map fix: Ensure leaflet re-calculates size if needed
            setTimeout(function () { if (map) map.invalidateSize(); }, 300);
        };

        window.toggleEditMode = function (isEdit) {
            try {
                var viewMode = document.getElementById('view-mode');
                var editMode = document.getElementById('edit-mode');
                if (viewMode) viewMode.style.display = isEdit ? 'none' : 'block';
                if (editMode) editMode.style.display = isEdit ? 'block' : 'none';

                if (isEdit && currentItem) {
                    var eComm = document.getElementById('edit-community');
                    if (eComm) eComm.value = currentItem.community;

                    var eName = document.getElementById('edit-name');
                    if (eName) eName.value = currentItem.name;

                    var eDev = document.getElementById('edit-device-type');
                    if (eDev) eDev.value = currentItem.device_type || 'ลำโพง';

                    var eLoc = document.getElementById('edit-location-type');
                    if (eLoc) eLoc.value = (currentItem.location_type && currentItem.location_type !== 'เสา (Pole)' && currentItem.location_type !== 'เสาเทศบาล') ? currentItem.location_type : 'เสาไฟ';

                    var eStatus = document.getElementById('edit-status');
                    if (eStatus) eStatus.value = currentItem.status;

                    var eNote = document.getElementById('edit-note');
                    if (eNote) eNote.value = currentItem.note || "";

                    // 🛡️ Fix Ghost Upload: Clear stale base64 data from previous cancelled edits
                    var b64Edit = document.getElementById('base64-edit');
                    if (b64Edit) b64Edit.value = "";

                    var imgPreview = document.getElementById('current-img-edit');
                    var delBtn = document.getElementById('btn-del-img');
                    var lblCam = document.getElementById('lbl-cam-edit');

                    if (currentItem.Image) {
                        if (imgPreview) {
                            imgPreview.src = currentItem.Image;
                            imgPreview.style.display = 'block';
                        }
                        if (delBtn) delBtn.style.display = 'inline-block';
                        // 🔒 Strict Workflow: Initial State - Disable Camera if Image Exists
                        if (lblCam) lblCam.style.pointerEvents = 'none';
                    } else {
                        if (imgPreview) imgPreview.style.display = 'none';
                        if (delBtn) delBtn.style.display = 'none';
                        // 🔓 Enable Camera if No Image
                        if (lblCam) lblCam.style.pointerEvents = 'auto';
                    }
                }
            } catch (e) {
                console.warn("toggleEditMode Error (Supressed):", e);
            }
        };

        window.submitEdit = function () {
            if (!currentUser) return;
            var payload = {
                id: currentItem.id,
                community: document.getElementById('edit-community').value,
                name: document.getElementById('edit-name').value,
                device_type: document.getElementById('edit-device-type') ? document.getElementById('edit-device-type').value : (currentItem.device_type || 'ลำโพง'),
                location_type: document.getElementById('edit-location-type') ? document.getElementById('edit-location-type').value : (currentItem.location_type || 'เสาไฟ'),
                status: document.getElementById('edit-status').value,
                note: document.getElementById('edit-note').value,
                user: currentUser.username || currentUser.name,
                updated_by: currentUser.username || currentUser.name,
                lat: currentItem.lat,
                lng: currentItem.lng,
                Image: currentItem.Image // 📸 Keep existing image by default
            };
            if (!payload.name) return alert("กรุณากรอกชื่อเป้าหมาย / จุดติดตั้ง");

            Swal.fire({
                title: 'ยืนยันการแก้ไขข้อมูลหรือไม่?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#16a34a',
                cancelButtonColor: '#cbd5e1',
                confirmButtonText: '<i class="fas fa-check"></i> ตกลง',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    var b64 = document.getElementById('base64-edit').value;
                    if (b64) {
                        payload.imageBase64 = b64.split(',')[1];
                        window.showToast("บันทึกและอัปโหลดรูป...");
                    }

                    // ⏳ Loading State
                    Swal.fire({
                        title: 'กำลังบันทึกข้อมูล...',
                        text: 'กรุณารอสักครู่ ห้ามปิดหน้าจอ',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });

                    sendEditPayload(payload);
                }
            });
        };

        function sendEditPayload(payload) {
            google.script.run
                .withSuccessHandler(function (res) {
                    try {
                        // 🛡️ Guard: Server might return null on extreme failure
                        if (!res) throw new Error("Server returned no response (null)");

                        if (res.success) {
                            Swal.fire({
                                icon: 'success',
                                title: 'บันทึกสำเร็จ',
                                text: 'ข้อมูลได้รับการปรับปรุงแล้ว',
                                timer: 1500,
                                showConfirmButton: false
                            });

                            if (res.image) {
                                // 🛡️ Guard: Handle Add Mode (currentItem is null)
                                if (!currentItem) {
                                    currentItem = {
                                        id: res.id,
                                        name: payload.name,
                                        community: payload.community,
                                        lat: payload.lat,
                                        lng: payload.lng,
                                        status: payload.status,
                                        note: payload.note,
                                        updatedAt: res.updatedAt,
                                        Image: res.image
                                    };
                                } else {
                                    currentItem.Image = res.image;
                                }
                                window.openDetail(currentItem);
                            }
                            // window.closeModal('detail-modal'); // 🚀 UX: Keep open to show result
                            loadMasterData(); // Background Refresh
                        } else {
                            Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: res.msg });
                        }
                    } catch (e) {
                        console.error(e);
                        Swal.fire({
                            icon: 'error',
                            title: 'Frontend Error',
                            html: '<b>' + e.message + '</b><br><small>' + (e.stack || "") + '</small>'
                        });
                    }
                })
                .withFailureHandler(function (err) {
                    Swal.fire({ icon: 'error', title: 'Server Error', text: err.message || err });
                })
                .saveSpeaker_Proxy(payload);
        }

        window.deletePhoto = function () {
            Swal.fire({
                title: 'ลบรูปภาพ?',
                text: "คุณต้องการลบรูปภาพนี้ออกจากแบบฟอร์มใช่หรือไม่",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'ลบรูปภาพ',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    document.getElementById('current-img-edit').src = "";
                    document.getElementById('current-img-edit').style.display = 'none';
                    document.getElementById('btn-del-img').style.display = 'none';
                    document.getElementById('base64-edit').value = "";
                    // 🗑️ Mark for deletion
                    if (currentItem) currentItem.Image = "";

                    // 🔓 Strict Workflow: Enable Camera after Delete
                    var lblCam = document.getElementById('lbl-cam-edit');
                    if (lblCam) lblCam.style.pointerEvents = 'auto';
                }
            });
        };

        window.closeModal = function (id) {
            document.getElementById(id).style.display = 'none';
            // 🗺️ Restore Map Toggle visibility ALWAYS (so user can toggle it back)
            var btn = document.getElementById('btn-toggle-map');
            if (btn) btn.style.display = 'flex';

            if (id === 'detail-modal') window.toggleEditMode(false);
        };
        window.goToGoogleMap = function () {
            if (!currentItem) return;
            window.open('https://www.google.com/maps/dir/?api=1&destination=' + currentItem.lat + ',' + currentItem.lng, '_blank');
        };

        window.confirmDelete = function () {
            if (!currentItem) return;
            Swal.fire({
                title: 'ยืนยันการลบ?',
                html: "คุณต้องการลบ <b>" + currentItem.name + "</b> ใช่หรือไม่?<br><small style='color:red'>(การกระทำนี้ไม่สามารถย้อนกลับได้)</small>",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'ลบข้อมูล',
                cancelButtonText: 'ยกเลิก'
            }).then((result) => {
                if (result.isConfirmed) {
                    // 🔐 Safe Delete Logic
                    Swal.fire({
                        title: 'กำลังลบ...',
                        allowOutsideClick: false,
                        didOpen: () => { Swal.showLoading(); }
                    });

                    google.script.run
                        .withSuccessHandler(function (res) {
                            if (res.success) {
                                Swal.fire({
                                    icon: 'success',
                                    title: 'ลบสำเร็จ',
                                    text: res.msg,
                                    timer: 1500,
                                    showConfirmButton: false
                                });
                                window.closeModal('detail-modal');
                                loadMasterData();
                            } else {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'ลบไม่สำเร็จ',
                                    text: res.msg
                                });
                            }
                        })
                        .withFailureHandler(function (err) {
                            Swal.fire({
                                icon: 'error',
                                title: 'Connection Error',
                                text: err.message || err
                            });
                        })
                        .deleteSpeaker_Proxy(currentItem.id, currentUser.name);
                }
            });
        };

        window.switchPage = function (pid, el) {
            if (pid === 'add' && !currentUser) {
                document.getElementById('login-modal').style.display = 'flex';
                window.showToast("กรุณา Login เพื่อเข้าใช้งานเมนูนี้");
                return;
            }

            if (pid === 'add') {
                if (window.isMapFullscreen) {
                    window.enteredAddFromFullscreen = true;
                    document.body.classList.remove('map-fullscreen-active');
                }
                var backFsBtn = document.getElementById('btn-back-to-fs');
                if (backFsBtn) backFsBtn.style.display = window.enteredAddFromFullscreen ? 'inline-flex' : 'none';
                window.setPhotoOrientationMode(window.photoOrientationMode || 'auto');
            } else if (pid === 'list') {
                if (window.enteredAddFromFullscreen) {
                    window.enteredAddFromFullscreen = false;
                    document.body.classList.add('map-fullscreen-active');
                }
            }

            document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
            document.getElementById('page-' + pid).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });

            if (el) el.classList.add('active');
            else {
                var elIn = document.getElementById('nav-' + pid);
                if (elIn) elIn.classList.add('active');
            }

            if (pid === 'list' && map) setTimeout(function () { map.invalidateSize(); }, 300);
        };

        window.startCaptureAndSave = function () {
            if (!currentUser) return alert("เจ้าหน้าที่เท่านั้น: กรุณา Login ก่อนเพิ่มข้อมูล");
            var name = document.getElementById('add-name').value;
            if (!name) return alert("กรุณากรอกชื่อเป้าหมาย / จุดติดตั้ง");

            var btn = document.getElementById('btn-save');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-satellite-dish fa-spin"></i> กำลังจับพิกัดแม่นยำสูงสุด...';

            var finishWithCoords = function (lat, lng) {
                var payload = {
                    community: document.getElementById('add-community').value,
                    name: name,
                    device_type: document.getElementById('add-device-type') ? document.getElementById('add-device-type').value : 'ลำโพง',
                    location_type: document.getElementById('add-location-type') ? document.getElementById('add-location-type').value : 'เสาไฟ',
                    status: document.getElementById('add-status') ? document.getElementById('add-status').value : 'ใช้งานได้',
                    note: document.getElementById('add-note').value,
                    user: currentUser.username || currentUser.name,
                    created_by: currentUser.username || currentUser.name,
                    lat: lat,
                    lng: lng
                };

                var b64 = document.getElementById('base64-add').value;
                if (b64) {
                    payload.imageBase64 = b64.split(',')[1];
                }

                Swal.fire({
                    title: 'กำลังบันทึกข้อมูล...',
                    text: 'กรุณารอสักครู่',
                    allowOutsideClick: false,
                    didOpen: () => { Swal.showLoading(); }
                });

                saveDataFinal(payload, btn);
            };

            if (window.isRealtimeGpsOn && window.lastUserGpsPos) {
                finishWithCoords(window.lastUserGpsPos.lat, window.lastUserGpsPos.lng);
                return;
            }

            navigator.geolocation.getCurrentPosition(function (pos) {
                finishWithCoords(pos.coords.latitude, pos.coords.longitude);
            }, function (err) {
                if (window.lastUserGpsPos) {
                    finishWithCoords(window.lastUserGpsPos.lat, window.lastUserGpsPos.lng);
                } else {
                    window.showToast("GPS Error: ระบุพิกัดล้มเหลว");
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-undo"></i> ลองใหม่อีกครั้ง';
                }
            }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
        };

        window.showToast = function (msg) {
            var container = document.getElementById('toast-container');
            var toast = document.createElement('div');
            toast.className = 'toast';
            toast.innerText = msg;
            container.appendChild(toast);
            setTimeout(function () { toast.remove(); }, 3000);
        };

        window.onclick = function (event) {
            if (event.target.className === 'modal') {
                event.target.style.display = 'none';
            }
        };


        // 🚀 Helper: Extract ID from response if needed (but currently we reload list)
        // Ideally, we'd append to list without reload, but let's stick to reload for now since filtered lists are complex.
        // But wait, the user said "new item image not showing". 
        // If we reload logic is: switchPage('list') -> loadMasterData().
        // If loadMasterData is fast, it might get stale data?
        // Let's add a small delay or Force Cache Busting?
        // Actually, the issue might be that the Image URL is not yet accessible via public link? 
        // V3.FILE.save returns a webContentLink/webViewLink.

        function saveDataFinal(payload, btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึกข้อมูล...';
            google.script.run.withSuccessHandler(function (res) {
                if (res.success) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check"></i> บันทึกสำเร็จ';

                    Swal.fire({
                        icon: 'success',
                        title: 'บันทึกสำเร็จ!',
                        text: 'ข้อมูลถูกบันทึกเรียบร้อยแล้ว',
                        timer: 2000,
                        showConfirmButton: false
                    });

                    // 🚀 OPTIMISTIC UI UPDATE: Inject new item directly into local data
                    if (res.id) {
                        var newItem = {
                            id: res.id,
                            community: payload.community,
                            name: payload.name,
                            status: payload.status,
                            note: payload.note,
                            user: payload.user,
                            lat: payload.lat,
                            lng: payload.lng,
                            Image: res.image || payload.Image, // Use returned URL or payload
                            updatedAt: res.updatedAt || new Date(),
                            updatedBy: res.updatedBy || payload.user
                        };

                        // Add to global data
                        allData.push(newItem);

                        // Sort by updated date descending (optional, but good for UX)
                        // allData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                    }

                    // Clear Form
                    document.getElementById('add-name').value = "";
                    document.getElementById('add-note').value = "";
                    document.getElementById('base64-add').value = "";
                    document.getElementById('img-preview-add').innerHTML = '<span style="color:#adb5bd; font-size:13px;"><i class="fas fa-camera" style="font-size:24px; display:block; margin-bottom:5px;"></i>แตะเพื่อถ่ายรูป</span>';

                    // 🔄 Navigate back to List IMMEDIATELY
                    setTimeout(() => {
                        window.switchPage('list', document.getElementById('nav-list'));
                        // Render the new list immediately
                        renderListView();
                        updateStatusCounts();

                        // Background Refresh to sync with sheet eventually
                        loadMasterData();
                    }, 1000);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-times"></i> บันทึกไม่สำเร็จ';
                    Swal.fire({
                        icon: 'error',
                        title: 'บันทึกไม่สำเร็จ',
                        text: res.msg
                    });
                }
            })
                .withFailureHandler(function (err) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-times"></i> ระบบขัดข้อง';
                    Swal.fire({ icon: 'error', title: 'Server Connection Error', text: err.message || err });
                }).saveSpeaker_Proxy(payload);
        }

        window.openImgModal = function (src) {
            var modal = document.getElementById('img-modal');
            var modalImg = document.getElementById('img-modal-content');
            modal.style.display = "flex";
            modalImg.src = src;
        };

        window.closeImgModal = function () {
            var modal = document.getElementById('img-modal');
            modal.style.display = "none";
        };

        // Process Image with Orientation Awareness (Portrait vs Landscape) & 90° Rotation Support
        window.processImage = function (input, imgId, hiddenId) {
            if (input.files && input.files[0]) {
                var reader = new FileReader();
                reader.onload = function (e) {
                    var img = new Image();
                    img.onload = function () {
                        var info = window.detectDeviceAndOrientation();
                        var targetOrient = window.photoOrientationMode === 'auto' ? info.orientation : window.photoOrientationMode;
                        var isImgLandscape = img.width > img.height;
                        var needRotate = false;

                        // On mobile devices where camera sensor sometimes returns landscape buffer while held in portrait (or vice versa) when user explicitly picked a mode:
                        if (window.photoOrientationMode === 'portrait' && isImgLandscape) {
                            needRotate = true;
                        } else if (window.photoOrientationMode === 'landscape' && !isImgLandscape) {
                            needRotate = true;
                        }

                        var srcW = needRotate ? img.height : img.width;
                        var srcH = needRotate ? img.width : img.height;
                        var maxDim = 960;
                        var scale = maxDim / Math.max(srcW, srcH);
                        if (scale > 1) scale = 1;

                        var canvas = document.createElement('canvas');
                        canvas.width = Math.round(srcW * scale);
                        canvas.height = Math.round(srcH * scale);
                        var ctx = canvas.getContext('2d');

                        if (needRotate) {
                            ctx.translate(canvas.width / 2, canvas.height / 2);
                            ctx.rotate(90 * Math.PI / 180);
                            ctx.drawImage(img, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
                        } else {
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        }

                        var dataUrl = canvas.toDataURL('image/jpeg', 0.72);
                        document.getElementById(hiddenId).value = dataUrl;
                        window.renderProcessedPreview(imgId, hiddenId, dataUrl, canvas.width, canvas.height);
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(input.files[0]);
            }
        };

        window.renderProcessedPreview = function (imgId, hiddenId, dataUrl, w, h) {
            var imgEl = document.getElementById(imgId);
            if (imgEl && imgEl.tagName === 'IMG') {
                imgEl.src = dataUrl;
                imgEl.style.display = 'block';
                var delBtn = document.getElementById('btn-del-img');
                if (delBtn) delBtn.style.display = 'inline-block';
                var rotEditBtn = document.getElementById('btn-rotate-edit');
                if (rotEditBtn) rotEditBtn.style.display = 'inline-flex';
                var lblCam = document.getElementById('lbl-cam-edit');
                if (lblCam && imgId === 'current-img-edit') lblCam.style.pointerEvents = 'none';
            } else {
                var container = document.getElementById(imgId);
                if (container) {
                    if (w && h) {
                        if (w >= h) {
                            container.style.height = '180px';
                            container.style.maxWidth = '100%';
                        } else {
                            container.style.height = '230px';
                            container.style.maxWidth = '210px';
                        }
                    }
                    container.innerHTML = '<img src="' + dataUrl + '" style="width:100%; height:100%; object-fit:contain; background:#0f172a;">';
                    var rotAddBtn = document.getElementById('btn-rotate-add');
                    if (rotAddBtn) rotAddBtn.style.display = 'inline-flex';
                }
            }
        };

        window.rotatePreviewImage = function (hiddenId, previewId) {
            var b64Input = document.getElementById(hiddenId);
            var srcData = (b64Input && b64Input.value) ? b64Input.value : '';
            if (!srcData && previewId === 'current-img-edit') {
                var curImg = document.getElementById('current-img-edit');
                if (curImg && curImg.src) srcData = curImg.src;
            }
            if (!srcData) return;

            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                var canvas = document.createElement('canvas');
                canvas.width = img.height;
                canvas.height = img.width;
                var ctx = canvas.getContext('2d');
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(90 * Math.PI / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                var rotatedUrl = canvas.toDataURL('image/jpeg', 0.75);
                if (b64Input) b64Input.value = rotatedUrl;
                window.renderProcessedPreview(previewId, hiddenId, rotatedUrl, canvas.width, canvas.height);
                window.showToast(canvas.width >= canvas.height ? "หมุนรูปเป็นแนวนอนแล้ว" : "หมุนรูปเป็นแนวตั้งแล้ว");
            };
            img.src = srcData;
        };

        // 📊 Report Generation Logic (With Progress Window)
        window.generateReport = function () {
            const output = document.getElementById('report-output');
            const openBtn = document.getElementById('btn-open-report');

            Swal.fire({
                title: 'กำลังสร้างรายงาน...',
                html: 'ระบบกำลังประมวลผลข้อมูลและสร้างไฟล์ใน Google Drive<br>กรุณารอสักครู่... <b></b>%',
                timer: 20000,
                timerProgressBar: true,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                    const b = Swal.getHtmlContainer().querySelector('b');
                    let p = 0;
                    const timerInterval = setInterval(() => {
                        p += 5;
                        if (p > 95) p = 95;
                        if (b) b.textContent = p;
                    }, 500);
                }
            });

            google.script.run.withSuccessHandler(function (res) {
                Swal.close();
                if (res.success) {
                    output.style.display = 'block';
                    openBtn.onclick = function () { window.open(res.url, '_blank'); };
                    Swal.fire({
                        icon: 'success',
                        title: 'สร้างรายงานสำเร็จ!',
                        text: res.msg,
                        confirmButtonText: 'เปิดดูไฟล์รายงาน',
                        showCancelButton: true,
                        cancelButtonText: 'ปิด'
                    }).then((result) => {
                        if (result.isConfirmed) window.open(res.url, '_blank');
                    });
                } else {
                    Swal.fire({ icon: 'error', title: 'ล้มเหลว', text: res.msg });
                }
            }).withFailureHandler(function (err) {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'ระบบขัดข้อง', text: err });
            }).PrintModule_generateSummaryReport_Proxy(true);
        };
