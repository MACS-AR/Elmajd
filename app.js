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
let followedVehicleCode = null; // للتتبع التلقائي للسيارة المحددة

let liveListeners = [];

let historyMapInstance = null;
let historyPolyline = null;
let selectedPaymentMethod = null;

// =============================================
// 🧹 دالة مساعدة لتنظيف مستمعي اللحظي لمنع تسريب الذاكرة (Memory Leaks)
// =============================================
function clearLiveListeners() {
    liveListeners.forEach(ref => {
        if (ref && typeof ref.off === 'function') {
            ref.off();
        }
    });
    liveListeners = [];
}

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
// 🔐 التأكد من وجود حساب الأدمن (أمان أفرز: بدون تخزين كلمة المرور نصياً)
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

        const tenantId = uid;
        const now = Date.now();
        await dbFS.collection('tenants').doc(tenantId).set({
            name: 'شركة تجريبية',
            ownerName: demoName,
            email: demoEmail,
            phone: '0100000000',
            username: demoEmail,
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
                userTenantId = data.tenantId || currentUser.uid;
            } else {
                userRole = 'company_admin';
                userTenantId = currentUser.uid;
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
            return { valid: true, reason: 'new_tenant', tenantData: { name: 'شركة جديدة', subscriptionStatus: 'trial' } };
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
        return { valid: true, reason: 'fallback' };
    }
}

// =============================================
// 💳 عرض شاشة انتهاء الاشتراك
// =============================================
function showSubscriptionExpiredScreen(tenantData) {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('dashboardScreen')?.classList.add('hidden');
    document.getElementById('subscriptionExpiredScreen')?.classList.remove('hidden');

    const nameEl = document.getElementById('subscriptionCompanyName');
    if (nameEl) nameEl.textContent = tenantData?.name || 'شركتك';
    
    let reasonText = 'انتهى اشتراكك';
    if (tenantData?.subscriptionStatus === 'trial') reasonText = 'انتهت الفترة التجريبية (15 يوم)';
    else if (tenantData?.subscriptionStatus === 'suspended') reasonText = 'تم إيقاف حسابك من قِبل الإدارة';

    const statusEl = document.getElementById('subscriptionStatus');
    if (statusEl) statusEl.textContent = reasonText;

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

    const container = document.getElementById('paymentMethodsContainer');
    if (container) container.innerHTML = paymentMethodsHTML;
}

// =============================================
// 💳 اختيار طريقة الدفع
// =============================================
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    const paymentDetails = document.getElementById('paymentDetails');
    const paymentAccountDetails = document.getElementById('paymentAccountDetails');

    if (paymentDetails) paymentDetails.classList.remove('hidden');

    if (paymentAccountDetails) {
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
}

// =============================================
// 💳 إرسال طلب الدفع للأدمن
// =============================================
async function submitPaymentRequest() {
    const transactionInput = document.getElementById('transactionNumber');
    const transactionNumber = transactionInput ? transactionInput.value.trim() : '';

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
            tenantName: document.getElementById('subscriptionCompanyName')?.textContent || 'شركة',
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
        clearLiveListeners();

        if (mapInstance) {
            mapInstance.remove();
            mapInstance = null;
        }

        await auth.signOut();

        currentUser = null;
        currentUserId = null;
        userRole = null;
        userTenantId = null;

        document.getElementById('dashboardScreen')?.classList.add('hidden');
        document.getElementById('subscriptionExpiredScreen')?.classList.add('hidden');
        document.getElementById('loginScreen')?.classList.remove('hidden');
        if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = '';
        if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '';
    } catch (err) {
        alert('خطأ في الخروج: ' + err.message);
    }
}

