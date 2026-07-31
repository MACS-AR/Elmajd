/**
 * تنسيق الرقم إلى عملة الجنيه المصري
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2
  }).format(amount);
}

/**
 * تنسيق التاريخ إلى صيغة مقروءة
 */
export function formatDate(isoString) {
  if (!isoString) return '---';
  const options = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Date(isoString).toLocaleDateString('ar-EG', options);
}

/**
 * توليد سلسلة نصية فريدة (للأكواد وأرقام الفواتير)
 */
export function generateUniqueId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * دالة لتوليد رابط الـ QR Code باستخدام API خارجي خفيف
 * @param {string} data - البيانات المراد تحويلها لـ QR
 */
export function getQRCodeUrl(data) {
  const baseUrl = "https://api.qrserver.com/v1/create-qr-code/";
  const encodedData = encodeURIComponent(data);
  return `${baseUrl}?size=150x150&data=${encodedData}&color=047857`;
}
