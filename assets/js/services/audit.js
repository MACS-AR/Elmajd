import { db } from "../firebase/config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * تسجيل حركة داخل النظام
 * @param {string} uid - المعرف الخاص بالمستخدم
 * @param {string} action - نوع العملية (مثال: "تسجيل دخول", "اعتماد طلب")
 * @param {object} details - تفاصيل إضافية عن العملية
 */
export async function logActivity(uid, action, details = {}) {
  try {
    const logsRef = collection(db, "audit_logs");
    
    // محاولة جلب نوع المتصفح والجهاز كبديل لـ IP في بيئة الـ Frontend
    const userAgent = navigator.userAgent;
    
    await addDoc(logsRef, {
      userId: uid,
      action: action,
      details: details,
      device: userAgent,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("فشل في تسجيل العملية (Audit Log):", error);
  }
}
