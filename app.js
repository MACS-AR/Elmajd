// =============================================
// 🔥 تهيئة Firebase
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyBgRkceRq7FRbhCevLlULYNy-A5Tl_cr0w",
    authDomain: "sr-test-c9e06.firebaseapp.com",
    databaseURL: "https://sr-test-c9e06-default-rtdb.firebaseio.com",
    projectId: "sr-test-c9e06",
    storageBucket: "sr-test-c9e06.firebasestorage.app",
    messagingSenderId: "658396508062",
    appId: "1:658396508062:web:c56cd84f93daa2e176308f"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const dbRT = firebase.database();
const dbFS = firebase.firestore();

// =============================================
// 🗺️ Mapbox Token
// =============================================
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw';

// =============================================
// 📦 المتغيرات العامة
// =============================================
let currentUser = null;
let currentUserId = null;
let userRole = null;
let userTenantId = null;
let mapInstance = null;
let mapMarkers = {};
let liveListeners = [];
let trackingInterval = null;
let isOnline = navigator.onLine;

// =============================================
// 📡 حالة الاتصال المباشر
// =============================================
function updateOnlineStatus() {
    isOnline = navigator.onLine;
    const statusEl = document.getElementById('onlineStatus');
    if (statusEl) {
        if (isOnline) {
            statusEl.className = 'text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30';
            statusEl.textContent = '🟢 متصل';
        } else {
            statusEl.className = 'text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 offline';
            statusEl.textContent = '🔴 غير متصل';
        }
    }
    // تخزين الحالة في localStorage لكل عميل
    if (currentUserId) {
        localStorage.setItem(`online_${currentUserId}`, isOnline ? 'true' : 'false');
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// =============================================
// 🔐 إنشاء حساب أدمن تلقائي
// =============================================
async function ensureAdminAccount() {
    const adminEmail = 'admin@system.com';
    const adminPassword = '123456';
    const adminName = 'المدير العام';

    try {
        await auth.signInWithEmailAndPassword(adminEmail, adminPassword);
        console.log('✅ تم تسجيل الدخول بحساب الأدمن الموجود');
        return true;
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            try {
                const userCred = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
                const uid = userCred.user.uid;
                await userCred.user.updateProfile({ displayName: adminName });

                await dbFS.collection('users').doc(uid).set({
                    tenantId: 'admin_tenant',
                    email: adminEmail,
                    name: adminName,
                    phone: '0100000000',
                    role: 'admin',
                    status: 'active',
                    createdAt: Date.now()
                });

                const tenantRef = dbFS.collection('tenants').doc('admin_tenant');
                const tenantSnap = await tenantRef.get();
                if (!tenantSnap.exists) {
                    await tenantRef.set({
                        name: 'منصة التتبع',
                        ownerName: adminName,
                        email: adminEmail,
                        phone: '0100000000',
                        status: 'active',
                        subscriptionStatus: 'active',
                        vehiclesCount: 0,
                        createdAt: Date.now()
                    });
                }

                console.log('✅ تم إنشاء حساب الأدمن التلقائي');
                await auth.signInWithEmailAndPassword(adminEmail, adminPassword);
                return true;
            } catch (createErr) {
                console.error('❌ فشل إنشاء حساب الأدمن:', createErr.message);
                return false;
            }
        } else {
            console.error('❌ خطأ في تسجيل الدخول:', err.message);
            return false;
        }
    }
}

// =============================================
// 🔐 المصادقة
// =============================================

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');

    errorEl.classList.add('hidden');

    if (!email || !password) {
        errorEl.textContent = 'الرجاء إدخال البريد وكلمة المرور';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const cred = await auth.signInWithEmailAndPassword(email, password);
        currentUser = cred.user;
        currentUserId = cred.user.uid;
        
        const userDoc = await dbFS.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            userRole = data.role || 'customer';
            userTenantId = data.tenantId || null;
        } else {
            userRole = 'customer';
            userTenantId = 'default';
            await dbFS.collection('users').doc(currentUser.uid).set({
                tenantId: 'default',
                email: currentUser.email,
                name: currentUser.displayName || 'مستخدم',
                role: 'customer',
                status: 'active',
                createdAt: Date.now()
            });
        }

        updateOnlineStatus();
        showDashboard();

    } catch (err) {
        errorEl.textContent = err.message || 'فشل تسجيل الدخول';
        errorEl.classList.remove('hidden');
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        liveListeners.forEach(ref => ref.off && ref.off());
        liveListeners = [];
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
        if (trackingInterval) {
            clearInterval(trackingInterval);
            trackingInterval = null;
        }
        document.getElementById('dashboardScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (err) {
        alert('خطأ في الخروج: ' + err.message);
    }
}

