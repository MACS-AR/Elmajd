/**
 * إظهار تنبيه منبثق (Toast)
 * @param {string} message - نص التنبيه
 * @param {string} type - نوع التنبيه (success, error, warning, info)
 */
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 left-4 z-[9999] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  
  // تحديد الألوان بناءً على هوية المصنع والنظام
  const styles = {
    success: 'bg-[#10b981] text-white border-[#047857]',
    error: 'bg-red-600 text-white border-red-800',
    warning: 'bg-[#d97706] text-white border-amber-700',
    info: 'bg-white text-gray-800 border-gray-200 shadow-lg'
  };

  const icons = {
    success: '<i class="fa-solid fa-check-circle"></i>',
    error: '<i class="fa-solid fa-circle-exclamation"></i>',
    warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
    info: '<i class="fa-solid fa-circle-info"></i>'
  };

  toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg border shadow-md transform transition-all duration-300 translate-y-10 opacity-0 ${styles[type]}`;
  toast.innerHTML = `
    <span class="text-lg">${icons[type]}</span>
    <span class="font-semibold text-sm">${message}</span>
  `;

  container.appendChild(toast);

  // أنيميشن الظهور
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  // أنيميشن الإخفاء والحذف
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}
