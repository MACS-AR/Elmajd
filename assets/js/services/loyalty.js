import { db, auth } from "../firebase/config.js";
import { doc, updateDoc, runTransaction, collection, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { generateUniqueId } from "../utils/helpers.js";
import { showToast } from "../utils/ui.js";
import { logActivity } from "./audit.js";

const TIERS = {
  BRONZE: { name: '🥉 برونزي', min: 0 },
  SILVER: { name: '🥈 فضي', min: 1000 },
  GOLD: { name: '🥇 ذهبي', min: 3000 },
  PLATINUM: { name: '💎 بلاتيني', min: 7000 }
};

function calculateTier(totalPoints) {
  if (totalPoints >= TIERS.PLATINUM.min) return TIERS.PLATINUM.name;
  if (totalPoints >= TIERS.GOLD.min) return TIERS.GOLD.name;
  if (totalPoints >= TIERS.SILVER.min) return TIERS.SILVER.name;
  return TIERS.BRONZE.name;
}

// 1. توليد الأكواد (للمدير)
export async function generateBatchCodes(productName, batchNo, count, points, expiryDate) {
  try {
    const batch = writeBatch(db);
    const codesRef = collection(db, "loyalty_codes");
    const generatedCodes = [];

    for (let i = 0; i < count; i++) {
      const uniqueCodeId = generateUniqueId(12);
      const docRef = doc(codesRef, uniqueCodeId);
      batch.set(docRef, {
        productName,
        batchNo,
        points: Number(points),
        expiry: expiryDate,
        used: false,
        createdAt: new Date().toISOString()
      });
      generatedCodes.push(uniqueCodeId);
    }
    await batch.commit();
    return { success: true, count: generatedCodes.length, codes: generatedCodes };
  } catch (error) {
    return { success: false, error };
  }
}

// 2. استبدال الكود (للعميل)
export async function redeemQRCode(codeId) {
  const user = auth.currentUser;
  if (!user) {
    showToast("يجب تسجيل الدخول برقم الهاتف أولاً", "error");
    return false;
  }

  const codeRef = doc(db, "loyalty_codes", codeId);
  const userRef = doc(db, "users", user.uid);

  try {
    await runTransaction(db, async (transaction) => {
      const codeDoc = await transaction.get(codeRef);
      if (!codeDoc.exists()) throw new Error("الكود غير صالح.");
      
      const codeData = codeDoc.data();
      if (codeData.used) throw new Error("تم تسجيل هذا الكود مسبقاً.");
      if (new Date(codeData.expiry) < new Date()) throw new Error("صلاحية الكود منتهية.");

      const userDoc = await transaction.get(userRef);
      const currentPoints = userDoc.data().points || 0;
      const newTotalPoints = currentPoints + codeData.points;

      transaction.update(codeRef, {
        used: true,
        usedBy: user.uid,
        usedAt: new Date().toISOString()
      });

      transaction.update(userRef, {
        points: newTotalPoints,
        tier: calculateTier(newTotalPoints)
      });
    });

    await logActivity(user.uid, `إضافة نقاط للكود ${codeId}`);
    showToast("تمت إضافة النقاط بنجاح!", "success");
    return true;
  } catch (error) {
    showToast(error.message, "error");
    return false;
  }
}