async function quickLoginAdmin() {
    document.getElementById('loginEmail').value = 'admin@system.com';
    document.getElementById('loginPassword').value = '123456';
    document.getElementById('loginError').classList.add('hidden');
    
    try {
        await auth.signInWithEmailAndPassword('admin@system.com', '123456');
    } catch (err) {
        await ensureAdminAccount();
        try {
            await auth.signInWithEmailAndPassword('admin@system.com', '123456');
        } catch (e) {
            alert('فشل تسجيل الدخول السريع: ' + e.message);
        }
    }
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');

    document.getElementById('userName').textContent = `مرحباً، ${currentUser.displayName || 'المستخدم'}`;
    document.getElementById('userRole').textContent = userRole === 'admin' ? 'مدير' : 'عميل';

    if (userRole === 'admin') {
        document.getElementById('adminMenu').classList.remove('hidden');
    } else {
        document.getElementById('adminMenu').classList.add('hidden');
    }

    showPage('dashboard');
}

// =============================================
// 📄 التنقل بين الصفحات
// =============================================
function showPage(page) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));
    
    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add('active'));
        document.querySelectorAll('.nav-btn-mobile').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.nav-btn-mobile[data-page="${page}"]`).forEach(b => b.classList.add('active'));
    }

    // إخفاء القائمة المنسدلة للجوال
    document.getElementById('mobileMenuDropdown')?.classList.add('hidden');

    switch(page) {
        case 'dashboard': renderDashboard(); break;
        case 'vehicles': renderVehicles(); break;
        case 'map': renderMap(); break;
        case 'tracking': renderTracking(); break;
        case 'admin-companies': if (userRole === 'admin') renderCompanies(); break;
        case 'admin-vehicles': if (userRole === 'admin') renderAdminVehicles(); break;
        case 'admin-subscriptions': if (userRole === 'admin') renderSubscriptions(); break;
    }
}

// =============================================
// 📊 لوحة التحكم
// =============================================
async function renderDashboard() {
    const container = document.getElementById('page-dashboard');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gold">📊 لوحة التحكم</h2>
            <span class="text-sm text-gold-light/50">آخر تحديث: ${new Date().toLocaleTimeString('ar')}</span>
        </div>
        <div id="statsContainer" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">🚗</div><div><p class="stat-label text-sm">المركبات</p><p id="stat-total" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">📶</div><div><p class="stat-label text-sm">متصل</p><p id="stat-online" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">🔄</div><div><p class="stat-label text-sm">متحرك</p><p id="stat-moving" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">⏸️</div><div><p class="stat-label text-sm">متوقف</p><p id="stat-stopped" class="stat-value text-2xl font-bold">0</p></div></div></div>
        </div>
        <div class="bg-dark-card rounded-xl shadow-sm p-4 border border-gold-border/20">
            <h3 class="font-bold text-gold mb-3">📍 آخر المواقع <span class="text-xs text-gold-light/50 font-normal">(اضغط لعرض على الخريطة)</span></h3>
            <div id="recentLocations" class="space-y-2 text-sm text-gold-light/70"></div>
        </div>
    `;

    loadDashboardData();
}

function loadDashboardData() {
    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) { updateStats(0, 0, 0, 0); return; }

        let total = 0, online = 0, moving = 0, stopped = 0;
        const recent = [];

        Object.keys(data).forEach(code => {
            const v = data[code];
            // تصفية حسب المستخدم الحالي
            if (userRole !== 'admin') {
                // العميل يرى فقط سياراته التي أضافها أو التابعة لشركته
                if (v.createdByUid && v.createdByUid !== currentUserId) return;
                if (v.tenantId && v.tenantId !== userTenantId) return;
            }
            
            total++;
            const status = v.status || 'offline';
            if (status === 'online') online++;
            else if (status === 'moving') { moving++; online++; }
            else stopped++;

            if (v.liveLocation) {
                recent.push({
                    name: v.displayName || code,
                    lat: v.liveLocation.latitude,
                    lng: v.liveLocation.longitude,
                    speed: v.liveLocation.speed || 0,
                    time: v.liveLocation.timestamp,
                    code: code
                });
            }
        });

        updateStats(total, online, moving, stopped);
        renderRecent(recent);
    });

    liveListeners.push(ref);
}