// =============================================
// 🖥️ عرض لوحة التحكم وتحديث الشريط العلوي (Top Bar)
// =============================================
function renderTopNavBar() {
    const navContainer = document.getElementById('topNavBar');
    if (!navContainer) return;

    navContainer.innerHTML = `
        <div class="bg-gray-900 text-white px-4 py-3 flex flex-wrap justify-between items-center border-b border-gray-700 shadow-lg">
            <div class="flex items-center gap-3">
                <span class="text-2xl">🚚</span>
                <span class="font-bold text-yellow-500 text-lg">منصة تتبع السيارات</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap my-2 sm:my-0">
                <button onclick="showPage('dashboard')" data-page="dashboard" class="nav-btn bg-gray-800 hover:bg-yellow-500 hover:text-black text-white text-xs font-bold px-3 py-2 rounded-lg transition">📊 الرئيسة</button>
                <button onclick="showPage('vehicles')" data-page="vehicles" class="nav-btn bg-gray-800 hover:bg-yellow-500 hover:text-black text-white text-xs font-bold px-3 py-2 rounded-lg transition">🚗 السائقون</button>
                <button onclick="showPage('map')" data-page="map" class="nav-btn bg-gray-800 hover:bg-yellow-500 hover:text-black text-white text-xs font-bold px-3 py-2 rounded-lg transition">🗺️ الخريطة المباشرة</button>
                <button onclick="showPage('tracking')" data-page="tracking" class="nav-btn bg-gray-800 hover:bg-yellow-500 hover:text-black text-white text-xs font-bold px-3 py-2 rounded-lg transition">📈 تقارير الحركة</button>
                <button onclick="showPage('admin-companies')" data-page="admin-companies" class="nav-btn admin-only hidden bg-gray-800 hover:bg-yellow-500 hover:text-black text-white text-xs font-bold px-3 py-2 rounded-lg transition">🏢 الشركات</button>
            </div>
            <div class="flex items-center gap-3">
                <span id="userName" class="text-xs text-gray-300 font-bold"></span>
                <span id="userRole" class="text-xs bg-yellow-500 text-black font-bold px-2 py-0.5 rounded"></span>
                <button onclick="handleLogout()" class="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg">خروج 🚪</button>
            </div>
        </div>
    `;
}

function showDashboard() {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('subscriptionExpiredScreen')?.classList.add('hidden');
    document.getElementById('dashboardScreen')?.classList.remove('hidden');

    renderTopNavBar();

    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = `مرحباً، ${currentUser?.displayName || 'المستخدم'}`;

    let roleText = 'شركة / فرد';
    if (userRole === 'admin') roleText = 'المدير العام';
    else if (userRole === 'worker') roleText = 'موظف';

    const roleEl = document.getElementById('userRole');
    if (roleEl) roleEl.textContent = roleText;

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
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('bg-yellow-500', 'text-black'));
        document.querySelectorAll(`.nav-btn[data-page="${page}"]`).forEach(b => b.classList.add('bg-yellow-500', 'text-black'));
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

    clearLiveListeners();

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
            <h3 class="font-bold text-yellow-500 mb-3">📍 التتبع المباشر للسائقين <span class="text-xs text-gray-400 font-normal">(اضغط للتركيز والتتبع على الخريطة)</span></h3>
            <div id="recentLocations" class="space-y-2 text-sm text-gray-300"></div>
        </div>
    `;

    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId || currentUserId);
    }

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
        <div class="flex justify-between items-center border-b border-gray-700 py-2 cursor-pointer hover:bg-gray-700 px-3 rounded-lg transition" onclick="focusAndTrackVehicle('${item.code}', ${item.lat}, ${item.lng})">
            <span class="font-bold text-yellow-500">${item.name}</span>
            <span class="text-xs ${item.isOnline ? 'text-green-400' : 'text-gray-500'}">${item.isOnline ? '🟢 متصل' : '🔴 غير متصل'}</span>
            <span class="text-xs text-yellow-400 font-mono">${item.speed.toFixed(1)} كم/س</span>
            <span class="text-xs text-gray-400">${item.time ? new Date(item.time).toLocaleTimeString('ar') : '-'}</span>
        </div>
    `).join('');
}

function focusOnVehicle(code, lat, lng) {
    focusAndTrackVehicle(code, lat, lng);
}

