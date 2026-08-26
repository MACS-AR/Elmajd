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

// متغيرات نافذة سجل المسار (الرحلة)
let historyMapInstance = null;
let historyPolyline = null;

// متغيرات الدفع
let selectedPaymentMethod = null;

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
                    username: 'admin',
                    password: adminPassword,
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
// 🔐 إنشاء حساب تجريبي (بدون فترة تجريبية إضافية)
// =============================================
async function createDemoAccount() {
    const demoEmail = `demo_${Date.now()}@gmail.com`;
    const demoPassword = '123456';
    const demoName = 'عميل تجريبي';

    try {
        const userCred = await auth.createUserWithEmailAndPassword(demoEmail, demoPassword);
        const uid = userCred.user.uid;

        await userCred.user.updateProfile({ displayName: demoName });

        const tenantId = `demo_${Date.now()}`;
        const now = Date.now();
        await dbFS.collection('tenants').doc(tenantId).set({
            name: 'شركة تجريبية',
            ownerName: demoName,
            email: demoEmail,
            phone: '0100000000',
            username: demoEmail,
            password: demoPassword,
            status: 'active',
            subscriptionStatus: 'active',
            subscriptionPeriod: 'month',
            trialEndDate: 0,
            subscriptionEndDate: now + (30 * 24 * 60 * 60 * 1000),
            paymentMethod: null,
            paymentStatus: 'paid',
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
            role: 'customer',
            status: 'active',
            createdAt: now
        });

        alert(`✅ تم إنشاء الحساب التجريبي بنجاح!\nالبريد: ${demoEmail}\nكلمة المرور: ${demoPassword}`);
        await auth.signInWithEmailAndPassword(demoEmail, demoPassword);
        
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
// 🔐 المصادقة - تسجيل الدخول (مع التحقق من الاشتراك)
// =============================================
async function handleLogin(e) {
    e.preventDefault();
    const loginType = document.getElementById('loginType')?.value || 'firebase';
    const loginInput = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');

    if (errorEl) errorEl.classList.add('hidden');

    if (!loginInput || !password) {
        if (errorEl) {
            errorEl.textContent = 'الرجاء إدخال البيانات المطلوب إكمالها';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (loginType === 'custom') {
        // تسجيل دخول مخصص (اسم المستخدم والباسورد) مع التحقق من الاشتراك
        await handleCustomDatabaseLogin(loginInput, password);
    } else {
        // تسجيل الدخول العادي عبر Firebase Auth
        try {
            const cred = await auth.signInWithEmailAndPassword(loginInput, password);
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

            // التحقق من حالة الاشتراك قبل الدخول (باستثناء الأدمن)
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
                errorEl.textContent = err.message || 'فشل تسجيل الدخول';
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

        // التحقق من الفترة التجريبية
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

        // التحقق من الاشتراك الفعلي
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

        // أي حالة أخرى (مثل suspended)
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

    document.getElementById('subscriptionCompanyName').textContent = tenantData?.name || '';
    document.getElementById('subscriptionStatus').textContent =
        tenantData?.subscriptionStatus === 'trial' ? 'انتهت الفترة التجريبية' : 'انتهى الاشتراك';

    const paymentMethodsHTML = `
        <div class="grid grid-cols-2 gap-4 mt-4">
            <button onclick="selectPaymentMethod('vodafone_cash')" class="bg-red-600 hover:bg-red-700 text-white p-4 rounded-xl">
                📱 فودافون كاش
            </button>
            <button onclick="selectPaymentMethod('instapay')" class="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-xl">
                🏦 انستا باي
            </button>
        </div>
        <div id="paymentDetails" class="mt-4 hidden">
            <h4 class="font-bold text-yellow-500 mb-2">بيانات الدفع:</h4>
            <div id="paymentAccountDetails" class="bg-gray-900 p-3 rounded"></div>
            <input type="text" id="transactionNumber" placeholder="رقم التحويل" class="w-full mt-3 p-2 rounded bg-gray-700 text-white">
            <button onclick="submitPaymentRequest()" class="w-full mt-3 bg-green-600 hover:bg-green-700 text-white font-bold p-2 rounded">
                ✅ تأكيد الدفع
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
            <p>رقم فودافون كاش: <strong>01000000000</strong></p>
            <p class="text-sm text-gray-400">يرجى التحويل ثم إدخال رقم التحويل</p>
        `;
    } else if (method === 'instapay') {
        paymentAccountDetails.innerHTML = `
            <p>حساب انستا باي: <strong>tracking@instapay.com</strong></p>
            <p class="text-sm text-gray-400">يرجى التحويل ثم إدخال رقم التحويل</p>
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
        alert('لا يمكن تحديد الاشتراك الحالي');
        return;
    }

    try {
        // تحديث حالة الدفع في قاعدة البيانات
        await dbFS.collection('tenants').doc(userTenantId).update({
            paymentMethod: selectedPaymentMethod,
            paymentStatus: 'pending',
            lastTransactionNumber: transactionNumber,
            lastPaymentRequestDate: Date.now()
        });

        // إرسال إشعار للأدمن
        await dbFS.collection('adminNotifications').add({
            type: 'payment_request',
            tenantId: userTenantId,
            tenantName: document.getElementById('subscriptionCompanyName').textContent,
            amount: getSubscriptionAmount(),
            paymentMethod: selectedPaymentMethod,
            transactionNumber: transactionNumber,
            status: 'pending',
            createdAt: Date.now()
        });

        alert('✅ تم إرسال طلب الدفع بنجاح!\nسيتم تفعيل اشتراكك بعد تأكيد الإدارة.');
        // إخفاء شاشة الدفع والعودة لتسجيل الدخول
        document.getElementById('subscriptionExpiredScreen').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');

    } catch (error) {
        console.error('❌ فشل إرسال طلب الدفع:', error);
        alert('فشل إرسال طلب الدفع: ' + error.message);
    }
}

// =============================================
// 💰 حساب قيمة الاشتراك
// =============================================
function getSubscriptionAmount() {
    // يمكن تعديل الأسعار حسب الحاجة
    const prices = {
        month: 500, // جنيه مصري
        year: 5000  // جنيه مصري
    };

    // محاولة جلب فترة الاشتراك من قاعدة البيانات
    // لكن للأمان نعيد شهر كمبدئي
    return prices.month;
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
// 🔐 تسجيل الدخول السريع (أدمن)
// =============================================
async function quickLoginAdmin() {
    if (document.getElementById('loginEmail')) document.getElementById('loginEmail').value = 'admin@system.com';
    if (document.getElementById('loginPassword')) document.getElementById('loginPassword').value = '123456';
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.classList.add('hidden');
    
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
// 🖥️ عرض لوحة التحكم وتحديث الواجهة
// =============================================
function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('subscriptionExpiredScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');

    document.getElementById('userName').textContent = `مرحباً، ${currentUser?.displayName || 'المستخدم'}`;
    
    let roleText = 'عميل';
    if (userRole === 'admin') roleText = 'مدير عام';
    else if (userRole === 'company_admin') roleText = 'مدير شركة';
    else if (userRole === 'worker') roleText = 'موظف/عامل';
    
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
// 📊 عرض وتحديث إحصائيات لوحة التحكم
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
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-yellow-500 text-2xl">🚗</div><div><p class="stat-label text-sm text-gray-400">المركبات</p><p id="stat-total" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-green-500 text-2xl">📶</div><div><p class="stat-label text-sm text-gray-400">متصل</p><p id="stat-online" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-yellow-400 text-2xl">🔄</div><div><p class="stat-label text-sm text-gray-400">متحرك</p><p id="stat-moving" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
            <div class="stat-card rounded-xl p-4 bg-gray-800 shadow-sm border border-gray-700"><div class="flex items-center gap-3"><div class="icon text-red-500 text-2xl">⏸️</div><div><p class="stat-label text-sm text-gray-400">متوقف</p><p id="stat-stopped" class="stat-value text-2xl font-bold text-white">0</p></div></div></div>
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
    if(document.getElementById('stat-total')) document.getElementById('stat-total').textContent = total;
    if(document.getElementById('stat-online')) document.getElementById('stat-online').textContent = online;
    if(document.getElementById('stat-moving')) document.getElementById('stat-moving').textContent = moving;
    if(document.getElementById('stat-stopped')) document.getElementById('stat-stopped').textContent = stopped;
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
// 🚗 سياراتي مع إدارة (مع زر مسار الرحلة)
// =============================================
async function renderVehicles() {
    const container = document.getElementById('page-vehicles');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h2 class="text-2xl font-bold text-yellow-500">🚗 سياراتي</h2>
            <button onclick="showAddVehicle()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded-lg">➕ إضافة سيارة</button>
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
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const lastUpdate = v.liveLocation?.timestamp || 0;
            const isOnline = (now - lastUpdate) < 10000;
            const status = isOnline ? (v.status === 'moving' ? 'moving' : 'online') : 'offline';
            
            const statusText = status === 'online' ? 'متصل' : status === 'moving' ? 'متحرك' : 'غير متصل';
            const loc = v.liveLocation || {};

            html += `
                <div class="bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-700">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-gray-200">السائق: ${v.displayName || 'غير معروف'}</h4>
                            <p class="text-sm text-gray-400">الكود: ${code}</p>
                            <p class="text-sm text-gray-400">الهاتف: ${v.phone || 'لا يوجد هاتف'}</p>
                        </div>
                        <span class="w-3 h-3 rounded-full ${status === 'moving' ? 'bg-yellow-400' : isOnline ? 'bg-green-500' : 'bg-red-500'}"></span>
                    </div>
                    <div class="mt-3 text-sm text-gray-300 grid grid-cols-2 gap-1 bg-gray-900 p-2 rounded">
                        <span>🚀 ${loc.speed ? loc.speed.toFixed(1) : '0'} كم/س</span>
                        <span>🔋 ${v.deviceHealth?.battery || '?'}%</span>
                        <span class="text-xs ${status === 'online' ? 'text-green-400' : status === 'moving' ? 'text-yellow-400' : 'text-gray-500'} col-span-2">${statusText}</span>
                    </div>
                    <div class="mt-4 flex gap-2 flex-wrap">
                        <button onclick="focusOnVehicle('${code}', ${loc.latitude}, ${loc.longitude})" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded">📍 عرض</button>
                        <button onclick="showDriverDetails('${code}')" class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded">📋 بيانات</button>
                        <button onclick="showDriverHistoryMapModal('${code}')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded">🗺️ مسار الرحلة</button>
                        <button onclick="showEditVehicle('${code}')" class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-2 py-1 rounded">✏️ تعديل</button>
                        <button onclick="deleteVehicle('${code}')" class="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1 rounded">🗑️ حذف</button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html || '<p class="text-gray-500 col-span-full text-center py-8">لا توجد سيارات مسجلة</p>';
    });

    liveListeners.push(ref);
}

// =============================================
// 🛠️ إدارة السيارات (إضافة، تعديل، حذف، تفاصيل)
// =============================================
function showAddVehicle() {
    const code = prompt("أدخل كود السيارة/السائق الجديد (مثال: CAR-101):");
    if (!code) return;
    const displayName = prompt("أدخل اسم السائق:");
    const phone = prompt("أدخل رقم الهاتف:");

    if (!displayName) {
        alert("يرجى إدخال اسم السائق.");
        return;
    }

    dbRT.ref(`vehicleDrivers/${code}`).set({
        displayName: displayName,
        phone: phone || '',
        tenantId: userTenantId,
        createdAt: Date.now(),
        status: 'offline'
    }).then(() => {
        alert("✅ تم إضافة السيارة بنجاح!");
    }).catch(err => {
        alert("❌ خطأ أثناء الإضافة: " + err.message);
    });
}

function showEditVehicle(code) {
    dbRT.ref(`vehicleDrivers/${code}`).once('value', snap => {
        const v = snap.val();
        if (!v) return;

        const newName = prompt("تعديل اسم السائق:", v.displayName || '');
        if (newName === null) return;
        const newPhone = prompt("تعديل رقم الهاتف:", v.phone || '');

        dbRT.ref(`vehicleDrivers/${code}`).update({
            displayName: newName,
            phone: newPhone
        }).then(() => {
            alert("✅ تم تحديث بيانات السيارة!");
        }).catch(err => {
            alert("❌ حدث خطأ أثناء التعديل: " + err.message);
        });
    });
}

async function deleteVehicle(code) {
    if (confirm(`هل أنت تأكد من حذف السيارة ذات الكود ${code}؟`)) {
        try {
            await dbRT.ref(`vehicleDrivers/${code}`).remove();
            alert("✅ تم حذف السيارة بنجاح.");
        } catch (err) {
            alert("❌ فشل الحذف: " + err.message);
        }
    }
}

function showDriverDetails(code) {
    dbRT.ref(`vehicleDrivers/${code}`).once('value', snap => {
        const v = snap.val();
        if (!v) { alert("البيانات غير متوفرة."); return; }

        alert(`📋 تفاصيل السيارة:\n\nكود المركبة: ${code}\nاسم السائق: ${v.displayName || '-'}\nالهاتف: ${v.phone || '-'}\nالشركة: ${v.tenantId || '-'}\nالحالة: ${v.status || 'offline'}`);
    });
}

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

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
        mapMarkers = {};
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

    const ref = dbRT.ref('vehicleDrivers');
    ref.off();
    ref.on('value', (snap) => {
        const data = snap.val();
        if (!data) return;

        Object.values(mapMarkers).forEach(m => mapInstance.removeLayer(m));
        mapMarkers = {};

        let count = 0;
        const now = Date.now();

        Object.keys(data).forEach(code => {
            const v = data[code];
            if (userRole !== 'admin' && v.tenantId !== userTenantId) return;

            const loc = v.liveLocation;
            if (!loc || !loc.latitude || !loc.longitude) return;

            count++;
            const lastUpdate = loc.timestamp || 0;
            const isOnline = (now - lastUpdate) < 10000;
            const status = isOnline ? (v.status === 'moving' ? 'moving' : 'online') : 'offline';
            const carColor = status === 'moving' ? '#fbbf24' : status === 'online' ? '#22c55e' : '#ef4444';

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
// 📈 سجل الحركة والتقارير
// =============================================
function renderTracking() {
    const container = document.getElementById('page-tracking');
    if (!container) return;

    container.innerHTML = `
        <h2 class="text-2xl font-bold text-yellow-500 mb-6">📈 سجل الحركة والتقارير</h2>
        <div class="bg-gray-800 p-4 rounded-xl border border-gray-700">
            <p class="text-gray-300 mb-4">اختر النطاق الزمني لاستعراض التقرير الإجمالي للمسافات والحركات:</p>
            <div class="flex gap-2">
                <button onclick="loadTracking('today')" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded">اليوم</button>
                <button onclick="loadTracking('week')" class="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded">هذا الأسبوع</button>
            </div>
            <div id="trackingReportResults" class="mt-6 text-gray-300"></div>
        </div>
    `;
}

function loadTracking(period) {
    const res = document.getElementById('trackingReportResults');
    if (res) {
        res.innerHTML = `<div class="p-4 bg-gray-900 rounded">📊 تم توليد تقرير (${period === 'today' ? 'اليوم' : 'الأسبوع'}). النظام جاهز لتجميع بيانات السجلات من القاعدة.</div>`;
    }
}

// =============================================
// 👑 إدارة النظام (خاص بالأدمن Admin)
// =============================================
async function renderCompanies() {
    const container = document.getElementById('page-admin-companies');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-yellow-500">🏢 إدارة الشركات (Tenants)</h2>
            <button onclick="showAddCompany()" class="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-4 py-2 rounded">➕ شركة جديدة</button>
        </div>
        <div id="companiesList" class="space-y-3"></div>
    `;

    try {
        const snap = await dbFS.collection('tenants').get();
        const list = document.getElementById('companiesList');
        if (snap.empty) {
            list.innerHTML = '<p class="text-gray-500">لا توجد شركات مسجلة.</p>';
            return;
        }

        let html = '';
        snap.forEach(doc => {
            const c = doc.data();
            html += `
                <div class="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center flex-wrap gap-2">
                    <div>
                        <h4 class="font-bold text-yellow-500">${c.name}</h4>
                        <p class="text-sm text-gray-400">المالك: ${c.ownerName} | البريد: ${c.email}</p>
                        <p class="text-xs text-gray-500">حالة الاشتراك: ${c.subscriptionStatus || 'active'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="toggleCompany('${doc.id}')" class="bg-gray-700 hover:bg-gray-600 text-xs text-white px-3 py-1 rounded">إيقاف/تفعيل</button>
                        <button onclick="deleteCompany('${doc.id}')" class="bg-red-600 hover:bg-red-700 text-xs text-white px-3 py-1 rounded">حذف</button>
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
    const name = prompt("اسم الشركة:");
    const ownerName = prompt("اسم المالك:");
    const email = prompt("البريد الإلكتروني:");
    if (!name || !email) return;

    const id = `tenant_${Date.now()}`;
    dbFS.collection('tenants').doc(id).set({
        name, ownerName, email,
        status: 'active',
        subscriptionStatus: 'active',
        createdAt: Date.now()
    }).then(() => {
        alert("✅ تم إضافة الشركة بنجاح.");
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
        alert(`تم تغيير الحالة إلى ${next}`);
        renderCompanies();
    }
}

async function deleteCompany(id) {
    if (confirm("هل تريد بالتأكيد حذف هذه الشركة؟")) {
        await dbFS.collection('tenants').doc(id).delete();
        renderCompanies();
    }
}

function renderAdminVehicles() {
    const container = document.getElementById('page-admin-vehicles');
    if (container) {
        container.innerHTML = `<h2 class="text-2xl font-bold text-yellow-500 mb-4">👑 كل المركبات بالنظام</h2><p class="text-gray-400">عرض وإدارة جميع المركبات لدى كافة الشركات المسجلة.</p>`;
    }
}

function renderSubscriptions() {
    const container = document.getElementById('page-admin-subscriptions');
    if (container) {
        container.innerHTML = `<h2 class="text-2xl font-bold text-yellow-500 mb-4">💳 إدارة الاشتراكات والتجديد</h2><p class="text-gray-400">سجل اشتراكات الشركات والعمليات المالية.</p>`;
    }
}

// =========================================================================
// 🔥 الميزات المضافة والمحسنة
// =========================================================================

// =============================================
// 1️⃣ حساب المسافة بالكيلومترات (معادلة Haversine)
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
// 2️⃣ نافذة سجل حركة السائق (خريطة + حساب كيلومترات)
// =============================================
async function showDriverHistoryMapModal(code) {
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

    setTimeout(async () => {
        if (historyMapInstance) {
            historyMapInstance.remove();
        }

        historyMapInstance = L.map('history-map-container').setView([30.0444, 31.2357], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(historyMapInstance);

        setTimeout(() => {
            historyMapInstance.invalidateSize();
        }, 100);

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
                historyPolyline = L.polyline(points, { color: 'blue', weight: 4, opacity: 0.7 }).addTo(historyMapInstance);
                historyMapInstance.fitBounds(historyPolyline.getBounds()); 

                L.marker(points[0]).addTo(historyMapInstance).bindPopup('🏁 نقطة البداية');
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
// 3️⃣ تسجيل الدخول المخصص للعمال والشركات من Firestore
// =============================================
async function handleCustomDatabaseLogin(username, password) {
    try {
        const usersRef = dbFS.collection('users');
        const querySnapshot = await usersRef.where('username', '==', username).where('password', '==', password).get();

        if (querySnapshot.empty) {
            throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
        }

        const userData = querySnapshot.docs[0].data();
        const userId = querySnapshot.docs[0].id;

        const tenantRef = await dbFS.collection('tenants').doc(userData.tenantId).get();
        if (!tenantRef.exists) {
            throw new Error("بيانات الشركة غير موجودة.");
        }

        const tenantData = tenantRef.data();
        
        // التحقق من حالة الاشتراك قبل السماح بالدخول
        const subscriptionCheck = await checkSubscriptionStatus(userData.tenantId);
        if (!subscriptionCheck.valid) {
            showSubscriptionExpiredScreen(subscriptionCheck.tenantData || tenantData);
            return;
        }

        currentUser = { uid: userId, displayName: userData.name, email: userData.email || username };
        currentUserId = userId;
        userRole = userData.role || 'worker'; 
        userTenantId = userData.tenantId;

        alert(`مرحباً بك ${userData.name}! تم تسجيل الدخول بنجاح.`);
        
        showDashboard(); 

    } catch (error) {
        showGlobalError(error.message);
    }
}

// =============================================
// 4️⃣ إنشاء حساب جديد مع فترة تجريبية 15 يوم
// =============================================
async function handleIndexGmailSignup(email, password, companyName, ownerName, phone) {
    try {
        const userCred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = userCred.user.uid;

        await userCred.user.updateProfile({ displayName: ownerName });

        const now = Date.now();
        const trialEndDate = now + (15 * 24 * 60 * 60 * 1000); // 15 يوم
        const newTenantId = `tenant_${now}`;
        
        await dbFS.collection('tenants').doc(newTenantId).set({
            name: companyName,
            ownerName: ownerName,
            email: email,
            phone: phone || '',
            username: email, // استخدام البريد كاسم مستخدم افتراضي
            password: password,
            status: 'active',
            subscriptionStatus: 'trial', // فترة تجريبية
            subscriptionPeriod: 'month', // افتراضي شهر ويمكن تغييره لاحقاً
            trialEndDate: trialEndDate,
            subscriptionEndDate: trialEndDate, // يبدأ الاشتراك الفعلي بعد التجربة
            paymentMethod: null,
            paymentStatus: 'none',
            lastPaymentDate: null,
            vehiclesCount: 0,
            createdAt: now
        });

        await dbFS.collection('users').doc(uid).set({
            tenantId: newTenantId,
            email: email,
            name: ownerName,
            phone: phone || '',
            username: email,
            password: password,
            role: 'company_admin',
            status: 'active',
            createdAt: now
        });

        alert('✅ تم إنشاء الحساب بنجاح!\nلديك فترة تجريبية لمدة 15 يوم.');
        
        // تسجيل الدخول تلقائياً
        currentUser = userCred.user;
        currentUserId = uid;
        userRole = 'company_admin';
        userTenantId = newTenantId;
        
        showDashboard();
        
    } catch (error) {
        console.error('❌ فشل إنشاء الحساب:', error.message);
        alert(`فشل إنشاء الحساب: ${error.message}`);
    }
}

// =============================================
// 🚀 بدء التطبيق والتحقق من حالة الدخول
// =============================================
auth.onAuthStateChanged(async (user) => {
    console.log('🔄 حالة المصادقة:', user ? 'مستخدم مسجل' : 'لا يوجد مستخدم');
    
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

            // التحقق من الاشتراك (ما عدا الأدمن)
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
            userRole = 'customer';
            userTenantId = 'default';
            showDashboard();
        }
    } else {
        const success = await ensureAdminAccount();
        if (!success) {
            const loginScreen = document.getElementById('loginScreen');
            const dashboardScreen = document.getElementById('dashboardScreen');
            if (loginScreen) loginScreen.classList.remove('hidden');
            if (dashboardScreen) dashboardScreen.classList.add('hidden');
        }
    }
});
