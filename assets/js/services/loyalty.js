import { db } from "../firebase/config.js";
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { generateUniqueId } from "../utils/helpers.js";

/**
 * توليد أكواد QR فريدة لدفعة إنتاج كاملة (Admin Only)
 * @param {string} productName - اسم المنتج
 * @param {string} batchNo - رقم دفعة الإنتاج
 * @param {number} count - عدد الأكواد المطلوب توليدها
 * @param {number} points - عدد النقاط لكل كود
 * @param {Date} expiryDate - تاريخ الصلاحية
 */
export async function generateBatchCodes(productName, batchNo, count, points, expiryDate) {
  try {
    const batch = writeBatch(db);
    const codesRef = collection(db, "loyalty_codes");
    const generatedCodes = [];

    for (let i = 0; i < count; i++) {
      // توليد كود عشوائي مشفر لا يمكن تخمينه
      const uniqueCodeId = generateUniqueId(12);
      const docRef = doc(codesRef, uniqueCodeId);
      
      const codeData = {
        productName,
        batchNo,
        points,
        expiry: expiryDate.toISOString(),
        used: false,
        createdAt: new Date().toISOString()
      };
      
      batch.set(docRef, codeData);
      generatedCodes.push(uniqueCodeId);
    }

    // تنفيذ الإضافة لقاعدة البيانات دفعة واحدة (أداء أسرع)
    await batch.commit();
    return { success: true, count: generatedCodes.length, codes: generatedCodes };
  } catch (error) {
    console.error("خطأ في توليد الأكواد:", error);
    return { success: false, error };
  }
}
