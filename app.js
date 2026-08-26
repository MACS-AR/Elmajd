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

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const dbRT = firebase.database();
const dbFS = firebase.firestore();

// =============================================
// 📦 المتغيرات العامة
// =============================================
let currentUser = null;
let currentUserId = null;
let userRole = null;
let userTenantId = null;

// متغيرات الخريطة المجانية (Leaflet)
let mapInstance = null;
let mapMarkers = {};
let streetLayer = null;
let satelliteLayer = null;

let liveListeners = [];
let isInitialized = false;

// متغيرات نافذة سجل المسار (جديد)
let historyMapInstance = null;
let historyPolyline = null;

// =============================================
// 🔐 إنشاء حساب أدمن تلقائي (للحالات الطارئة)
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
                showGlobalError('فشل إنشاء حساب الأدمن التلقائي: ' + createErr.message);
                return false;
            }
        } else {
            console.error('❌ خطأ في تسجيل الدخول:', err.message);
            showGlobalError('خطأ في تسجيل الدخول: ' + err.message);
            return false;
        }
    }
}

// =============================================
// 🔐 إنشاء حساب تجريبي
// =============================================
async function createDemoAccount() {
    const demoEmail = 'demo_' + Date.now() + '@gmail.com';
    const demoPassword = '123456';
    const demoName = 'عميل تجريبي';

    try {
        const userCred = await auth.createUserWithEmailAndPassword(demoEmail, demoPassword);
        const uid = userCred.user.uid;

        await userCred.user.updateProfile({ displayName: demoName });

        const tenantId = 'demo_' + Date.now();
        await dbFS.collection('tenants').doc(tenantId).set({
            name: 'شركة تجريبية',
            ownerName: demoName,
            email: demoEmail,
            phone: '0100000000',
            status: 'active',
            subscriptionStatus: 'active',
            vehiclesCount: 0,
            createdAt: Date.now()
        });

        await dbFS.collection('users').doc(uid).set({
            tenantId: tenantId,
            email: demoEmail,
            name: demoName,
            phone: '0100000000',
            role: 'customer',
            status: 'active',
            createdAt: Date.now()
        });

        alert('✅ تم إنشاء الحساب التجريبي بنجاح!\nالبريد: ' + demoEmail + '\nكلمة المرور: ' + demoPassword);
        await auth.signInWithEmailAndPassword(demoEmail, demoPassword);
        
    } catch (err) {
        alert('❌ فشل إنشاء الحساب التجريبي: ' + err.message);
    }
}

// =============================================
// 🔐 عرض رسائل الخطأ العامة
// =============================================
function showGlobalError(message) {
    const errorEl = document.getElementById('globalError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 8000);
    }
}

// =============================================
// 🔐 المصادقة - تسجيل الدخول
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
        showDashboard();
    } catch (err) {
        errorEl.textContent = err.message || 'فشل تسجيل الدخول';
        errorEl.classList.remove('hidden');
    }
}

// =============================================
// 🔐 تسجيل الخروج
// =============================================
async function handleLogout() {
    try {
        await auth.signOut();
        liveListeners.forEach(ref => ref.off && ref.off());
        liveListeners = [];
        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }
        document.getElementById('dashboardScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (err) {
        alert('خطأ في الخروج: ' + err.message);
    }
}

// =============================================
// 🔐 تسجيل الدخول السريع (أدمن)
// =============================================
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