// =============================================
// 🚗 قائمة سيارات الشركة وإدارتها
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    clearLiveListeners();

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🚗 سائقين الشركة</h2>
            <button onclick="showAddVehicleModal()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 shadow">
                <span>➕</span> إضافة سائق جديد
            </button>
        </div>
        <div id="vehiclesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
    `;

    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId || currentUserId);
    }

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
                                <p class="text-xs text-yellow-500 font-mono">كود المعرف: ${code}</p>
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
                        <button onclick="focusAndTrackVehicle('${code}', ${loc.latitude || 0}, ${loc.longitude || 0})" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1.5 rounded">📍 تتبع حياً</button>
                        <button onclick="showDriverDetails('${code}')" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1.5 rounded">📋 تفاصيل</button>
                        <button onclick="showDriverHistoryMapModal('${code}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1.5 rounded font-bold">🗺️ السجل والمكان</button>
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
                <button onclick="submitNewVehicle()" class="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg shadow">
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
// 🪟 حفظ سائق جديد + ربط كود التفعيل بالـ Tenant ID في الفايربيس
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

    const targetTenantId = userTenantId || (currentUser ? currentUser.uid : null);

    if (!targetTenantId) {
        alert('حدث خطأ في تحديد رقم الشركة. يرجى إعادة تسجيل الدخول.');
        return;
    }

    const payload = {
        displayName: name,
        phone: phone || '',
        tenantId: targetTenantId,
        activationCode: activationCode,
        createdAt: Date.now(),
        status: 'offline'
    };

    dbRT.ref(`vehicleDrivers/${code}`).set(payload)
        .then(() => {
            return dbRT.ref(`activationCodes/${activationCode}`).set({
                tenantId: targetTenantId,
                vehicleCode: code
            });
        })
        .then(() => {
            return dbRT.ref(`tenants/${targetTenantId}/drivers/${code}`).set({
                displayName: name,
                phone: phone || '',
                activationCode: activationCode,
                createdAt: Date.now()
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

    const targetTenantId = userTenantId || currentUserId;

    dbRT.ref(`vehicleDrivers/${code}`).update({
        displayName: name,
        phone: phone || ''
    }).then(() => {
        if (targetTenantId) {
            dbRT.ref(`tenants/${targetTenantId}/drivers/${code}`).update({
                displayName: name,
                phone: phone || ''
            });
        }
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

    const currentTenant = userTenantId || currentUserId;

    if (userRole !== 'admin' && v.tenantId !== currentTenant) {
        alert('غير مصرح لك بحذف هذا السائق.');
        return;
    }

    if (confirm(`هل أنت متأكد من حذف السائق (${v.displayName || code})؟`)) {
        try {
            await dbRT.ref(`vehicleDrivers/${code}`).remove();
            if (v.activationCode) {
                await dbRT.ref(`activationCodes/${v.activationCode}`).remove();
            }
            if (currentTenant) {
                await dbRT.ref(`tenants/${currentTenant}/drivers/${code}`).remove();
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

        const currentTenant = userTenantId || currentUserId;
        if (userRole !== 'admin' && v.tenantId !== currentTenant) {
            alert('غير مصرح لك بفرز بيانات هذا السائق.');
            return;
        }

        alert(`📋 بيانات السائق الكاملة:\n\n👤 الاسم: ${v.displayName || '-'}\n🔑 كود المعرف: ${code}\n🔓 كود التفعيل: ${v.activationCode || '-'}\n📱 الهاتف: ${v.phone || '-'}\n🏢 معرف الشركة (TenantId): ${v.tenantId || '-'}`);
    });
}

// =============================================
// 🗺️ الخريطة المباشرة والتتبع والتكبير (Zoom & Polyline)
// =============================================
function renderMap() {
    const container = document.getElementById('page-map');
    if (!container) return;

    clearLiveListeners();

    container.innerHTML = `
        <div class="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🗺️ الخريطة المباشرة للسيارات</h2>
            <div class="flex items-center gap-2">
                <span id="mapVehiclesCount" class="text-sm text-gray-400">0 مركبة</span>
                <button id="stopFollowBtn" onclick="stopFollowingVehicle()" class="hidden bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-2 py-1 rounded">إيقاف التتبع المباشر ✖</button>
                <select id="mapStyleSelect" class="bg-gray-700 text-white rounded p-1 text-sm border border-gray-600" onchange="changeMapStyle(this.value)">
                    <option value="street">🛣️ الشوارع</option>
                    <option value="satellite">🛰️ قمر صناعي</option>
                </select>
            </div>
        </div>
        <div id="map-container" class="w-full rounded-xl border border-gray-700 shadow-md" style="height: 68vh; min-height: 400px; z-index: 1;"></div>
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

    let ref;
    if (userRole === 'admin') {
        ref = dbRT.ref('vehicleDrivers');
    } else {
        ref = dbRT.ref('vehicleDrivers').orderByChild('tenantId').equalTo(userTenantId || currentUserId);
    }

    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        Object.values(mapMarkers).forEach(m => mapInstance && mapInstance.removeLayer(m));
        mapMarkers = {};

        Object.values(livePathPolylines).forEach(p => mapInstance && mapInstance.removeLayer(p));
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
                    <div style="width:38px; height:38px; border-radius:50%; background-color:rgba(17,24,39,0.9); border:2px solid ${carColor}; display:flex; justify-content:center; align-items:center; box-shadow:0 0 8px ${carColor};">
                        <span style="font-size:20px;">🚗</span>
                    </div>
                `,
                iconSize: [38, 38],
                iconAnchor: [19, 19],
                popupAnchor: [0, -19]
            });

            const popupContent = `
                <div class="map-popup text-right p-1" style="font-family: Cairo, sans-serif; direction: rtl;">
                    <div class="font-bold text-base text-gray-900">👤 ${v.displayName || 'سائق'}</div>
                    <div class="text-xs text-gray-600">🚀 السرعة: ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</div>
                    <div class="text-xs text-gray-600">🔋 البطارية: ${v.deviceHealth?.battery || '?'}%</div>
                    <div class="font-bold text-xs mt-1 ${isMoving ? 'text-yellow-600' : isOnline ? 'text-green-600' : 'text-red-600'}">
                        ${isMoving ? '🟡 متحرك' : isOnline ? '🟢 متصل' : '🔴 غير متصل'}
                    </div>
                    <button onclick="focusAndTrackVehicle('${code}', ${loc.latitude}, ${loc.longitude})" class="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 rounded">
                        🎯 تركيز وتتبع تلقائي
                    </button>
                </div>
            `;

            const marker = L.marker([loc.latitude, loc.longitude], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(mapInstance);

            marker.on('click', () => {
                focusAndTrackVehicle(code, loc.latitude, loc.longitude);
            });

            mapMarkers[code] = marker;

            // 🟦 رسم خط سير الحركة الحي (Blue Polyline)
            const pathData = v.livePath;
            if (pathData && Array.isArray(pathData) && pathData.length > 1) {
                const pathPoints = pathData.map(p => [p.latitude, p.longitude]);
                livePathPolylines[code] = L.polyline(pathPoints, { 
                    color: '#0066ff', 
                    weight: 5, 
                    opacity: 0.85,
                    lineJoin: 'round'
                }).addTo(mapInstance);
            }

            // 🎯 التركيز والتحرك المستمر مع السيارة المحددة
            if (followedVehicleCode === code) {
                mapInstance.panTo([loc.latitude, loc.longitude]);
            }
        });

        const countEl = document.getElementById('mapVehiclesCount');
        if (countEl) countEl.textContent = count + ' مركبة';
    });

    liveListeners.push(ref);
}

// 🎯 التركيز والتكبير والتتبع للسيارة
function focusAndTrackVehicle(code, lat, lng) {
    followedVehicleCode = code;
    showPage('map');

    const stopBtn = document.getElementById('stopFollowBtn');
    if (stopBtn) stopBtn.classList.remove('hidden');

    setTimeout(() => {
        if (mapInstance && lat && lng) {
            mapInstance.setView([lat, lng], 17, { animate: true });
            if (mapMarkers[code]) {
                mapMarkers[code].openPopup();
            }
        }
    }, 300);
}

function stopFollowingVehicle() {
    followedVehicleCode = null;
    const stopBtn = document.getElementById('stopFollowBtn');
    if (stopBtn) stopBtn.classList.add('hidden');
    alert('تم إيقاف التتبع التلقائي.');
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
                <button onclick="loadTracking('today')" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded text-sm shadow">حركة اليوم</button>
                <button onclick="loadTracking('week')" class="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded text-sm shadow">حركة هذا الأسبوع</button>
            </div>
            <div id="trackingReportResults" class="mt-6 text-gray-300"></div>
        </div>
    `;
}