function updateStats(total, online, moving, stopped) {
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-online').textContent = online;
    document.getElementById('stat-moving').textContent = moving;
    document.getElementById('stat-stopped').textContent = stopped;
}

function renderRecent(list) {
    const container = document.getElementById('recentLocations');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = '<p class="text-gold-light/40">لا توجد مواقع حالية</p>';
        return;
    }
    container.innerHTML = list.slice(0, 10).map(item => `
        <div class="flex justify-between items-center border-b border-gold-border/10 py-2 cursor-pointer hover:bg-gold/5 px-2 rounded transition" onclick="focusOnVehicle('${item.code}')">
            <span class="font-medium text-gold-light">${item.name}</span>
            <span class="text-xs text-gold">${item.speed.toFixed(1)} كم/س</span>
            <span class="text-xs text-gold-light/40">${item.time ? new Date(item.time).toLocaleTimeString('ar') : '-'}</span>
        </div>
    `).join('');
}

function focusOnVehicle(code) {
    showPage('map');
    setTimeout(() => {
        if (mapInstance && mapMarkers[code]) {
            const marker = mapMarkers[code];
            const lngLat = marker.getLngLat();
            mapInstance.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 15 });
            marker.togglePopup();
        } else {
            // محاولة البحث عن السائق في سجل الحركة
            showPage('tracking');
            setTimeout(() => {
                const items = document.querySelectorAll('#trackingList .border-b');
                items.forEach(item => {
                    if (item.textContent.includes(code)) {
                        item.style.backgroundColor = 'rgba(212, 160, 23, 0.1)';
                        item.style.borderRight = '4px solid #d4a017';
                        setTimeout(() => {
                            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                    }
                });
            }, 500);
        }
    }, 500);
}

// =============================================
// 🚗 سياراتي
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-gold">🚗 سياراتي</h2>
            <button onclick="showAddVehicle()" class="btn-primary">➕ إضافة سيارة</button>
        </div>
        <div id="vehiclesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    `;

    loadVehiclesData();
}

function loadVehiclesData() {
    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        const list = document.getElementById('vehiclesList');
        if (!list) return;

        if (!data) {
            list.innerHTML = '<p class="text-gold-light/40 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
            return;
        }

        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            // تصفية حسب المستخدم الحالي
            if (userRole !== 'admin') {
                if (v.createdByUid && v.createdByUid !== currentUserId) return;
                if (v.tenantId && v.tenantId !== userTenantId) return;
            }

            const status = v.status || 'offline';
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';
            const statusText = status === 'online' ? 'متصل' : status === 'moving' ? 'متحرك' : 'غير متصل';
            const loc = v.liveLocation || {};

            html += `
                <div class="vehicle-card ${statusClass} rounded-xl p-4 shadow-sm cursor-pointer" onclick="focusOnVehicle('${code}')">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gold-light">${v.displayName || code}</h4>
                            <p class="text-sm text-gold-light/50">كود: <span class="font-mono">${code}</span></p>
                            <p class="text-sm text-gold-light/50">${v.phone || 'لا يوجد هاتف'}</p>
                            <p class="text-xs text-gold/70">👤 أضيف بواسطة: ${v.createdBy || 'النظام'}</p>
                        </div>
                        <span class="status-dot ${statusClass}"></span>
                    </div>
                    <div class="mt-2 text-sm text-gold-light/60 grid grid-cols-2 gap-1">
                        <span>🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</span>
                        <span>🔋 ${v.deviceHealth?.battery || '?'}%</span>
                        <span class="text-xs text-gold-light/40 col-span-2">📍 ${loc.latitude ? loc.latitude.toFixed(4) + ', ' + loc.longitude.toFixed(4) : 'لا يوجد'}</span>
                        <span class="text-xs text-gold col-span-2">${statusText}</span>
                    </div>
                    ${userRole === 'admin' ? `<div class="mt-2 text-xs text-gold/50">الشركة: ${v.tenantId || 'غير محدد'}</div>` : ''}
                </div>
            `;
        });

        list.innerHTML = html || '<p class="text-gold-light/40 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
    });

    liveListeners.push(ref);
}

