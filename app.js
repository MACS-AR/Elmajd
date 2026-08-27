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

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
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

let mapInstance = null;
let mapMarkers = {};
let streetLayer = null;
let satelliteLayer = null;
let livePathPolylines = {};

let liveListeners = [];

let historyMapInstance = null;
let historyPolyline = null;
let selectedPaymentMethod = null;

// =============================================
// 🔧 دالة مساعدة لتوليد UUID
// =============================================
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// =============================================
// 🔐 التأكد من وجود حساب الأدمن (بدون فرض الدخول)
// =============================================
async function ensureAdminAccount() {
    const adminEmail = 'admin@system.com';
    const adminPassword = '123456';
    const adminName = 'المدير العام';
    const adminTenantId = 'admin_tenant_primary';

    try {
        const adminDoc = await dbFS.collection('users').where('email', '==', adminEmail).get();
        if (adminDoc.empty) {
            const userCred = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
            const uid = userCred.user.uid;
            await userCred.user.updateProfile({ displayName: adminName });

            await dbFS.collection('users').doc(uid).set({
                tenantId: adminTenantId,
                email: adminEmail,
                name: adminName,
                phone: '0100000000',
                username: 'admin',
                password: adminPassword,
                role: 'admin',
                status: 'active',
                createdAt: Date.now()
            });

            await dbFS.collection('tenants').doc(adminTenantId).set({
                name: 'منصة التتبع الرئيسية',
                ownerName: adminName,
                email: adminEmail,
                phone: '0100000000',
                username: 'admin',
                password: adminPassword,
                status: 'active',
                subscriptionStatus: 'active',
                subscriptionPeriod: 'year',
                trialEndDate: 0,
                subscriptionEndDate: Date.now() + (365 * 24 * 60 * 60 * 1000),
                paymentMethod: null,
                paymentStatus: 'paid',
                lastPaymentDate: Date.now(),
                vehiclesCount: 0,
                createdAt: Date.now()
            });
            console.log('✅ تم إنشاء حساب الأدمن التلقائي بنجاح');
        }
    } catch (err) {
        console.log('ℹ️ حساب الأدمن موجود أو حدث تنبيه:', err.message);
    }
}

// =============================================
// 🔐 إنشاء حساب تجريبي
// =============================================
async function createDemoAccount() {
    const demoEmail = `demo_${Date.now()}@gmail.com`;
    const demoPassword = '123456';
    const demoName = 'عميل تجريبي';

    try {
        const userCred = await auth.createUserWithEmailAndPassword(demoEmail, demoPassword);
        const uid = userCred.user.uid;

        await userCred.user.updateProfile({ displayName: demoName });

        const tenantId = generateUUID();
        const now = Date.now();
        await dbFS.collection('tenants').doc(tenantId).set({
            name: 'شركة تجريبية',
            ownerName: demoName,
            email: demoEmail,
            phone: '0100000000',
            username: demoEmail,
            password: demoPassword,
            status: 'active',
            subscriptionStatus: 'trial',
            subscriptionPeriod: 'month',
            trialEndDate: now + (15 * 24 * 60 * 60 * 1000),
            subscriptionEndDate: now + (15 * 24 * 60 * 60 * 1000),
            paymentMethod: null,
            paymentStatus: 'none',
            lastPaymentDate: now,
            vehiclesCount: 0,
            createdAt: now
        });

        await dbFS.collection('users').doc(uid).set({
            tenantId: tenantId,
            email: demoEmail,
            name: demoName,
            phone: '0100000000',
            username: demoEmail,
            password: demoPassword,
            role: 'company_admin',
            status: 'active',
            createdAt: now
        });

        alert(`✅ تم إنشاء الحساب التجريبي بنجاح!\nالبريد: ${demoEmail}\nكلمة المرور: ${demoPassword}`);

    } catch (err) {
        alert('❌ فشل إنشاء الحساب التجريبي: ' + err.message);
    }
}

// =============================================
// ⚠️ عرض رسائل الخطأ العامة
// =============================================
function showGlobalError(message) {
    const errorEl = document.getElementById('globalError');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
        setTimeout(() => errorEl.classList.add('hidden'), 8000);
    } else {
        alert(message);
    }
}

