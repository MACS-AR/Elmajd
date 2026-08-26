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
// 🗺️ Mapbox Token (ضع توكنك هنا)
// =============================================
const MAPBOX_TOKEN = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw'; // استبدل بتوكنك

// =============================================
// 📦 المتغيرات العامة
// =============================================
let currentUser = null;
let userRole = null;
let userTenantId = null;
let allVehicles = {};
let mapInstance = null;
let mapMarkers = {};
let liveListeners = [];

// =============================================
// 🔐 إنشاء حساب أدمن تلقائي (إذا لم يكن موجوداً)
// =============================================
async function ensureAdminAccount() {
    const adminEmail = 'admin@system.com';
    const adminPassword = '123456';
    const adminName = 'المدير العام';

    try {
        // محاولة تسجيل الدخول بحساب الأدمن أولاً
        await auth.signInWithEmailAndPassword(adminEmail, adminPassword);
        console.log('✅ تم تسجيل الدخول بحساب الأدمن الموجود');
        return true;
    } catch (err) {
        // إذا لم يكن الحساب موجوداً، نقوم بإنشائه
        if (err.code === 'auth/user-not-found') {
            try {
                // إنشاء المستخدم في Firebase Auth
                const userCred = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
                const uid = userCred.user.uid;

                // تحديث اسم المستخدم
                await userCred.user.updateProfile({ displayName: adminName });

                // إنشاء وثيقة المستخدم في Firestore
                await dbFS.collection('users').doc(uid).set({
                    tenantId: 'admin_tenant',
                    email: adminEmail,
                    name: adminName,
                    phone: '0100000000',
                    role: 'admin',
                    status: 'active',
                    createdAt: Date.now()
                });

                // إنشاء وثيقة تينانت للأدمن (إذا لم تكن موجودة)
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
                
                // تسجيل الدخول تلقائياً
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

// تسجيل الدخول (يُستدعى من النموذج)
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
        
        // جلب دور المستخدم من Firestore
        const userDoc = await dbFS.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            userRole = data.role || 'customer';
            userTenantId = data.tenantId || null;
        } else {
            // إذا لم توجد وثيقة، ننشئها كعميل افتراضي
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

        // إظهار لوحة التحكم
        showDashboard();

    } catch (err) {
        errorEl.textContent = err.message || 'فشل تسجيل الدخول';
        errorEl.classList.remove('hidden');
    }
}

// تسجيل الخروج
async function handleLogout() {
    try {
        await auth.signOut();
        // إيقاف المستمعين
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

// تسجيل الدخول السريع بحساب الأدمن
async function quickLoginAdmin() {
    document.getElementById('loginEmail').value = 'admin@system.com';
    document.getElementById('loginPassword').value = '123456';
    document.getElementById('loginError').classList.add('hidden');
    
    try {
        await auth.signInWithEmailAndPassword('admin@system.com', '123456');
        // الباقي يتم في onAuthStateChanged
    } catch (err) {
        // إذا فشل، نحاول إنشاء الحساب أولاً
        await ensureAdminAccount();
        // ثم نحاول مرة أخرى
        try {
            await auth.signInWithEmailAndPassword('admin@system.com', '123456');
        } catch (e) {
            alert('فشل تسجيل الدخول السريع: ' + e.message);
        }
    }
}

// عرض لوحة التحكم بعد تسجيل الدخول
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
    }

    switch(page) {
        case 'dashboard': renderDashboard(); break;
        case 'vehicles': renderVehicles(); break;
        case 'map': renderMap(); break;
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
            <h2 class="text-2xl font-bold text-gray-800">📊 لوحة التحكم</h2>
            <span class="text-sm text-gray-500">آخر تحديث: ${new Date().toLocaleTimeString('ar')}</span>
        </div>
        <div id="statsContainer" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="stat-card bg-white rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon bg-blue-100 text-blue-600">🚗</div><div><p class="text-gray-500 text-sm">المركبات</p><p id="stat-total" class="text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card bg-white rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon bg-green-100 text-green-600">📶</div><div><p class="text-gray-500 text-sm">متصل</p><p id="stat-online" class="text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card bg-white rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon bg-blue-100 text-blue-600">🔄</div><div><p class="text-gray-500 text-sm">متحرك</p><p id="stat-moving" class="text-2xl font-bold">0</p></div></div></div>
            <div class="stat-card bg-white rounded-xl p-4 shadow-sm"><div class="flex items-center gap-3"><div class="icon bg-red-100 text-red-600">⏸️</div><div><p class="text-gray-500 text-sm">متوقف</p><p id="stat-stopped" class="text-2xl font-bold">0</p></div></div></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-4">
            <h3 class="font-bold text-gray-700 mb-3">📍 آخر المواقع</h3>
            <div id="recentLocations" class="space-y-2 text-sm text-gray-600"></div>
        </div>
    `;

    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) { updateStats(0, 0, 0, 0); return; }

        let total = 0, online = 0, moving = 0, stopped = 0;
        const recent = [];

        Object.keys(data).forEach(code => {
            const v = data[code];
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;
            
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
                    time: v.liveLocation.timestamp
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
        container.innerHTML = '<p class="text-gray-400">لا توجد مواقع حالية</p>';
        return;
    }
    container.innerHTML = list.slice(0, 10).map(item => `
        <div class="flex justify-between items-center border-b border-gray-100 py-2">
            <span>${item.name}</span>
            <span class="text-xs">${item.speed.toFixed(1)} كم/س</span>
            <span class="text-xs text-gray-400">${item.time ? new Date(item.time).toLocaleTimeString('ar') : '-'}</span>
        </div>
    `).join('');
}

// =============================================
// 🚗 سياراتي (للعميل)
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-gray-800">🚗 سياراتي</h2>
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
            list.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
            return;
        }

        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const status = v.status || 'offline';
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';
            const statusText = status === 'online' ? 'متصل' : status === 'moving' ? 'متحرك' : 'غير متصل';
            const loc = v.liveLocation || {};

            html += `
                <div class="vehicle-card ${statusClass} rounded-xl p-4 shadow-sm">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gray-800">${v.displayName || code}</h4>
                            <p class="text-sm text-gray-500">كود: ${code}</p>
                            <p class="text-sm text-gray-500">${v.phone || 'لا يوجد هاتف'}</p>
                        </div>
                        <span class="status-dot ${statusClass}"></span>
                    </div>
                    <div class="mt-2 text-sm text-gray-600 grid grid-cols-2 gap-1">
                        <span>🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</span>
                        <span>🔋 ${v.deviceHealth?.battery || '?'}%</span>
                        <span>📍 ${loc.latitude ? loc.latitude.toFixed(4) + ', ' + loc.longitude.toFixed(4) : 'لا يوجد'}</span>
                        <span class="text-xs text-gray-400">${statusText}</span>
                    </div>
                    ${userRole === 'admin' ? `<div class="mt-2 text-xs text-gray-400">الشركة: ${v.tenantId || 'غير محدد'}</div>` : ''}
                </div>
            `;
        });

        list.innerHTML = html || '<p class="text-gray-400 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
    });

    liveListeners.push(ref);
}

// =============================================
// ➕ إضافة سيارة (مودال)
// =============================================
function showAddVehicle() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'addVehicleModal';
    overlay.innerHTML = `
        <div class="modal-box">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-gray-800">➕ إضافة سيارة جديدة</h3>
                <button onclick="document.getElementById('addVehicleModal').remove()" class="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <form onsubmit="handleAddVehicle(event)">
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">كود الدخول (4 أرقام)</label>
                    <input id="newCode" type="number" min="1000" max="9999" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">اسم السائق</label>
                    <input id="newName" type="text" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">رقم الهاتف</label>
                    <input id="newPhone" type="tel" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
            <h2 class="text-2xl font-bold text-gray-800">🗺️ الخريطة المباشرة</h2>
            <span id="mapVehiclesCount" class="text-sm text-gray-500">0 مركبة</span>
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
        style: 'mapbox://styles/mapbox/streets-v12',
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
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const loc = v.liveLocation;
            if (!loc || !loc.latitude || !loc.longitude) return;

            count++;
            const status = v.status || 'offline';
            const statusClass = status === 'online' ? 'online' : status === 'moving' ? 'moving' : 'offline';

            const el = document.createElement('div');
            el.className = `map-marker ${statusClass}`;
            el.innerHTML = `<div style="width:100%;height:100%;border-radius:50%;background:inherit;"></div>`;

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([loc.longitude, loc.latitude])
                .setPopup(new mapboxgl.Popup({ offset: 25 })
                    .setHTML(`
                        <div class="map-popup">
                            <div class="name">${v.displayName || code}</div>
                            <div class="detail">🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</div>
                            <div class="detail">🔋 ${v.deviceHealth?.battery || '?'}%</div>
                            <div class="detail">${status === 'moving' ? '🟢 متحرك' : status === 'online' ? '📶 متصل' : '🔴 غير متصل'}</div>
                            ${userRole === 'admin' ? `<div class="detail text-xs">🏢 ${v.tenantId || '-'}</div>` : ''}
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
// 🏢 إدارة الشركات (للمشرف فقط)
// =============================================
async function renderCompanies() {
    const container = document.getElementById('page-admin-companies');
    if (!container || userRole !== 'admin') return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-800">🏢 الشركات</h2>
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
                    <tr><td colspan="7" class="text-center text-gray-400">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbFS.collection('tenants').onSnapshot((snap) => {
        const tbody = document.getElementById('companiesTableBody');
        if (!tbody) return;

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400">لا توجد شركات</td></tr>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const data = doc.data();
            html += `
                <tr>
                    <td class="font-medium">${data.name || 'غير مسمى'}</td>
                    <td>${data.ownerName || '-'}</td>
                    <td>${data.phone || '-'}</td>
                    <td>${data.vehiclesCount || 0}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${data.subscriptionStatus === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${data.subscriptionStatus === 'active' ? 'نشط' : 'منتهي'}</span></td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${data.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}">${data.status === 'active' ? 'نشطة' : 'موقفة'}</span></td>
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
                <h3 class="text-xl font-bold text-gray-800">🏢 إضافة شركة جديدة</h3>
                <button onclick="document.getElementById('addCompanyModal').remove()" class="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>
            <form onsubmit="handleAddCompany(event)">
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">اسم الشركة *</label>
                    <input id="compName" type="text" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">المسؤول *</label>
                    <input id="compOwner" type="text" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">البريد الإلكتروني *</label>
                    <input id="compEmail" type="email" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">كلمة المرور *</label>
                    <input id="compPassword" type="password" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div class="mb-3">
                    <label class="block text-sm font-bold text-gray-700 mb-1">الهاتف</label>
                    <input id="compPhone" type="tel" class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
        <h2 class="text-2xl font-bold text-gray-800 mb-6">🌍 جميع السيارات</h2>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>الكود</th>
                        <th>السائق</th>
                        <th>الشركة</th>
                        <th>الهاتف</th>
                        <th>الحالة</th>
                        <th>السرعة</th>
                        <th>البطارية</th>
                        <th>آخر تحديث</th>
                    </tr>
                </thead>
                <tbody id="adminVehiclesBody">
                    <tr><td colspan="8" class="text-center text-gray-400">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbRT.ref('vehicleDrivers').on('value', (snap) => {
        const data = snap.val();
        const tbody = document.getElementById('adminVehiclesBody');
        if (!tbody) return;

        if (!data) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">لا توجد سيارات</td></tr>';
            return;
        }

        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            const loc = v.liveLocation || {};
            const status = v.status || 'offline';
            const statusText = status === 'moving' ? '🟢 متحرك' : status === 'online' ? '📶 متصل' : '🔴 غير متصل';

            html += `
                <tr>
                    <td class="font-mono font-bold">${code}</td>
                    <td>${v.displayName || '-'}</td>
                    <td class="text-xs">${v.tenantId || '-'}</td>
                    <td>${v.phone || '-'}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${status === 'moving' ? 'bg-blue-100 text-blue-700' : status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${statusText}</span></td>
                    <td>${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</td>
                    <td>${v.deviceHealth?.battery || '?'}%</td>
                    <td class="text-xs">${loc.timestamp ? new Date(loc.timestamp).toLocaleString('ar') : '-'}</td>
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
        <h2 class="text-2xl font-bold text-gray-800 mb-6">📋 إدارة الاشتراكات</h2>
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
                    <tr><td colspan="7" class="text-center text-gray-400">جاري التحميل...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    dbFS.collection('subscriptions').onSnapshot(async (snap) => {
        const tbody = document.getElementById('subscriptionsBody');
        if (!tbody) return;

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400">لا توجد اشتراكات</td></tr>';
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
            const statusClass = status === 'active' ? 'bg-green-100 text-green-700' : status === 'trial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';

            html += `
                <tr>
                    <td class="font-medium">${tenantName}</td>
                    <td>${data.planName || 'قياسي'}</td>
                    <td class="text-sm">${data.startDate ? new Date(data.startDate).toLocaleDateString('ar') : '-'}</td>
                    <td class="text-sm">${data.endDate ? new Date(data.endDate).toLocaleDateString('ar') : '-'}</td>
                    <td><span class="px-2 py-1 rounded-full text-xs ${statusClass}">${statusText}</span></td>
                    <td>${data.amount || 0} ج.م</td>
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

        showDashboard();
    } else {
        // محاولة إنشاء حساب الأدمن تلقائياً ثم تسجيل الدخول
        const success = await ensureAdminAccount();
        if (!success) {
            // إذا فشل، نعرض شاشة تسجيل الدخول مع زر سريع
            document.getElementById('loginScreen').classList.remove('hidden');
            document.getElementById('dashboardScreen').classList.add('hidden');
        }
        // إذا نجح، سيعيد تشغيل onAuthStateChanged مع المستخدم
    }
});

console.log('🚗 نظام التتبع جاهز!');