// =============================================
// 🔐 عرض لوحة التحكم
// =============================================
function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');

    document.getElementById('userName').textContent = `مرحباً، ${currentUser?.displayName || 'المستخدم'}`;
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
    }

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
            <h2 class="text-2xl font-bold text-yellow-500">📊 لوحة التحكم</h2>
            <span class="text-sm text-gray-400">آخر تحديث: ${new Date().toLocaleTimeString('ar')}</span>
        </div>
        <div id="statsContainer" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">🚗</div><div><p class="stat-label text-sm">المركبات</p><p id="stat-total" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">📶</div><div><p class="stat-label text-sm">متصل</p><p id="stat-online" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">🔄</div><div><p class="stat-label text-sm">متحرك</p><p id="stat-moving" class="stat-value text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon gold">⏸️</div><div><p class="stat-label text-sm">متوقف</p><p id="stat-stopped" class="stat-value text-2xl font-bold">0</p></div></div></div>
        </div>
        <div class="bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-700">
            <h3 class="font-bold text-yellow-500 mb-3">📍 آخر المواقع <span class="text-xs text-gray-500 font-normal">(اضغط لعرض على الخريطة)</span></h3>
            <div id="recentLocations" class="space-y-2 text-sm text-gray-300"></div>
        </div>
    `;

    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) { updateStats(0, 0, 0, 0); return; }

        let total = 0, online = 0, moving = 0, stopped = 0;
        const recent = [];
        const now = Date.now();

        Object.keys(data).forEach(code => {
            const v = data[code];
            // 🔥 عزل البيانات (العميل لا يرى سوى سياراته)
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;
            
            total++;
            const lastUpdate = v.liveLocation?.timestamp || 0;
            const isOnline = (now - lastUpdate) < 10000;
            const status = v.status || 'offline';
            
            if (isOnline && status === 'moving') { moving++; online++; }
            else if (isOnline) { online++; }
            else { stopped++; }

            if (v.liveLocation) {
                recent.push({
                    name: v.displayName || code,
                    lat: v.liveLocation.latitude,
                    lng: v.liveLocation.longitude,
                    speed: v.liveLocation.speed || 0,
                    time: v.liveLocation.timestamp,
                    code: code,
                    isOnline: isOnline
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
        container.innerHTML = '<p class="text-gray-500">لا توجد مواقع حالية</p>';
        return;
    }
    container.innerHTML = list.slice(0, 10).map(item => `
        <div class="flex justify-between items-center border-b border-gray-700 py-2 cursor-pointer hover:bg-gray-700 px-2 rounded" onclick="focusOnVehicle('${item.code}', ${item.lat}, ${item.lng})">
            <span class="font-medium text-yellow-500">${item.name}</span>
            <span class="text-xs ${item.isOnline ? 'text-green-400' : 'text-gray-500'}">${item.isOnline ? '🟢 متصل' : '🔴 غير متصل'}</span>
            <span class="text-xs text-yellow-600">${item.speed.toFixed(1)} كم/س</span>
            <span class="text-xs text-gray-500">${item.time ? new Date(item.time).toLocaleTimeString('ar') : '-'}</span>
        </div>
    `).join('');
}

function focusOnVehicle(code, lat, lng) {
    showPage('map');
    setTimeout(() => {
        if (mapInstance) {
            // توجيه الخريطة المجانية لمكان السيارة
            if (lat && lng) {
                mapInstance.setView([lat, lng], 16);
            }
            if (mapMarkers[code]) {
                mapMarkers[code].openPopup();
            }
        }
    }, 500);
}

// =============================================
// 🚗 سياراتي مع إدارة (مع إضافة زر مسار الرحلة)
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🚗 سياراتي</h2>
            <button onclick="showAddVehicle()" class="btn-primary">➕ إضافة سيارة</button>
        </div>
        <div id="vehiclesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    `;

    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        const list = document.getElementById('vehiclesList');
        if (!list) return;

        if (!data) {
            list.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
            return;
        }

        const now = Date.now();
        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            // 🔥 عزل البيانات
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const lastUpdate = v.liveLocation?.timestamp || 0;
            const isOnline = (now - lastUpdate) < 10000;
            const status = isOnline ? (v.status === 'moving' ? 'moving' : 'online') : 'offline';
            
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';
            const statusText = status === 'online' ? 'متصل' : status === 'moving' ? 'متحرك' : 'غير متصل';
            const loc = v.liveLocation || {};

            html += `
                <div class="vehicle-card ${statusClass} rounded-xl p-4 shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gray-200">السائق: ${v.displayName || 'غير معروف'}</h4>
                            <p class="text-sm text-gray-400">${v.phone || 'لا يوجد هاتف'}</p>
                        </div>
                        <span class="status-dot ${statusClass}"></span>
                    </div>
                    <div class="mt-2 text-sm text-gray-300 grid grid-cols-2 gap-1">
                        <span>🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</span>
                        <span>🔋 ${v.deviceHealth?.battery || '?'}%</span>
                        <span class="text-xs ${status === 'online' ? 'text-green-400' : status === 'moving' ? 'text-yellow-400' : 'text-gray-500'} col-span-2">${statusText}</span>
                    </div>
                    <div class="mt-3 flex gap-2 flex-wrap">
                        <button onclick="focusOnVehicle('${code}', ${loc.latitude}, ${loc.longitude})" class="btn-outline text-xs">📍 عرض</button>
                        <button onclick="showDriverDetails('${code}')" class="btn-edit text-xs">📋 بيانات</button>
                        <button onclick="showDriverHistoryMapModal('${code}')" class="btn-info text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded">🗺️ مسار الرحلة</button>
                        <button onclick="showEditVehicle('${code}')" class="btn-primary text-xs">✏️ تعديل</button>
                        <button onclick="deleteVehicle('${code}')" class="btn-danger text-xs">🗑️ حذف</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html || '<p class="text-gray-500 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
    });

    liveListeners.push(ref);
}

// ... دوال الإضافة والتعديل والحذف ...
function showAddVehicle() { /* الكود الأصلي */ }
async function handleAddVehicle(e) { /* الكود الأصلي */ }
function showEditVehicle(code) { /* الكود الأصلي */ }
async function handleEditVehicle(e, code) { /* الكود الأصلي */ }
async function deleteVehicle(code) { /* الكود الأصلي */ }
function showDriverDetails(code) { /* الكود الأصلي */ }
function loadDriverHistory(code) { /* الكود الأصلي */ }

// =============================================
// 🗺️ الخريطة المباشرة المجانية (Leaflet)
// =============================================
function renderMap() {
    const container = document.getElementById('page-map');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🗺️ الخريطة المباشرة</h2>
            <div class="flex items-center gap-2">
                <span id="mapVehiclesCount" class="text-sm text-gray-400">0 مركبة</span>
                <select id="mapStyleSelect" class="map-style-select bg-gray-700 text-white rounded p-1" onchange="changeMapStyle(this.value)">
                    <option value="street">🛣️ خريطة الشوارع (مجاني)</option>
                    <option value="satellite">🛰️ قمر صناعي (مجاني)</option>
                </select>
            </div>
        </div>
        <div id="map-container" style="height: 70vh; width: 100%; border-radius: 15px; z-index: 1;"></div>
    `;

    // تنظيف الخريطة السابقة إن وجدت
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        mapMarkers = {};
    }

    // تهيئة خريطة Leaflet (المركز الافتراضي: القاهرة)
    mapInstance = L.map('map-container').setView([30.0444, 31.2357], 10);

    // طبقة الشوارع المجانية (OpenStreetMap)
    streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    // طبقة القمر الصناعي المجانية (Esri)
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    });

    // تعيين الشوارع كافتراضي
    streetLayer.addTo(mapInstance);

    // جلب البيانات لرسم السيارات
    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        // إزالة العلامات القديمة من الخريطة
        Object.values(mapMarkers).forEach(m => mapInstance.removeLayer(m));
        mapMarkers = {};

        let count = 0;
        const now = Date.now();

        Object.keys(data).forEach(code => {
            const v = data[code];
            // 🔥 عزل البيانات: العميل يرى سياراته فقط
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const loc = v.liveLocation;
            if (!loc || !loc.latitude || !loc.longitude) return;

            count++;
            const lastUpdate = loc.timestamp || 0;
            const isOnline = (now - lastUpdate) < 10000;
            const status = isOnline ? (v.status === 'moving' ? 'moving' : 'online') : 'offline';
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';
            const carColor = status === 'moving' ? '#fbbf24' : status === 'online' ? '#22c55e' : '#ef4444';

            // تصميم أيقونة السيارة
            const customIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `
                    <div style="width:40px; height:40px; border-radius:50%; background-color:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center;">
                        <svg viewBox="0 0 40 40" width="30" height="30">
                            <path d="M5 14 L8 8 L32 8 L35 14 L35 26 L32 28 L28 28 L28 26 L12 26 L12 28 L8 28 L5 26 Z" fill="${carColor}" stroke="#fff" stroke-width="1.5"/>
                            <path d="M12 8 L14 4 L26 4 L28 8 Z" fill="${carColor}" stroke="#fff" stroke-width="1.5"/>
                        </svg>
                    </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20],
                popupAnchor: [0, -20]
            });

            const popupContent = `
                <div class="map-popup text-right" style="font-family: Cairo, sans-serif; min-width: 150px;">
                    <div class="font-bold text-lg mb-2" style="color: #333;">👤 ${v.displayName || 'غير معروف'}</div>
                    <div class="text-sm mb-1" style="color: #666;">🚀 السرعة: ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</div>
                    <div class="text-sm mb-1" style="color: #666;">🔋 البطارية: ${v.deviceHealth?.battery || '?'}%</div>
                    <div class="font-bold mt-2 ${status === 'moving' ? 'text-yellow-600' : isOnline ? 'text-green-600' : 'text-red-600'}">
                        ${status === 'moving' ? '🟢 متحرك' : isOnline ? '📶 متصل' : '🔴 غير متصل'}
                    </div>
                </div>
            `;

            // إضافة السيارة للخريطة
            const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(mapInstance);

            mapMarkers[code] = marker;
        });

        document.getElementById('mapVehiclesCount').textContent = count + ' مركبة';
    });

    liveListeners.push(ref);
}

function changeMapStyle(style) {
    if (!mapInstance) return;
    
    if (style === 'street') {
        mapInstance.removeLayer(satelliteLayer);
        streetLayer.addTo(mapInstance);
    } else if (style === 'satellite') {
        mapInstance.removeLayer(streetLayer);
        satelliteLayer.addTo(mapInstance);
    }
}

// =============================================
// 📈 سجل الحركة
// =============================================
function renderTracking() { /* الكود الأصلي */ }
function loadTracking(period) { /* الكود الأصلي */ }

// =============================================
// 🏢 إدارة الشركات والسيارات والاشتراكات (للمشرف)
// =============================================
async function renderCompanies() { /* الكود الأصلي */ }
function showAddCompany() { /* الكود الأصلي */ }
async function handleAddCompany(e) { /* الكود الأصلي */ }
async function toggleCompany(id) { /* الكود الأصلي */ }
async function deleteCompany(id) { /* الكود الأصلي */ }
function renderAdminVehicles() { /* الكود الأصلي */ }
function renderSubscriptions() { /* الكود الأصلي */ }
async function extendSubscription(id) { /* الكود الأصلي */ }
async function suspendSubscription(id) { /* الكود الأصلي */ }

// =============================================
// 🚀 بدء التطبيق
// =============================================
auth.onAuthStateChanged(async (user) => {
    console.log('🔄 onAuthStateChanged:', user ? 'مستخدم موجود' : 'لا يوجد مستخدم');
    
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
                await dbFS.collection('users').doc(user.uid).set({
                    tenantId: 'default',
                    email: user.email,
                    name: user.displayName || 'مستخدم',
                    role: 'customer',
                    status: 'active',
                    createdAt: Date.now()
                });
            }
        } catch (e) {
            console.error('❌ خطأ في جلب بيانات المستخدم:', e);
            userRole = 'customer';
            userTenantId = 'default';
        }

        showDashboard();
    } else {
        const success = await ensureAdminAccount();
        if (!success) {
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('dashboardScreen').classList.add('hidden');
        }
    }
});

// =========================================================================
// 🔥🔥🔥 الإضافات الجديدة حسب طلبك (بدون حذف أي شيء من الأكواد السابقة) 🔥🔥🔥
// =========================================================================

// =============================================
// 1️⃣ حساب المسافة بالكيلومترات (معادلة Haversine)
// =============================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // المسافة بالكيلومتر
}

// =============================================
// 2️⃣ نافذة سجل حركة السائق (خريطة + حساب كيلومترات)
// =============================================
async function showDriverHistoryMapModal(code) {
    // إنشاء عنصر النافذة المنبثقة وحقنه في الصفحة
    let modal = document.getElementById('historyMapModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'historyMapModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50';
        modal.innerHTML = `
            <div class="bg-gray-800 w-11/12 md:w-3/4 lg:w-2/3 h-5/6 rounded-xl shadow-lg flex flex-col border border-gray-600">
                <div class="p-4 flex justify-between items-center border-b border-gray-700">
                    <h3 class="text-xl font-bold text-yellow-500">🗺️ سجل حركة السائق</h3>
                    <button onclick="closeHistoryMapModal()" class="text-red-500 hover:text-red-700 font-bold text-2xl">&times;</button>
                </div>
                <div class="p-4 bg-gray-900 flex justify-between items-center text-sm text-gray-300">
                    <div>إجمالي المسافة المقطوعة: <span id="totalDistanceLabel" class="text-green-400 font-bold text-lg">0</span> كم</div>
                    <div>تاريخ اليوم: <span class="text-yellow-400">${new Date().toLocaleDateString('ar')}</span></div>
                </div>
                <div id="history-map-container" class="flex-grow w-full rounded-b-xl" style="z-index: 1;"></div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }

    // الانتظار قليلاً حتى يتم عرض الـ div في الـ DOM قبل تهيئة الخريطة
    setTimeout(async () => {
        if (historyMapInstance) {
            historyMapInstance.remove();
        }

        historyMapInstance = L.map('history-map-container').setView([30.0444, 31.2357], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(historyMapInstance);

        // جلب مسار السيارة من Firebase
        try {
            // ملاحظة: افتراض أن المواقع تتخزن في locationHistory/code (يمكن تعديل المسار حسب هيكلة قاعدتك)
            const snap = await dbRT.ref(`locationHistory/${code}`).orderByChild('timestamp').limitToLast(500).once('value');
            const data = snap.val();

            if (!data) {
                alert('لا يوجد سجل حركات مسجل لهذه السيارة اليوم.');
                return;
            }

            const points = [];
            let totalKm = 0;
            let prevPoint = null;

            Object.values(data).forEach(loc => {
                if (loc.latitude && loc.longitude) {
                    points.push([loc.latitude, loc.longitude]);
                    
                    if (prevPoint) {
                        totalKm += calculateDistance(prevPoint.lat, prevPoint.lng, loc.latitude, loc.longitude);
                    }
                    prevPoint = { lat: loc.latitude, lng: loc.longitude };
                }
            });

            document.getElementById('totalDistanceLabel').textContent = totalKm.toFixed(2);

            if (points.length > 0) {
                // رسم الخط (Polyline)
                historyPolyline = L.polyline(points, { color: 'blue', weight: 4, opacity: 0.7 }).addTo(historyMapInstance);
                historyMapInstance.fitBounds(historyPolyline.getBounds()); // توجيه الخريطة لتشمل الخط بالكامل

                // علامة البداية
                L.marker(points[0]).addTo(historyMapInstance).bindPopup('🏁 نقطة البداية');
                // علامة النهاية
                L.marker(points[points.length - 1]).addTo(historyMapInstance).bindPopup('📍 نقطة النهاية (الحالية)');
            }

        } catch (error) {
            console.error('Error fetching history:', error);
            alert('حدث خطأ أثناء جلب السجل.');
        }
    }, 300);
}

function closeHistoryMapModal() {
    const modal = document.getElementById('historyMapModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    if (historyMapInstance) {
        historyMapInstance.remove();
        historyMapInstance = null;
    }
}

// =============================================
// 3️⃣ دالة تسجيل الدخول المخصص (يوزر وباسورد للعمال والشركات من قاعدة البيانات)
// تم تجهيزها لصفحة الأدمن والعمال المستقبلية
// =============================================
async function handleCustomDatabaseLogin(username, password) {
    try {
        // البحث عن المستخدم في مجموعة users باستخدام اليوزر نيم
        const usersRef = dbFS.collection('users');
        const querySnapshot = await usersRef.where('username', '==', username).where('password', '==', password).get();

        if (querySnapshot.empty) {
            throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
        }

        const userData = querySnapshot.docs[0].data();
        const userId = querySnapshot.docs[0].id;

        // التحقق من حالة اشتراك الشركة التابع لها العامل
        const tenantRef = await dbFS.collection('tenants').doc(userData.tenantId).get();
        if (!tenantRef.exists) {
            throw new Error("بيانات الشركة غير موجودة.");
        }

        const tenantData = tenantRef.data();
        if (tenantData.subscriptionStatus !== 'active') {
            throw new Error("اشتراك الشركة منتهي أو متوقف، يرجى التواصل مع الإدارة.");
        }

        // إعداد متغيرات الجلسة محلياً (Custom Session)
        currentUser = { uid: userId, displayName: userData.name, email: userData.email || username };
        currentUserId = userId;
        userRole = userData.role || 'worker'; // worker, company_admin, etc.
        userTenantId = userData.tenantId;

        alert(`مرحباً بك ${userData.name}! تم تسجيل الدخول بنجاح.`);
        
        // إخفاء شاشة اللوجين وفتح لوحة التحكم (الخاصة بالعمال أو الشركة)
        showDashboard(); 

    } catch (error) {
        showGlobalError(error.message);
    }
}

// =============================================
// 4️⃣ دالة إنشاء حساب جيميل (لصفحة الـ Index المستقبلية)
// =============================================
async function handleIndexGmailSignup(email, password, companyName, ownerName, phone) {
    try {
        // 1. إنشاء حساب في Firebase Auth
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;

        await userCred.user.updateProfile({ displayName: ownerName });

        // 2. إنشاء Tenant (شركة) جديدة في قاعدة البيانات
        const newTenantId = 'tenant_' + Date.now();
        await dbFS.collection('tenants').doc(newTenantId).set({
            name: companyName,
            ownerName: ownerName,
            email: email,
            phone: phone || '',
            status: 'active',
            subscriptionStatus: 'active', // يمكن جعلها تجريبية trail
            vehiclesCount: 0,
            createdAt: Date.now()
        });

        // 3. حفظ بيانات المستخدم كأدمن لهذه الشركة
        await dbFS.collection('users').doc(uid).set({
            tenantId: newTenantId,
            email: email,
            name: ownerName,
            phone: phone || '',
            role: 'company_admin', // مدير شركة
            status: 'active',
            createdAt: Date.now()
        });

        alert('✅ تم إنشاء الحساب بنجاح! يمكنك الآن تسجيل الدخول.');
        // يمكن توجيهه لصفحة الدخول هنا
        // window.location.href = 'login.html';

    } catch (error) {
        console.error('❌ فشل إنشاء الحساب:', error.message);
        alert('فشل إنشاء الحساب: ' + error.message);
    }
}