function loadTracking(period) {
    const res = document.getElementById('trackingReportResults');
    if (res) {
        res.innerHTML = `<div class="p-4 bg-gray-900 rounded border border-gray-700">📊 تم استخراج تقرير (${period === 'today' ? 'اليوم' : 'الأسبوع'}). اضغط على زر "السجل والمكان" بجانب أي سائق في صفحة السيارات لمعاينة مساره ورسم حركته المباشرة وحساب المسافة والمدة بالكامل.</div>`;
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
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// =============================================
// 🗺️ نافذة سجل حركة السائق اليومي + إزالة الخريطة القديمة بأمان لمنع الأخطاء
// =============================================
async function showDriverHistoryMapModal(code) {
    const driverSnap = await dbRT.ref(`vehicleDrivers/${code}`).once('value');
    const driverData = driverSnap.val();
    if (!driverData) {
        alert('السائق غير موجود.');
        return;
    }

    const currentTenant = userTenantId || currentUserId;
    if (userRole !== 'admin' && driverData.tenantId !== currentTenant) {
        alert('لا تملك صلاحية عرض تاريخ هذا السائق.');
        return;
    }

    closeHistoryMapModal();

    const modal = document.createElement('div');
    modal.id = 'historyMapModal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-80 flex justify-center items-center z-50 p-3';
    modal.innerHTML = `
        <div class="bg-gray-800 w-full max-w-4xl h-5/6 rounded-xl shadow-lg flex flex-col border border-gray-600 overflow-hidden">
            <div class="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center flex-wrap gap-2">
                <div>
                    <h3 class="text-lg font-bold text-yellow-500">🗺️ سجل الحركة اليومي: ${driverData.displayName || code}</h3>
                    <p class="text-xs text-gray-400">كود المعرف: ${code} | كود التفعيل: ${driverData.activationCode || code}</p>
                </div>
                <button onclick="closeHistoryMapModal()" class="text-red-500 hover:text-red-700 font-bold text-2xl">&times;</button>
            </div>
            
            <div class="bg-gray-900 px-4 py-2 border-b border-gray-800 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div class="bg-gray-800 p-2 rounded"><span class="text-gray-400">🏁 إجمالي المسافة:</span> <strong id="histDist" class="text-yellow-400">0 كم</strong></div>
                <div class="bg-gray-800 p-2 rounded"><span class="text-gray-400">⏱️ المدة المستغرقة:</span> <strong id="histDuration" class="text-yellow-400">0 دقيقة</strong></div>
                <div class="bg-gray-800 p-2 rounded"><span class="text-gray-400">🕒 بداية الرحلة:</span> <strong id="histStart" class="text-gray-200">-</strong></div>
                <div class="bg-gray-800 p-2 rounded"><span class="text-gray-400">🏁 نهاية الرحلة:</span> <strong id="histEnd" class="text-gray-200">-</strong></div>
            </div>

            <div id="history-map-container" class="flex-1 w-full bg-gray-900"></div>
        </div>
    `;
    document.body.appendChild(modal);

    setTimeout(async () => {
        const containerEl = document.getElementById('history-map-container');
        if (!containerEl) return;
        
        if (historyMapInstance) {
            historyMapInstance.remove();
            historyMapInstance = null;
        }
        if (containerEl._leaflet_id) {
            containerEl._leaflet_id = null;
        }

        historyMapInstance = L.map('history-map-container').setView([30.0444, 31.2357], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(historyMapInstance);

        const historySnap = await dbRT.ref(`locationHistory/${code}`).once('value');
        let points = [];
        const historyVal = historySnap.val();

        if (historyVal) {
            if (Array.isArray(historyVal)) {
                points = historyVal;
            } else {
                points = Object.values(historyVal);
            }
        } else if (driverData.livePath && Array.isArray(driverData.livePath)) {
            points = driverData.livePath;
        } else if (driverData.liveLocation) {
            points = [driverData.liveLocation];
        }

        if (points.length === 0) {
            alert('لا يوجد سجل حركات مسجل لهذا السائق اليوم بعد.');
            return;
        }

        points.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let totalDistance = 0;
        const latLngs = [];

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.latitude && p.longitude) {
                latLngs.push([p.latitude, p.longitude]);
                if (i > 0) {
                    const prev = points[i - 1];
                    totalDistance += calculateDistance(prev.latitude, prev.longitude, p.latitude, p.longitude);
                }
            }
        }

        const startTime = points[0].timestamp ? new Date(points[0].timestamp) : null;
        const endTime = points[points.length - 1].timestamp ? new Date(points[points.length - 1].timestamp) : null;
        let durationMinutes = 0;
        if (startTime && endTime) {
            durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
        }

        document.getElementById('histDist').textContent = totalDistance.toFixed(2) + ' كم';
        document.getElementById('histDuration').textContent = durationMinutes >= 60 ? `${Math.floor(durationMinutes/60)} ساعة و ${durationMinutes%60} دقيقة` : `${durationMinutes} دقيقة`;
        document.getElementById('histStart').textContent = startTime ? startTime.toLocaleTimeString('ar') : '-';
        document.getElementById('histEnd').textContent = endTime ? endTime.toLocaleTimeString('ar') : '-';

        if (latLngs.length > 1) {
            historyPolyline = L.polyline(latLngs, { color: '#0066ff', weight: 6, opacity: 0.9, lineJoin: 'round' }).addTo(historyMapInstance);
            historyMapInstance.fitBounds(historyPolyline.getBounds(), { padding: [30, 30] });
        } else if (latLngs.length === 1) {
            historyMapInstance.setView(latLngs[0], 16);
        }

        if (latLngs.length > 0) {
            L.marker(latLngs[0]).addTo(historyMapInstance).bindPopup('🏁 نقطة بداية الرحلة').openPopup();
            if (latLngs.length > 1) {
                L.marker(latLngs[latLngs.length - 1]).addTo(historyMapInstance).bindPopup('📍 النقطة الحالية / النهاية');
            }
        }
    }, 200);
}

function closeHistoryMapModal() {
    if (historyMapInstance) {
        historyMapInstance.remove();
        historyMapInstance = null;
    }
    closeModal('historyMapModal');
}

// =============================================
// 🔑 تسجيل الدخول المخصص أو إنشاء حساب جديد
// =============================================
async function handleCustomDatabaseLogin(username, password) {
    try {
        const snap = await dbFS.collection('users').where('username', '==', username).get();
        if (snap.empty) {
            alert('اسم المستخدم غير موجود');
            return;
        }

        let matchedUser = null;
        snap.forEach(doc => {
            const u = doc.data();
            if (u.password === password) {
                matchedUser = { id: doc.id, ...u };
            }
        });

        if (!matchedUser) {
            alert('كلمة المرور غير صحيحة');
            return;
        }

        currentUserId = matchedUser.id;
        userRole = matchedUser.role || 'company_admin';
        userTenantId = matchedUser.tenantId || matchedUser.id;
        currentUser = { displayName: matchedUser.name || matchedUser.username, email: matchedUser.email };

        showDashboard();
    } catch (e) {
        alert('خطأ في تسجيل الدخول المخصص: ' + e.message);
    }
}

// =============================================
// 🚀 عند تشغيل الصفحة
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
                    userTenantId = data.tenantId || user.uid;
                } else {
                    userRole = 'company_admin';
                    userTenantId = user.uid;
                    await dbFS.collection('users').doc(user.uid).set({
                        tenantId: userTenantId,
                        email: user.email,
                        name: user.displayName || 'شركة جديدة',
                        role: 'company_admin',
                        status: 'active',
                        createdAt: Date.now()
                    });
                }
            } catch (err) {
                userTenantId = user.uid;
            }

            showDashboard();
        } else {
            document.getElementById('loginScreen')?.classList.remove('hidden');
            document.getElementById('dashboardScreen')?.classList.add('hidden');
        }
    });
});