// =============================================
// ➕ إضافة سيارة
// =============================================
function showAddVehicle() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'addVehicleModal';
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gold">➕ إضافة سيارة جديدة</h3>
                <button onclick="document.getElementById('addVehicleModal').remove()" class="text-gold-light/40 hover:text-gold-light text-2xl">×</button>
            </div>
            <form onsubmit="handleAddVehicle(event)">
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">كود الدخول (4 أرقام)</label>
                    <input id="newCode" type="number" min="1000" max="9999" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">اسم السائق</label>
                    <input id="newName" type="text" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">رقم الهاتف</label>
                    <input id="newPhone" type="tel" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" />
                </div>
                <button type="submit" class="w-full btn-primary py-2">إضافة</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleAddVehicle(e) {
    e.preventDefault();
    const code = document.getElementById('newCode').value.trim();
    const name = document.getElementById('newName').value.trim();
    const phone = document.getElementById('newPhone').value.trim();

    if (!code || code.length !== 4) {
        alert('الكود يجب أن يكون 4 أرقام');
        return;
    }
    if (!name) {
        alert('الرجاء إدخال اسم السائق');
        return;
    }

    try {
        const snap = await dbRT.ref(`vehicleDrivers/${code}`).once('value');
        if (snap.exists()) {
            alert('هذا الكود مستخدم بالفعل');
            return;
        }

        await dbRT.ref(`vehicleDrivers/${code}`).set({
            displayName: name,
            phone: phone || '',
            tenantId: userTenantId || 'default',
            vehicleDriverId: code,
            status: 'offline',
            subscriptionValid: true,
            deviceId: null,
            createdBy: currentUser?.displayName || currentUser?.email || 'المستخدم',
            createdByUid: currentUserId || 'unknown',
            lastLogin: Date.now(),
            createdAt: Date.now()
        });

        alert('تم إضافة السيارة بنجاح ✅');
        document.getElementById('addVehicleModal').remove();
        renderVehicles();

    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

// =============================================
// 🗺️ الخريطة المباشرة
// =============================================
function renderMap() {
    const container = document.getElementById('page-map');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-2xl font-bold text-gold">🗺️ الخريطة المباشرة</h2>
            <span id="mapVehiclesCount" class="text-sm text-gold-light/50">0 مركبة</span>
        </div>
        <div id="map-container"></div>
    `;

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    mapInstance = new mapboxgl.Map({
        container: 'map-container',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [31.2357, 30.0444],
        zoom: 10,
        attributionControl: false
    });

    mapInstance.addControl(new mapboxgl.NavigationControl());
    mapInstance.addControl(new mapboxgl.FullscreenControl());

    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        Object.values(mapMarkers).forEach(m => m.remove());
        mapMarkers = {};

        let count = 0;
        Object.keys(data).forEach(code => {
            const v = data[code];
            // تصفية حسب المستخدم الحالي
            if (userRole !== 'admin') {
                if (v.createdByUid && v.createdByUid !== currentUserId) return;
                if (v.tenantId && v.tenantId !== userTenantId) return;
            }

            const loc = v.liveLocation;
            if (!loc || !loc.latitude || !loc.longitude) return;

            count++;
            const status = v.status || 'offline';
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';
            const carColor = status === 'moving' ? '#d4a017' : status === 'online' ? '#22c55e' : '#ef4444';

            const el = document.createElement('div');
            el.className = `map-marker ${statusClass}`;
            el.innerHTML = `
                <svg viewBox="0 0 32 32" width="32" height="32">
                    <path class="car-body" d="M4 10 L6 6 L26 6 L28 10 L28 20 L26 22 L24 22 L24 20 L8 20 L8 22 L6 22 L4 20 Z" 
                          fill="${carColor}" 
                          stroke="#1a1a2e" stroke-width="1.5"/>
                    <circle cx="10" cy="22" r="3" fill="#1a1a2e" stroke="#f5c842" stroke-width="1"/>
                    <circle cx="22" cy="22" r="3" fill="#1a1a2e" stroke="#f5c842" stroke-width="1"/>
                    <rect x="12" y="8" width="8" height="6" fill="#1a1a2e" rx="1" stroke="#f5c842" stroke-width="0.5"/>
                    ${status === 'moving' ? `<circle cx="16" cy="14" r="2" fill="#d4a017" opacity="0.8"/>` : ''}
                </svg>
            `;

            const marker = new mapboxgl.Marker({ element: el, offset: [0, -16] })
                .setLngLat([loc.longitude, loc.latitude])
                .setPopup(new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`
                        <div class="map-popup">
                            <div class="name">${v.displayName || code}</div>
                            <div class="detail">🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</div>
                            <div class="detail">🔋 ${v.deviceHealth?.battery || '?'}%</div>
                            <div class="detail">${status === 'moving' ? '🟢 متحرك' : status === 'online' ? '📶 متصل' : '🔴 غير متصل'}</div>
                            <div class="detail gold-text">👤 أضيف بواسطة: ${v.createdBy || 'النظام'}</div>
                            ${userRole === 'admin' ? `<div class="detail text-xs">🏢 ${v.tenantId || '-'}</div>` : ''}
                            <button onclick="showDriverTracking('${code}')" class="btn-primary text-xs mt-2 w-full">📈 عرض سجل الحركة</button>
                        </div>
                    `)
                )
                .addTo(mapInstance);

            mapMarkers[code] = marker;
        });

        document.getElementById('mapVehiclesCount').textContent = count + ' مركبة';
    });

    liveListeners.push(ref);
}

// =============================================
// 📈 سجل حركة السائق
// =============================================
function renderTracking() {
    const container = document.getElementById('page-tracking');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gold">📈 سجل حركة السائقين</h2>
            <span class="text-sm text-gold-light/50">${new Date().toLocaleDateString('ar')}</span>
        </div>
        <div class="flex gap-2 mb-4 flex-wrap">
            <button onclick="loadTracking('today')" class="tab-btn active" data-tab="today">📅 اليوم</button>
            <button onclick="loadTracking('week')" class="tab-btn" data-tab="week">📆 هذا الأسبوع</button>
            <button onclick="loadTracking('month')" class="tab-btn" data-tab="month">📆 هذا الشهر</button>
        </div>
        <div id="trackingContainer" class="bg-dark-card rounded-xl shadow-sm p-4 border border-gold-border/20">
            <div id="trackingList" class="space-y-3"></div>
        </div>
    `;

    loadTracking('today');
}

function loadTracking(period) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === period) btn.classList.add('active');
    });

    const container = document.getElementById('trackingList');
    if (!container) return;

    const now = Date.now();
    let startTime = 0;
    let periodLabel = '';
    switch(period) {
        case 'today':
            startTime = now - 24 * 60 * 60 * 1000;
            periodLabel = 'اليوم';
            break;
        case 'week':
            startTime = now - 7 * 24 * 60 * 60 * 1000;
            periodLabel = 'هذا الأسبوع';
            break;
        case 'month':
            startTime = now - 30 * 24 * 60 * 60 * 1000;
            periodLabel = 'هذا الشهر';
            break;
        default:
            startTime = now - 24 * 60 * 60 * 1000;
            periodLabel = 'اليوم';
    }

    container.innerHTML = '<div class="text-center text-gold-light/40 py-8"><div class="loading-spinner mx-auto"></div><p class="mt-2">جاري التحميل...</p></div>';

    const ref = dbRT.ref('vehicleDrivers');
    ref.once('value', (snap) => {
        const data = snap.val();
        if (!data) {
            container.innerHTML = '<div class="text-center text-gold-light/40 py-8">لا توجد بيانات</div>';
            return;
        }

        let html = '';
        let hasData = false;
        let totalDrivers = 0;
        let activeDrivers = 0;

        Object.keys(data).forEach(code => {
            const v = data[code];
            // تصفية حسب المستخدم الحالي
            if (userRole !== 'admin') {
                if (v.createdByUid && v.createdByUid !== currentUserId) return;
                if (v.tenantId && v.tenantId !== userTenantId) return;
            }

            totalDrivers++;
            const loc = v.liveLocation || {};
            const lastUpdate = loc.timestamp || v.lastLogin || 0;

            const isActive = lastUpdate >= startTime;
            if (isActive) activeDrivers++;

            if (!isActive) return;

            hasData = true;
            const status = v.status || 'offline';
            const statusText = status === 'moving' ? '🟢 متحرك' : status === 'online' ? '📶 متصل' : '🔴 غير متصل';
            const statusColor = status === 'moving' ? 'text-green-400' : status === 'online' ? 'text-blue-400' : 'text-gray-500';

            const pointsCount = Math.floor((lastUpdate - startTime) / 5000) + 1;

            html += `
                <div class="border-b border-gold-border/10 pb-3 mb-3 hover:bg-gold/5 p-2 rounded transition">
                    <div class="flex justify-between items-center flex-wrap gap-2">
                        <div>
                            <h4 class="font-bold text-gold-light">${v.displayName || code}</h4>
                            <p class="text-sm text-gold-light/50">كود: <span class="font-mono">${code}</span></p>
                            <p class="text-xs text-gold/70">👤 أضيف بواسطة: ${v.createdBy || 'النظام'}</p>
                            <p class="text-xs text-gold-light/40">📊 عدد النقاط: ${pointsCount}</p>
                        </div>
                        <div class="text-left">
                            <span class="text-sm font-medium ${statusColor}">${statusText}</span>
                            <p class="text-xs text-gold-light/40">آخر تحديث: ${lastUpdate ? new Date(lastUpdate).toLocaleString('ar') : '-'}</p>
                            ${loc.speed ? `<p class="text-xs text-gold">🚀 ${loc.speed.toFixed(1)} كم/س</p>` : ''}
                            ${loc.latitude ? `<p class="text-xs text-gold-light/40">📍 ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}</p>` : ''}
                        </div>
                    </div>
                    <div class="mt-2 flex gap-2 flex-wrap">
                        <button onclick="focusOnVehicle('${code}')" class="btn-outline text-xs">📍 عرض على الخريطة</button>
                        <button onclick="showDriverTracking('${code}')" class="btn-primary text-xs">📊 تفاصيل السائق</button>
                    </div>
                </div>
            `;
        });

        const summary = `
            <div class="bg-gold/10 rounded-lg p-3 mb-4 flex justify-between items-center flex-wrap border border-gold-border/20">
                <span class="text-sm text-gold-light/70">📊 <strong>${periodLabel}</strong></span>
                <span class="text-sm text-gold-light/70">🚗 إجمالي السائقين: <strong>${totalDrivers}</strong></span>
                <span class="text-sm text-green-400">🟢 النشطاء: <strong>${activeDrivers}</strong></span>
                <span class="text-sm text-gold">📈 نسبة النشاط: <strong>${totalDrivers > 0 ? Math.round((activeDrivers/totalDrivers)*100) : 0}%</strong></span>
            </div>
        `;

        container.innerHTML = hasData ? summary + html : '<div class="text-center text-gold-light/40 py-8">لا توجد حركة في ' + periodLabel + '</div>';
    });
}