// =============================================
// 🔐 تسجيل الدخول
// =============================================
async function handleLogin(e) {
    if (e) e.preventDefault();
    const loginType = document.getElementById('loginType')?.value || 'firebase';
    const loginInput = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');

    if (errorEl) errorEl.classList.add('hidden');

    if (!loginInput || !password) {
        if (errorEl) {
            errorEl.textContent = 'الرجاء إدخال البيانات المطلوبة كاملة';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (loginType === 'custom') {
        await handleCustomDatabaseLogin(loginInput, password);
    } else {
        try {
            const cred = await auth.signInWithEmailAndPassword(loginInput, password);
            currentUser = cred.user;
            currentUserId = cred.user.uid;

            const userDoc = await dbFS.collection('users').doc(currentUser.uid).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                userRole = data.role || 'company_admin';
                userTenantId = data.tenantId || null;
            } else {
                userRole = 'company_admin';
                userTenantId = generateUUID();
                await dbFS.collection('users').doc(currentUser.uid).set({
                    tenantId: userTenantId,
                    email: currentUser.email,
                    name: currentUser.displayName || 'مستخدم جديد',
                    role: 'company_admin',
                    status: 'active',
                    createdAt: Date.now()
                });
            }

            if (userRole !== 'admin' && userTenantId) {
                const check = await checkSubscriptionStatus(userTenantId);
                if (!check.valid) {
                    showSubscriptionExpiredScreen(check.tenantData);
                    return;
                }
            }

            showDashboard();
        } catch (err) {
            if (errorEl) {
                errorEl.textContent = 'بيانات الدخول غير صحيحة أو الحساب غير موجود';
                errorEl.classList.remove('hidden');
            }
        }
    }
}

// =============================================
// 🔍 التحقق من حالة الاشتراك
// =============================================
async function checkSubscriptionStatus(tenantId) {
    try {
        const tenantDoc = await dbFS.collection('tenants').doc(tenantId).get();
        if (!tenantDoc.exists) {
            return { valid: false, reason: 'tenant_not_found' };
        }

        const tenantData = tenantDoc.data();
        const now = Date.now();

        if (tenantData.subscriptionStatus === 'suspended') {
            return { valid: false, reason: 'suspended', tenantData };
        }

        if (tenantData.subscriptionStatus === 'trial') {
            if (now > tenantData.trialEndDate) {
                return { valid: false, reason: 'trial_expired', tenantData };
            }
            return {
                valid: true,
                reason: 'trial_active',
                tenantData,
                daysRemaining: Math.ceil((tenantData.trialEndDate - now) / (24 * 60 * 60 * 1000))
            };
        }

        if (tenantData.subscriptionStatus === 'active') {
            if (now > tenantData.subscriptionEndDate) {
                return { valid: false, reason: 'subscription_expired', tenantData };
            }
            return {
                valid: true,
                reason: 'subscription_active',
                tenantData,
                daysRemaining: Math.ceil((tenantData.subscriptionEndDate - now) / (24 * 60 * 60 * 1000))
            };
        }

        return { valid: false, reason: 'subscription_inactive', tenantData };

    } catch (error) {
        console.error('❌ خطأ في التحقق من الاشتراك:', error);
        return { valid: false, reason: 'error' };
    }
}

// =============================================
// 💳 عرض شاشة انتهاء الاشتراك
// =============================================
function showSubscriptionExpiredScreen(tenantData) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
    document.getElementById('subscriptionExpiredScreen').classList.remove('hidden');

    document.getElementById('subscriptionCompanyName').textContent = tenantData?.name || 'شركتك';
    
    let reasonText = 'انتهى اشتراكك';
    if (tenantData?.subscriptionStatus === 'trial') reasonText = 'انتهت الفترة التجريبية (15 يوم)';
    else if (tenantData?.subscriptionStatus === 'suspended') reasonText = 'تم إيقاف حسابك من قِبل الإدارة';

    document.getElementById('subscriptionStatus').textContent = reasonText;

    const paymentMethodsHTML = `
        <div class="grid grid-cols-2 gap-4 mt-4">
            <button onclick="selectPaymentMethod('vodafone_cash')" class="bg-red-600 hover:bg-red-700 text-white p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2">
                <span class="text-2xl">📱</span> فودافون كاش
            </button>
            <button onclick="selectPaymentMethod('instapay')" class="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-xl font-bold flex flex-col items-center justify-center gap-2">
                <span class="text-2xl">🏦</span> انستا باي
            </button>
        </div>
        <div id="paymentDetails" class="mt-4 hidden bg-gray-900 p-4 rounded-xl border border-gray-700">
            <h4 class="font-bold text-yellow-500 mb-2">بيانات التحويل:</h4>
            <div id="paymentAccountDetails" class="text-sm text-gray-300"></div>
            <input type="text" id="transactionNumber" placeholder="أدخل رقم عملية التحويل / الإشعار" class="w-full mt-3 p-2 rounded bg-gray-800 text-white border border-gray-600">
            <button onclick="submitPaymentRequest()" class="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded-lg">
                ✅ تأكيد وإرسال طلب التفعيل
            </button>
        </div>
    `;

    document.getElementById('paymentMethodsContainer').innerHTML = paymentMethodsHTML;
}

// =============================================
// 💳 اختيار طريقة الدفع
// =============================================
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    const paymentDetails = document.getElementById('paymentDetails');
    const paymentAccountDetails = document.getElementById('paymentAccountDetails');

    paymentDetails.classList.remove('hidden');

    if (method === 'vodafone_cash') {
        paymentAccountDetails.innerHTML = `
            <p>رقم فودافون كاش للتحويل: <strong class="text-yellow-400 text-base">01000000000</strong></p>
            <p class="text-xs text-gray-400 mt-1">يرجى تحويل مبلغ الاشتراك ثم إدخال رقم العملية للتأكيد.</p>
        `;
    } else if (method === 'instapay') {
        paymentAccountDetails.innerHTML = `
            <p>عنوان انستا باي (IPA): <strong class="text-yellow-400 text-base">tracking@instapay</strong></p>
            <p class="text-xs text-gray-400 mt-1">يرجى تحويل مبلغ الاشتراك ثم إدخال مرجع التحويل للتأكيد.</p>
        `;
    }
}

