import { db } from "../firebase/config.js";
import { 
  collection, doc, addDoc, getDocs, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * جلب العملاء الخاصين بمندوب محدد
 * @param {string} salesUid - UID الخاص بالمندوب
 */
export async function getCustomersBySales(salesUid) {
  const customers = [];
  try {
    const q = query(
      collection(db, "users"), 
      where("role", "==", "customer"),
      where("assignedSalesRef", "==", salesUid)
    );
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      customers.push({ id: doc.id, ...doc.data() });
    });
    return customers;
  } catch (error) {
    console.error("خطأ في جلب العملاء:", error);
    return [];
  }
}

/**
 * إنشاء طلب جديد (يتم بواسطة المندوب أو الإدارة)
 */
export async function createNewOrder(orderData) {
  try {
    const ordersRef = collection(db, "orders");
    const docRef = await addDoc(ordersRef, {
      ...orderData,
      status: "تحت المراجعة",
      createdAt: serverTimestamp()
    });
    return { success: true, id: docRef.id };
  } catch (error) {
    console.error("خطأ في إنشاء الطلب:", error);
    return { success: false, error };
  }
}
