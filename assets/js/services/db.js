import { db } from "../firebase/config.js";
import { 
  collection, doc, addDoc, getDocs, query, where, 
  serverTimestamp, updateDoc, deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ================= المبيعات والعملاء =================

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
    console.error("خطأ:", error);
    return [];
  }
}

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
    return { success: false, error };
  }
}

// ================= الإدارة (Admin) =================

// تحديث حالة الطلب (اعتماد / رفض / تسليم)
export async function updateOrderStatus(orderId, newStatus) {
  try {
    const orderRef = doc(db, "orders", orderId);
    await updateDoc(orderRef, { status: newStatus });
    return true;
  } catch (error) {
    return false;
  }
}

// إضافة منتج جديد
export async function createProduct(productData) {
  try {
    const prodRef = collection(db, "products");
    await addDoc(prodRef, {
      ...productData,
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    return false;
  }
}

// تحديث مخزون المنتج
export async function updateProductStock(productId, newStock) {
  try {
    const prodRef = doc(db, "products", productId);
    await updateDoc(prodRef, { stock: newStock });
    return true;
  } catch (error) {
    return false;
  }
}

// إضافة مستخدم (مندوب أو عميل)
export async function createUserRecord(uid, userData) {
  try {
    // يتم استخدام UID القادم من Firebase Auth
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      ...userData,
      createdAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    return false;
  }
}