// =============================================
// 💳 إرسال طلب الدفع للأدمن
// =============================================
async function submitPaymentRequest() {
    const transactionNumber = document.getElementById('transactionNumber').value.trim();

    if (!transactionNumber) {
        alert('الرجاء إدخال رقم التحويل');
        return;
    }

    if (!selectedPaymentMethod) {
        alert('الرجاء اختيار طريقة الدفع أولاً');
        return;
    }

    if (!userTenantId) {
        alert('تعذر تحديد معرف الشركة');
        return;
    }

    try {
        await dbFS.collection('tenants').doc(userTenantId).update({
            paymentMethod: selectedPaymentMethod,
            paymentStatus: 'pending',
            lastTransactionNumber: transactionNumber,
            lastPaymentRequestDate: Date.now()
        });

        await dbFS.collection('adminNotifications').add({
            type: 'payment_request',
            tenantId: userTenantId,
            tenantName: document.getElementById('subscriptionCompanyName').textContent,
            amount: 500,
            paymentMethod: selectedPaymentMethod,
            transactionNumber: transactionNumber,
            status: 'pending',
            createdAt: Date.now()
        });

        alert('✅ تم إرسال طلب التجديد بنجاح!\nسيتم مراجعته وتفعيل الحساب في أقرب وقت.');
        handleLogout();

    } catch (error) {
        console.error('❌ فشل إرسال طلب الدفع:', error);
        alert('فشل إرسال طلب الدفع: ' + error.message);
    }
}

// =============================================
// 🔐 تسجيل الخروج
// =============================================
async function handleLogout() {
    try {
        liveListeners.forEach(ref => ref.off && ref.off());
        liveListeners = [];

        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }

        await auth.signOut();

        currentUser = null;
        currentUserId = null;
        userRole = null;
        userTenantId = null;

        document.getElementById('dashboardScreen').classList.add('hidden');
        document.getElementById('subscriptionExpiredScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = '';
        if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';
    } catch (err) {
        alert('خطأ في الخروج: ' + err.message);
    }
}

// =============================================
// 🖥️ عرض لوحة التحكم وتحديث الواجهة
// =============================================
function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('subscriptionExpiredScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');

    document.getElementById('userName').textContent = `مرحباً، ${currentUser?.displayName || 'المستخدم'}`;

    let roleText = 'شركة / فرد';
    if (userRole === 'admin') roleText = 'المدير العام';
    else if (userRole === 'worker') roleText = 'موظف';

    document.getElementById('userRole').textContent = roleText;

    if (userRole === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    }

    showPage('dashboard');
}