function showDriverTracking(code) {
    showPage('map');
    setTimeout(() => {
        if (mapInstance && mapMarkers[code]) {
            const marker = mapMarkers[code];
            const lngLat = marker.getLngLat();
            mapInstance.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: 15 });
            marker.togglePopup();
        } else {
            showPage('tracking');
            setTimeout(() => {
                const items = document.querySelectorAll('#trackingList .border-b');
                items.forEach(item => {
                    if (item.textContent.includes(code)) {
                        item.style.backgroundColor = 'rgba(212, 160, 23, 0.1)';
                        item.style.borderRight = '4px solid #d4a017';
                        setTimeout(() => {
                            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 300);
                    }
                });
            }, 500);
        }
    }, 500);
}

// =============================================
// 🏢 إدارة الشركات (للمشرف فقط)
// =============================================
async function renderCompanies() {
    const container = document.getElementById('page-admin-companies');
    if (!container || userRole !== 'admin') return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gold">🏢 الشركات</h2>
            <button onclick="showAddCompany()" class="btn-primary">➕ إضافة شركة</button>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>اسم الشركة</th>
                        <th>المسؤول</th>
                        <th>الهاتف</th>
                        <th>السيارات</th>
                        <th>الاشتراك</th>
                        <th>الحالة</th>
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody id="companiesTableBody">
                    <tr><td colspan="7" class="text-center text-gold-light/40">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbFS.collection('tenants').onSnapshot((snap) => {
        const tbody = document.getElementById('companiesTableBody');
        if (!tbody) return;

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gold-light/40">لا توجد شركات</td></tr>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            html += `
                <tr>
                    <td class="font-medium text-gold-light">${data.name || 'غير مسمى'}</td>
                    <td class="text-gold-light/70">${data.ownerName || '-'}</td>
                    <td class="text-gold-light/70">${data.phone || '-'}</td>
                    <td class="text-gold-light/70">${data.vehiclesCount || 0}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${data.subscriptionStatus === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">${data.subscriptionStatus === 'active' ? 'نشط' : 'منتهي'}</span></td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${data.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'}">${data.status === 'active' ? 'نشطة' : 'موقفة'}</span></td>
                    <td>
                        <button onclick="toggleCompany('${doc.id}')" class="btn-success text-xs">${data.status === 'active' ? 'تعطيل' : 'تفعيل'}</button>
                        <button onclick="deleteCompany('${doc.id}')" class="btn-danger text-xs">حذف</button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    });
}

function showAddCompany() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'addCompanyModal';
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gold">🏢 إضافة شركة جديدة</h3>
                <button onclick="document.getElementById('addCompanyModal').remove()" class="text-gold-light/40 hover:text-gold-light text-2xl">×</button>
            </div>
            <form onsubmit="handleAddCompany(event)">
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">اسم الشركة *</label>
                    <input id="compName" type="text" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">المسؤول *</label>
                    <input id="compOwner" type="text" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">البريد الإلكتروني *</label>
                    <input id="compEmail" type="email" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">كلمة المرور *</label>
                    <input id="compPassword" type="password" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gold mb-1">الهاتف</label>
                    <input id="compPhone" type="tel" class="w-full px-3 py-2 border border-gold-border/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold bg-dark-input text-gold-light" />
                </div>
                <button type="submit" class="w-full btn-primary py-2">إضافة الشركة</button>
            </form>
        </div>
    `;
    document.body.appendChild(overlay);
}

async function handleAddCompany(e) {
    e.preventDefault();
    const name = document.getElementById('compName').value.trim();
    const owner = document.getElementById('compOwner').value.trim();
    const email = document.getElementById('compEmail').value.trim();
    const password = document.getElementById('compPassword').value.trim();
    const phone = document.getElementById('compPhone').value.trim();

    if (!name || !owner || !email || !password) {
        alert('جميع الحقول المطلوبة يجب تعبئتها');
        return;
    }

    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;

        const tenantRef = dbFS.collection('tenants').doc();
        await tenantRef.set({
            name,
            ownerName: owner,
            email,
            phone: phone || '',
            status: 'active',
            subscriptionStatus: 'active',
            vehiclesCount: 0,
            createdAt: Date.now()
        });

        await dbFS.collection('users').doc(uid).set({
            tenantId: tenantRef.id,
            email,
            name: owner,
            phone: phone || '',
            role: 'customer',
            status: 'active',
            createdAt: Date.now()
        });

        alert('تم إضافة الشركة بنجاح ✅');
        document.getElementById('addCompanyModal').remove();
        renderCompanies();

    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

async function toggleCompany(id) {
    if (!confirm('هل تريد تغيير حالة هذه الشركة؟')) return;
    try {
        const doc = await dbFS.collection('tenants').doc(id).get();
        const current = doc.data().status;
        await dbFS.collection('tenants').doc(id).update({
            status: current === 'active' ? 'suspended' : 'active'
        });
        alert('تم تغيير الحالة ✅');
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

async function deleteCompany(id) {
    if (!confirm('هل أنت متأكد من حذف هذه الشركة؟ هذا الإجراء لا يمكن التراجع عنه!')) return;
    try {
        await dbFS.collection('tenants').doc(id).delete();
        alert('تم الحذف ✅');
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

// =============================================
// 🌍 جميع السيارات (للمشرف)
// =============================================
function renderAdminVehicles() {
    const container = document.getElementById('page-admin-vehicles');
    if (!container || userRole !== 'admin') return;

    container.innerHTML = `
        <h2 class="text-2xl font-bold text-gold mb-6">🌍 جميع السيارات</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>الكود</th>
                        <th>السائق</th>
                        <th>الشركة</th>
                        <th>الهاتف</th>
                        <th>أضيف بواسطة</th>
                        <th>الحالة</th>
                        <th>السرعة</th>
                        <th>البطارية</th>
                        <th>آخر تحديث</th>
                    </tr>
                </thead>
                <tbody id="adminVehiclesBody">
                    <tr><td colspan="9" class="text-center text-gold-light/40">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbRT.ref('vehicleDrivers').on('value', (snap) => {
        const data = snap.val();
        const tbody = document.getElementById('adminVehiclesBody');
        if (!tbody) return;

        if (!data) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-gold-light/40">لا توجد سيارات</td></tr>';
            return;
        }

        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            const loc = v.liveLocation || {};
            const status = v.status || 'offline';
            const statusText = status === 'moving' ? '🟢 متحرك' : status === 'online' ? '📶 متصل' : '🔴 غير متصل';
            const statusClass = status === 'moving' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : status === 'online' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border border-gray-500/30';

            html += `
                <tr class="cursor-pointer hover:bg-gold/5 transition" onclick="focusOnVehicle('${code}')">
                    <td class="font-mono font-bold text-gold-light">${code}</td>
                    <td class="text-gold-light/80">${v.displayName || '-'}</td>
                    <td class="text-xs text-gold-light/50">${v.tenantId || '-'}</td>
                    <td class="text-gold-light/70">${v.phone || '-'}</td>
                    <td class="text-xs text-gold/70">${v.createdBy || 'النظام'}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${statusClass}">${statusText}</span></td>
                    <td class="text-gold-light/70">${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</td>
                    <td class="text-gold-light/70">${v.deviceHealth?.battery || '?'}%</td>
                    <td class="text-xs text-gold-light/40">${loc.timestamp ? new Date(loc.timestamp).toLocaleString('ar') : '-'}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    });
}

// =============================================
// 📋 الاشتراكات (للمشرف)
// =============================================
function renderSubscriptions() {
    const container = document.getElementById('page-admin-subscriptions');
    if (!container || userRole !== 'admin') return;

    container.innerHTML = `
        <h2 class="text-2xl font-bold text-gold mb-6">📋 إدارة الاشتراكات</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>الشركة</th>
                        <th>الباقة</th>
                        <th>تاريخ البداية</th>
                        <th>تاريخ النهاية</th>
                        <th>الحالة</th>
                        <th>المبلغ</th>
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody id="subscriptionsBody">
                    <tr><td colspan="7" class="text-center text-gold-light/40">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbFS.collection('subscriptions').onSnapshot(async (snap) => {
        const tbody = document.getElementById('subscriptionsBody');
        if (!tbody) return;

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gold-light/40">لا توجد اشتراكات</td></tr>';
            return;
        }

        let html = '';
        for (const doc of snap.docs) {
            const data = doc.data();
            let tenantName = data.tenantId || 'غير معروف';
            try {
                const tenantDoc = await dbFS.collection('tenants').doc(data.tenantId).get();
                if (tenantDoc.exists) tenantName = tenantDoc.data().name || tenantName;
            } catch(e) {}

            const status = data.status || 'expired';
            const statusText = status === 'active' ? 'نشط' : status === 'trial' ? 'تجريبي' : 'منتهي';
            const statusClass = status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : status === 'trial' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30';

            html += `
                <tr>
                    <td class="font-medium text-gold-light">${tenantName}</td>
                    <td class="text-gold-light/70">${data.planName || 'قياسي'}</td>
                    <td class="text-sm text-gold-light/50">${data.startDate ? new Date(data.startDate).toLocaleDateString('ar') : '-'}</td>
                    <td class="text-sm text-gold-light/50">${data.endDate ? new Date(data.endDate).toLocaleDateString('ar') : '-'}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${statusClass}">${statusText}</span></td>
                    <td class="text-gold-light/70">${data.amount || 0} ج.م</td>
                    <td>
                        <button onclick="extendSubscription('${doc.id}')" class="btn-success text-xs">تمديد</button>
                        <button onclick="suspendSubscription('${doc.id}')" class="btn-danger text-xs">تعليق</button>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    });
}

async function extendSubscription(id) {
    const days = prompt('كم يوم تريد التمديد؟ (أدخل رقماً)');
    if (!days || isNaN(days) || parseInt(days) <= 0) return;
    
    try {
        const doc = await dbFS.collection('subscriptions').doc(id).get();
        const data = doc.data();
        const currentEnd = data.endDate || Date.now();
        const newEnd = new Date(currentEnd);
        newEnd.setDate(newEnd.getDate() + parseInt(days));

        await dbFS.collection('subscriptions').doc(id).update({
            endDate: newEnd.getTime(),
            status: 'active'
        });
        alert(`تم التمديد ${days} يوم ✅`);
        renderSubscriptions();
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

async function suspendSubscription(id) {
    if (!confirm('هل تريد تعليق هذا الاشتراك؟')) return;
    try {
        await dbFS.collection('subscriptions').doc(id).update({
            status: 'suspended'
        });
        alert('تم تعليق الاشتراك ✅');
        renderSubscriptions();
    } catch (err) {
        alert('خطأ: ' + err.message);
    }
}

// =============================================
// 🚀 بدء التطبيق
// =============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        currentUserId = user.uid;
        try {
            const doc = await dbFS.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                userRole = data.role || 'customer';
                userTenantId = data.tenantId || null;
            } else {
                userRole = 'customer';
                userTenantId = 'default';
            }
        } catch (e) {
            userRole = 'customer';
            userTenantId = 'default';
        }

        updateOnlineStatus();
        showDashboard();
    } else {
        const success = await ensureAdminAccount();
        if (!success) {
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('dashboardScreen').classList.add('hidden');
        }
    }
});

console.log('🚗 نظام التتبع جاهز!');
