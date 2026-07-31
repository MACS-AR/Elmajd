import { auth, db } from "./config.js";
import { 
  signInWithEmailAndPassword, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. تسجيل دخول (الإدارة / المندوب) عبر البريد وكلمة المرور
export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await handleUserRedirection(cred.user);
  } catch (error) {
    alert("خطأ في بيانات الدخول. تأكد من صحة البريد وكلمة المرور.");
  }
}

// 2. إعداد ريكابتشا للمصادقة الهاتفية للعملاء
export function setupRecaptcha(buttonId) {
  window.recaptchaVerifier = new RecaptchaVerifier(auth, buttonId, {
    'size': 'invisible'
  });
}

// 3. إرسال كود OTP للعميل (بشرط وجود الرقم في قاعدة البيانات)
export async function sendPhoneOTP(phoneNumber) {
  try {
    // التحقق الصارم: هل العميل مسجل في النظام مسبقاً؟
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("phone", "==", phoneNumber), where("role", "==", "customer"));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("رقم الهاتف غير مسجل في النظام. لا تملك صلاحية الدخول، يرجى مراجعة إدارة المبيعات.");
      return false;
    }

    // إذا كان الرقم مسجلاً، يتم إرسال الكود
    const appVerifier = window.recaptchaVerifier;
    const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    window.confirmationResult = confirmationResult;
    return true;
  } catch (error) {
    console.error("OTP Error:", error);
    alert("فشل إرسال الكود، راجع اتصالك أو صيغة الرقم (يجب أن يبدأ 01)");
    return false;
  }
}

// 4. تأكيد كود OTP ودخول العميل
export async function verifyPhoneOTP(code) {
  try {
    await window.confirmationResult.confirm(code);
    window.location.href = "customer.html";
  } catch (error) {
    alert("الكود غير صحيح أو منتهي الصلاحية.");
  }
}

// 5. توجيه المستخدم حسب دوره (Role Based Redirection)
async function handleUserRedirection(user) {
  const docSnap = await getDoc(doc(db, "users", user.uid));
  
  if (docSnap.exists()) {
    const userData = docSnap.data();
    
    // منع الحسابات الموقوفة
    if (userData.status === 'inactive') {
      await signOut(auth);
      alert("هذا الحساب موقوف من قبل الإدارة.");
      return;
    }

    // التوجيه
    if (userData.role === 'admin') {
      window.location.href = "admin.html";
    } else if (userData.role === 'sales') {
      window.location.href = "sales.html";
    }
  } else {
    await signOut(auth);
    alert("بيانات المستخدم غير موجودة في النظام.");
  }
}

// تسجيل الخروج العام
export async function logoutUser() {
  await signOut(auth);
  window.location.href = "login.html";
}
