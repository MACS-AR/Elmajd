import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// إعدادات مصنع المجد للأعلاف (Firebase Config)
const firebaseConfig = {
  apiKey: "AIzaSyBgRkceRq7FRbhCevLlULYNy-A5Tl_cr0w",
  authDomain: "sr-test-c9e06.firebaseapp.com",
  databaseURL: "https://sr-test-c9e06-default-rtdb.firebaseio.com",
  projectId: "sr-test-c9e06",
  storageBucket: "sr-test-c9e06.firebasestorage.app",
  messagingSenderId: "658396508062",
  appId: "1:658396508062:web:c56cd84f93daa2e176308f",
  measurementId: "G-3ZZV344NDK"
};

// تهيئة التطبيق والخدمات
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