// =============================================
// 📄 التنقل بين الصفحات
// =============================================
function showPage(page) {
    document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'));

    const target = document.getElementById(`page-${page}`);
    if (target) {
        target.classList.remove('hidden');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'bg-yellow-500', 'text-black'));
        document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add('active', 'bg-yellow-500', 'text-black'));
    }

    switch (page) {
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
// 📊 عرض وتحديث إحصائيات لوحة التحكم (معزولة لكل شركة)
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
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-yellow-500 text-2xl">🚗</div><div><p class="stat-label text-sm text-gray-400">إجمالي السيارات</p><p id="stat-total" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-green-500 text-2xl">📶</div><div><p class="stat-label text-sm text-gray-400">متصل الآن</p><p id="stat-online" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-yellow-400 text-2xl">🔄</div><div><p class="stat-label text-sm text-gray-400">في حالة حركة</p><p id="stat-moving" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-red-500 text-2xl">⏸️</div><div><p class="stat-label text-sm text-gray-400">متوقف / غير متصل</p><p id="stat-stopped" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
        </div>
        <div class="bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-700">
            <h3 class="font-bold text-yellow-500 mb-3">📍 التتبع المباشر للسائقين <span class="text-xs text-gray-400 font-normal">(اضغط للتركيز على الخريطة)</span></h3>
            <div id="recentLocations" class="space-y-2 text-sm text-gray-300"></div>
        </div>
    `;

    // 🔒 استعلام معزول بـ tenantId
    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId);
    }

    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) { updateStats(0, 0, 0, 0); renderRecent([]); return; }

        let total = 0, online = 0, moving = 0, stopped = 0;
        const recent = [];
        const now = Date.now();

        Object.keys(data).forEach(code => {
            const v = data[code];
            total++;
            const lastUpdate = v.liveLocation?.timestamp || 0;
            const isOnline = (now - lastUpdate) < 15000;
            const isMoving = isOnline && (v.liveLocation?.speed > 2 || v.status === 'moving');

            if (isMoving) { moving++; online++; }
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
    if (document.getElementById('stat-total')) document.getElementById('stat-total').textContent = total;
    if (document.getElementById('stat-online')) document.getElementById('stat-online').textContent = online;
    if (document.getElementById('stat-moving')) document.getElementById('stat-moving').textContent = moving;
    if (document.getElementById('stat-stopped')) document.getElementById('stat-stopped').textContent = stopped;
}

function renderRecent(list) {
    const container = document.getElementById('recentLocations');
    if (!container) return;
    if (list.length === 0) {
        container.innerHTML = '<p class="text-gray-500 py-4 text-center">لا يوجد سائقين نشطين حالياً</p>';
        return;
    }
    container.innerHTML = list.map(item => `
        <div class="flex justify-between items-center border-b border-gray-700 py-2 cursor-pointer hover:bg-gray-700 px-3 rounded-lg transition" onclick="focusOnVehicle('${item.code}', ${item.lat}, ${item.lng})">
            <span class="font-bold text-yellow-500">${item.name}</span>
            <span class="text-xs ${item.isOnline ? 'text-green-400' : 'text-gray-500'}">${item.isOnline ? '🟢 متصل' : '🔴 غير متصل'}</span>
            <span class="text-xs text-yellow-400 font-mono">${item.speed.toFixed(1)} كم/س</span>
            <span class="text-xs text-gray-400">${item.time ? new Date(item.time).toLocaleTimeString('ar') : '-'}</span>
        </div>
    `).join('');
}

function focusOnVehicle(code, lat, lng) {
    showPage('map');
    setTimeout(() => {
        if (mapInstance) {
            if (lat && lng) {
                mapInstance.setView([lat, lng], 16);
            }
            if (mapMarkers[code]) {
                mapMarkers[code].openPopup();
            }
        }
    }, 400);
}

// =============================================
// 🚗 قائمة سيارات الشركة وإدارتها
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🚗 سائقين الشركة</h2>
            <button onclick="showAddVehicleModal()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2">
                <span>➕</span> إضافة سائق جديد
            </button>
        </div>
        <div id="vehiclesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    `;

    // 🔒 استعلام معزول بـ tenantId
    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId);
    }

    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        const list = document.getElementById('vehiclesList');
        if (!list) return;

        if (!data) {
            list.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">لا يوجد سائقين مسجلين لهذه الشركة بعد.</p>';
            return;
        }

        const now = Date.now();
        let html = '';
        Object.keys(data).forEach(code => {
            const v = data[code];
            const lastUpdate = v.liveLocation?.timestamp || 0;
            const isOnline = (now - lastUpdate) < 15000;
            const statusText = isOnline ? (v.liveLocation?.speed > 2 ? 'متحرك' : 'متصل') : 'غير متصل';
            const statusColor = isOnline ? (v.liveLocation?.speed > 2 ? 'bg-yellow-400' : 'bg-green-500') : 'bg-red-500';
            const loc = v.liveLocation || {};

            html += `
                <div class="bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-700 flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <h4 class="font-bold text-white text-lg">${v.displayName || 'سائق'}</h4>
                                <p class="text-xs text-yellow-500 font-mono">كود الدخول: ${code}</p>
                                <p class="text-xs text-gray-400 font-mono">كود التفعيل: ${v.activationCode || code}</p>
                            </div>
                            <span class="w-3 h-3 rounded-full ${statusColor}" title="${statusText}"></span>
                        </div>
                        <div class="text-xs text-gray-300 grid grid-cols-2 gap-2 bg-gray-900 p-2 rounded-lg my-3">
                            <span>📱 ${v.phone || 'بدون هاتف'}</span>
                            <span>🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</span>
                            <span>🔋 البطارية: ${v.deviceHealth?.battery || '?'}%</span>
                            <span class="${isOnline ? 'text-green-400' : 'text-gray-500'}">${statusText}</span>
                        </div>
                    </div>
                    <div class="flex gap-1 flex-wrap mt-2">
                        <button onclick="focusOnVehicle('${code}', ${loc.latitude}, ${loc.longitude})" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1.5 rounded">📍 خريطة</button>
                        <button onclick="showDriverDetails('${code}')" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1.5 rounded">📋 تفاصيل</button>
                        <button onclick="showDriverHistoryMapModal('${code}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1.5 rounded">🗺️ المسار</button>
                        <button onclick="showEditVehicleModal('${code}')" class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-2 py-1.5 rounded">✏️ تعديل</button>
                        <button onclick="deleteVehicle('${code}')" class="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1.5 rounded">🗑️ حذف</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html || '<p class="text-gray-500 col-span-full text-center py-8">لا يوجد سائقين مسجلين لهذه الشركة بعد.</p>';
    });

    liveListeners.push(ref);
}

// =============================================
// 🪟 نافذة إضافة سائق
// =============================================
function showAddVehicleModal() {
    closeModal('vehicleModal');
    const modal = document.createElement('div');
    modal.id = 'vehicleModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-gray-800 w-full max-w-md rounded-xl shadow-lg border border-gray-600 overflow-hidden">
            <div class="p-4 flex justify-between items-center border-b border-gray-700 bg-gray-900">
                <h3 class="text-lg font-bold text-yellow-500">➕ إضافة سائق جديد لشركتك</h3>
                <button onclick="closeModal('vehicleModal')" class="text-red-500 hover:text-red-700 font-bold text-2xl">&times;</button>
            </div>
            <div class="p-4 space-y-3">
                <div>
                    <label class="block text-xs mb-1 text-gray-400">اسم السائق *</label>
                    <input type="text" id="vehicleName" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" placeholder="مثال: أحمد محمود">
                </div>
                <div>
                    <label class="block text-xs mb-1 text-gray-400">رقم الهاتف</label>
                    <input type="tel" id="vehiclePhone" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" placeholder="010xxxxxxxx">
                </div>
                <div>
                    <label class="block text-xs mb-1 text-gray-400">كود معرف السائق (Driver Code) *</label>
                    <input type="text" id="vehicleCode" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" placeholder="مثال: DRV-101">
                </div>
                <div>
                    <label class="block text-xs mb-1 text-gray-400">كود التفعيل للتطبيق (Activation Code)</label>
                    <input type="text" id="vehicleActivationCode" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" placeholder="اتركه فارغاً ليستنسخ كود المعرف">
                </div>
                <button onclick="submitNewVehicle()" class="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg">
                    حفظ وبيانات السائق
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// =============================================
// 🪟 نافذة تعديل سائق
// =============================================
function showEditVehicleModal(code) {
    dbRT.ref(`vehicleDrivers/${code}`).once('value', snap => {
        const v = snap.val();
        if (!v) return;

        closeModal('vehicleModal');
        const modal = document.createElement('div');
        modal.id = 'vehicleModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-gray-800 w-full max-w-md rounded-xl shadow-lg border border-gray-600 overflow-hidden">
                <div class="p-4 flex justify-between items-center border-b border-gray-700 bg-gray-900">
                    <h3 class="text-lg font-bold text-yellow-500">✏️ تعديل بيانات السائق</h3>
                    <button onclick="closeModal('vehicleModal')" class="text-red-500 hover:text-red-700 font-bold text-2xl">&times;</button>
                </div>
                <div class="p-4 space-y-3">
                    <div>
                        <label class="block text-xs mb-1 text-gray-400">اسم السائق *</label>
                        <input type="text" id="vehicleName" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" value="${v.displayName || ''}">
                    </div>
                    <div>
                        <label class="block text-xs mb-1 text-gray-400">رقم الهاتف</label>
                        <input type="tel" id="vehiclePhone" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm" value="${v.phone || ''}">
                    </div>
                    <button onclick="submitEditVehicle('${code}')" class="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 rounded-lg">
                        حفظ التعديلات
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    });
}

// =============================================
// 🪟 حفظ سائق جديد + ربط كود التفعيل بالـ Tenant ID
// =============================================
function submitNewVehicle() {
    const name = document.getElementById('vehicleName').value.trim();
    const phone = document.getElementById('vehiclePhone').value.trim();
    const code = document.getElementById('vehicleCode').value.trim();
    const activationCode = document.getElementById('vehicleActivationCode').value.trim() || code;

    if (!name || !code) {
        alert('يرجى إدخال اسم السائق وكود المعرف.');
        return;
    }

    if (!userTenantId) {
        alert('حدث خطأ في تحديد رقم الشركة. يرجى تسجيل الدخول مجدداً.');
        return;
    }

    const payload = {
        displayName: name,
        phone: phone || '',
        tenantId: userTenantId,
        activationCode: activationCode,
        createdAt: Date.now(),
        status: 'offline'
    };

    // 1. حفظ بيانات السائق
    dbRT.ref(`vehicleDrivers/${code}`).set(payload)
        .then(() => {
            // 2. ربط كود التفعيل لتسهيل دخول تطبيق الأندرويد
            return dbRT.ref(`activationCodes/${activationCode}`).set({
                tenantId: userTenantId,
                vehicleCode: code
            });
        })
        .then(() => {
            closeModal('vehicleModal');
            alert('✅ تم إضافة السائق وربطه بشركتك بنجاح!');
        })
        .catch(err => {
            alert('❌ خطأ أثناء الإضافة: ' + err.message);
        });
}

function submitEditVehicle(code) {
    const name = document.getElementById('vehicleName').value.trim();
    const phone = document.getElementById('vehiclePhone').value.trim();

    if (!name) {
        alert('يرجى إدخال اسم السائق');
        return;
    }

    dbRT.ref(`vehicleDrivers/${code}`).update({
        displayName: name,
        phone: phone || ''
    }).then(() => {
        closeModal('vehicleModal');
        alert('✅ تم تحديث بيانات السائق!');
    }).catch(err => {
        alert('❌حدث خطأ أثناء التعديل: ' + err.message);
    });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove();
}

async function deleteVehicle(code) {
    const snap = await dbRT.ref(`vehicleDrivers/${code}`).once('value');
    const v = snap.val();
    if (!v) return;

    if (userRole !== 'admin' && v.tenantId !== userTenantId) {
        alert('غير مصرح لك بحذف هذا السائق.');
        return;
    }

    if (confirm(`هل أنت متأكد من حذف السائق (${v.displayName || code})؟`)) {
        try {
            await dbRT.ref(`vehicleDrivers/${code}`).remove();
            if (v.activationCode) {
                await dbRT.ref(`activationCodes/${v.activationCode}`).remove();
            }
            alert('✅ تم الحذف بنجاح.');
        } catch (err) {
            alert('❌ فشل الحذف: ' + err.message);
        }
    }
}

function showDriverDetails(code) {
    dbRT.ref(`vehicleDrivers/${code}`).once('value', snap => {
        const v = snap.val();
        if (!v) return;

        if (userRole !== 'admin' && v.tenantId !== userTenantId) {
            alert('غير مصرح لك بفرز بيانات هذا السائق.');
            return;
        }

        alert(`📋 بيانات السائق الكاملة:\n\n👤 الاسم: ${v.displayName || '-'}\n🔑 كود المعرف: ${code}\n🔓 كود التفعيل: ${v.activationCode || '-'}\n📱 الهاتف: ${v.phone || '-'}\n🏢 معرف الشركة (TenantId): ${v.tenantId || '-'}`);
    });
}

// =============================================
// 🗺️ الخريطة المباشرة
// =============================================
function renderMap() {
    const container = document.getElementById('page-map');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🗺️ الخريطة المباشرة للسيارات</h2>
            <div class="flex items-center gap-2">
                <span id="mapVehiclesCount" class="text-sm text-gray-400">0 مركبة</span>
                <select id="mapStyleSelect" class="bg-gray-700 text-white rounded p-1 text-sm border border-gray-600" onchange="changeMapStyle(this.value)">
                    <option value="street">🛣️ الشوارع</option>
                    <option value="satellite">🛰️ قمر صناعي</option>
                </select>
            </div>
        </div>
        <div id="map-container" class="w-full rounded-xl border border-gray-700" style="height: 68vh; min-height: 400px; z-index: 1;"></div>
    `;

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        mapMarkers = {};
        livePathPolylines = {};
    }

    mapInstance = L.map('map-container').setView([30.0444, 31.2357], 10);

    streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    });

    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19
    });

    streetLayer.addTo(mapInstance);

    // 🔒 استعلام معزول بـ tenantId
    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId);
    }

    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        Object.values(mapMarkers).forEach(m => mapInstance.removeLayer(m));
        mapMarkers = {};

        Object.values(livePathPolylines).forEach(p => mapInstance.removeLayer(p));
        livePathPolylines = {};

        let count = 0;
        const now = Date.now();

        Object.keys(data).forEach(code => {
            const v = data[code];
            const loc = v.liveLocation;
            if (!loc || !loc.latitude || !loc.longitude) return;

            count++;
            const lastUpdate = loc.timestamp || 0;
            const isOnline = (now - lastUpdate) < 15000;
            const isMoving = isOnline && (loc.speed > 2 || v.status === 'moving');
            const carColor = isMoving ? '#f59e0b' : isOnline ? '#22c55e' : '#ef4444';

            const customIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `
                    <div style="width:36px; height:36px; border-radius:50%; background-color:rgba(17,24,39,0.85); border:2px solid ${carColor}; display:flex; justify-content:center; align-items:center;">
                        <span style="font-size:18px;">🚗</span>
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -18]
            });

            const popupContent = `
                <div class="map-popup text-right p-1" style="font-family: Cairo, sans-serif; direction: rtl;">
                    <div class="font-bold text-base text-gray-900">👤 ${v.displayName || 'سائق'}</div>
                    <div class="text-xs text-gray-600">🚀 السرعة: ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</div>
                    <div class="text-xs text-gray-600">🔋 البطارية: ${v.deviceHealth?.battery || '?'}%</div>
                    <div class="font-bold text-xs mt-1 ${isMoving ? 'text-yellow-600' : isOnline ? 'text-green-600' : 'text-red-600'}">
                        ${isMoving ? '🟡 متحرك' : isOnline ? '🟢 متصل' : '🔴 غير متصل'}
                    </div>
                </div>
            `;

            const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(mapInstance);

            mapMarkers[code] = marker;

            const pathData = v.livePath;
            if (pathData && Array.isArray(pathData) && pathData.length > 1) {
                const pathPoints = pathData.map(p => [p.latitude, p.longitude]);
                livePathPolylines[code] = L.polyline(pathPoints, { color: carColor, weight: 4, opacity: 0.8 }).addTo(mapInstance);
            }
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
// 📈 سجل الحركة والتقارير
// =============================================
function renderTracking() {
    const container = document.getElementById('page-tracking');
    if (!container) return;

    container.innerHTML = `
        <h2 class="text-2xl font-bold text-yellow-500 mb-6">📈 تقارير وسجل حركة المركبات</h2>
        <div class="bg-gray-800 p-4 rounded-xl border border-gray-700">
            <p class="text-gray-300 text-sm mb-4">اختر النطاق الزمني لعرض تقرير حركات وسجلات سائقي الشـركة:</p>
            <div class="flex gap-2">
                <button onclick="loadTracking('today')" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded text-sm">حركة اليوم</button>
                <button onclick="loadTracking('week')" class="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded text-sm">حركة هذا الأسبوع</button>
            </div>
            <div id="trackingReportResults" class="mt-6 text-gray-300"></div>
        </div>
    `;
}

function loadTracking(period) {
    const res = document.getElementById('trackingReportResults');
    if (res) {
        res.innerHTML = `<div class="p-4 bg-gray-900 rounded border border-gray-700">📊 تم استخراج تقرير (${period === 'today' ? 'اليوم' : 'الأسبوع'}). يمكنك النقر على زر "المسار" بجانب أي سائق في صفحة السيارات لمعاينة خط السير حياً على الخريطة.</div>`;
    }
}

// =============================================
// 👑 لوحة التحكم للأدمن فقط (Admin Controls)
// =============================================
async function renderCompanies() {
    const container = document.getElementById('page-admin-companies');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-yellow-500">🏢 إدارة الشركات والاشتراكات</h2>
            <button onclick="showAddCompany()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded text-sm">➕ إضافة شركة جديدة</button>
        </div>
        <div id="companiesList" class="space-y-3"></div>
    `;

    try {
        const snap = await dbFS.collection('tenants').get();
        const list = document.getElementById('companiesList');
        if (snap.empty) {
            list.innerHTML = '<p class="text-gray-500">لا توجد شركات مسجلة بالنظام.</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const c = doc.data();
            const isSuspended = c.subscriptionStatus === 'suspended';
            html += `
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <h4 class="font-bold text-yellow-500 text-lg">${c.name}</h4>
                        <p class="text-xs text-gray-300">المالك: ${c.ownerName} | البريد: ${c.email} | الهاتف: ${c.phone || '-'}</p>
                        <p class="text-xs mt-1">الحالة: <span class="${isSuspended ? 'text-red-500 font-bold' : 'text-green-400'}">${c.subscriptionStatus || 'active'}</span></p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="toggleCompany('${doc.id}')" class="${isSuspended ? 'bg-green-600' : 'bg-yellow-600'} hover:opacity-80 text-xs text-white px-3 py-1.5 rounded font-bold">
                            ${isSuspended ? 'تفعيل الحساب' : 'إيقاف الاشتراك'}
                        </button>
                        <button onclick="deleteCompany('${doc.id}')" class="bg-red-600 hover:bg-red-700 text-xs text-white px-3 py-1.5 rounded font-bold">حذف</button>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    } catch (e) {
        showGlobalError('خطأ جلب الشركات: ' + e.message);
    }
}

function showAddCompany() {
    const name = prompt('اسم الشركة:');
    const ownerName = prompt('اسم المالك:');
    const email = prompt('البريد الإلكتروني:');
    if (!name || !email) return;

    const id = generateUUID();
    dbFS.collection('tenants').doc(id).set({
        name, ownerName, email,
        status: 'active',
        subscriptionStatus: 'active',
        createdAt: Date.now()
    }).then(() => {
        alert('✅ تم إضافة الشركة بنجاح.');
        renderCompanies();
    });
}

async function toggleCompany(id) {
    const ref = dbFS.collection('tenants').doc(id);
    const doc = await ref.get();
    if (doc.exists) {
        const current = doc.data().subscriptionStatus || 'active';
        const next = current === 'active' ? 'suspended' : 'active';
        await ref.update({ subscriptionStatus: next });
        alert(`تم تغيير حالة الاشتراك إلى: ${next}`);
        renderCompanies();
    }
}

async function deleteCompany(id) {
    if (confirm('هل أنت متأكد من حذف هذه الشركة بالكامل؟')) {
        await dbFS.collection('tenants').doc(id).delete();
        renderCompanies();
    }
}

function renderAdminVehicles() {
    const container = document.getElementById('page-admin-vehicles');
    if (container) {
        container.innerHTML = `<h2 class="text-2xl font-bold text-yellow-500 mb-4">👑 كل المركبات بالنظام</h2><p class="text-gray-400">يمكنك مشاهدة وإدارة كافة المركبات المسجلة بجميع الشركات من لوحة التحكم الخاصة بالسيارات.</p>`;
    }
}

function renderSubscriptions() {
    const container = document.getElementById('page-admin-subscriptions');
    if (container) {
        container.innerHTML = `<h2 class="text-2xl font-bold text-yellow-500 mb-4">💳 إشعار عمليات الدفع</h2><p class="text-gray-400">سجل تحويلات فودافون كاش وانستا باي المرسلة من العملاء لتأكيد وتجديد الاشتراكات.</p>`;
    }
}

// =============================================
// حساب المسافة بالكيلومترات (Haversine Formula)
// =============================================
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// =============================================
// 🗺️ نافذة سجل حركة السائق بالتفصيل
// =============================================
async function showDriverHistoryMapModal(code) {
    const driverSnap = await dbRT.ref(`vehicleDrivers/${code}`).once('value');
    const driverData = driverSnap.val();
    if (!driverData) {
        alert('السائق غير موجود.');
        return;
    }
    if (userRole !== 'admin' && driverData.tenantId !== userTenantId) {
        alert('لا تملك صلاحية عرض تاريخ هذا السائق.');
        return;
    }

    let modal = document.getElementById('historyMapModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'historyMapModal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-3';
        modal.innerHTML = `
            <div class="bg-gray-800 w-full max-w-4xl h-5/6 rounded-xl shadow-lg flex flex-col border border-gray-600 overflow-hidden">
                <div class="p-4 flex justify-between items-center border-b border-gray-700 bg-gray-900">
                    <h3 class="text-lg font-bold text-yellow-500">🗺️ مسار رحلة السائق (${driverData.displayName || code})</h3>
                    <button onclick="closeHistoryMapModal()" class="text-red-500 hover:text-red-700 font-bold text-2xl">&times;</button>
                </div>
                <div class="p-3 bg-gray-900 flex justify-between items-center text-xs text-gray-300 border-b border-gray-800">
                    <div>إجمالي المسافة المقطوعة اليوم: <span id="totalDistanceLabel" class="text-green-400 font-bold text-sm">0</span> كم</div>
                    <div>تاريخ اليوم: <span class="text-yellow-400">${new Date().toLocaleDateString('ar')}</span></div>
                </div>
                <div id="history-map-container" class="flex-grow w-full" style="z-index: 1;"></div>
            </div>
        `;
        document.body.appendChild(modal);
    } else {
        modal.classList.remove('hidden');
    }

    setTimeout(async () => {
        if (historyMapInstance) {
            historyMapInstance.remove();
        }

        historyMapInstance = L.map('history-map-container').setView([30.0444, 31.2357], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(historyMapInstance);

        try {
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
                historyPolyline = L.polyline(points, { color: '#3b82f6', weight: 5, opacity: 0.8 }).addTo(historyMapInstance);
                historyMapInstance.fitBounds(historyPolyline.getBounds());

                L.marker(points[0]).addTo(historyMapInstance).bindPopup('🏁 نقطة البداية');
                L.marker(points[points.length - 1]).addTo(historyMapInstance).bindPopup('📍 النقطة الحالية');
            }

        } catch (error) {
            console.error('Error fetching history:', error);
            alert('حدث خطأ أثناء جلب سجل الحركة.');
        }
    }, 300);
}

function closeHistoryMapModal() {
    const modal = document.getElementById('historyMapModal');
    if (modal) modal.classList.add('hidden');
    if (historyMapInstance) {
        historyMapInstance.remove();
        historyMapInstance = null;
    }
}

// =============================================
// تسجيل الدخول المخصص بالاسم وكلمة المرور
// =============================================
async function handleCustomDatabaseLogin(username, password) {
    try {
        const usersRef = dbFS.collection('users');
        const querySnapshot = await usersRef.where('username', '==', username).where('password', '==', password).get();

        if (querySnapshot.empty) {
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
        }

        const userData = querySnapshot.docs[0].data();
        const userId = querySnapshot.docs[0].id;

        const tenantRef = await dbFS.collection('tenants').doc(userData.tenantId).get();
        if (!tenantRef.exists) {
            throw new Error('بيانات الشركة الخاصة بك غير موجودة.');
        }

        const tenantData = tenantRef.data();

        const subscriptionCheck = await checkSubscriptionStatus(userData.tenantId);
        if (!subscriptionCheck.valid) {
            showSubscriptionExpiredScreen(subscriptionCheck.tenantData || tenantData);
            return;
        }

        currentUser = { uid: userId, displayName: userData.name, email: userData.email || username };
        currentUserId = userId;
        userRole = userData.role || 'company_admin';
        userTenantId = userData.tenantId;

        showDashboard();

    } catch (error) {
        showGlobalError(error.message);
    }
}

// =============================================
// إنشاء حساب جديد لشركة (مع فترة 15 يوم تجريبية)
// =============================================
async function handleSignup(e) {
    if (e) e.preventDefault();

    const fullName = document.getElementById('signupFullName').value.trim();
    const companyName = document.getElementById('signupCompanyName').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const subscriptionPeriod = document.getElementById('signupSubscriptionPeriod')?.value || 'month';
    const errorEl = document.getElementById('signupError');

    if (errorEl) errorEl.classList.add('hidden');

    if (!fullName || !companyName || !phone || !username || !email || !password) {
        if (errorEl) {
            errorEl.textContent = 'الرجاء إدخال جميع البيانات المطلوبة';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;
        await userCred.user.updateProfile({ displayName: fullName });

        const now = Date.now();
        const trialEndDate = now + (15 * 24 * 60 * 60 * 1000);
        const newTenantId = generateUUID();

        await dbFS.collection('tenants').doc(newTenantId).set({
            name: companyName,
            ownerName: fullName,
            email: email,
            phone: phone,
            username: username,
            password: password,
            status: 'active',
            subscriptionStatus: 'trial',
            subscriptionPeriod: subscriptionPeriod,
            trialEndDate: trialEndDate,
            subscriptionEndDate: trialEndDate,
            paymentMethod: null,
            paymentStatus: 'none',
            lastPaymentDate: null,
            vehiclesCount: 0,
            createdAt: now
        });

        await dbFS.collection('users').doc(uid).set({
            tenantId: newTenantId,
            email: email,
            name: fullName,
            phone: phone,
            username: username,
            password: password,
            role: 'company_admin',
            status: 'active',
            createdAt: now
        });

        alert(`✅ تم إنشاء حساب الشركة بنجاح!\nلديك فترة تجريبية مجانية لمدة 15 يوماً.`);

        currentUser = userCred.user;
        currentUserId = uid;
        userRole = 'company_admin';
        userTenantId = newTenantId;

        showDashboard();

    } catch (err) {
        console.error('❌ فشل إنشاء الحساب:', err);
        if (errorEl) {
            errorEl.textContent = err.message || 'فشل إنشاء الحساب';
            errorEl.classList.remove('hidden');
        }
    }
}

// =============================================
// 🚀 بدء التطبيق والتحقق من حالة الدخول
// =============================================
window.addEventListener('DOMContentLoaded', () => {
    ensureAdminAccount();

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            currentUserId = user.uid;
            try {
                const doc = await dbFS.collection('users').doc(user.uid).get();
                if (doc.exists) {
                    const data = doc.data();
                    userRole = data.role || 'company_admin';
                    userTenantId = data.tenantId || null;
                } else {
                    userRole = 'company_admin';
                    userTenantId = generateUUID();
                }

                if (userRole !== 'admin' && userTenantId) {
                    const check = await checkSubscriptionStatus(userTenantId);
                    if (!check.valid) {
                        showSubscriptionExpiredScreen(check.tenantData);
                        return;
                    }
                }

                showDashboard();
            } catch (e) {
                console.error('❌ خطأ في جلب بيانات المستخدم:', e);
                showDashboard();
            }
        } else {
            document.getElementById('loginScreen')?.classList.remove('hidden');
            document.getElementById('dashboardScreen')?.classList.add('hidden');
        }
    });
});
