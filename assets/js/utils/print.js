import { formatCurrency, formatDate, getQRCodeUrl } from "./helpers.js";

/**
 * طباعة فاتورة / طلب للمندوب أو الإدارة
 * @param {object} orderData - بيانات الطلب
 * @param {object} customerData - بيانات العميل
 */
export function printOrderInvoice(orderData, customerData) {
  const printWindow = window.open('', '_blank');
  
  // توليد QR Code للطلب
  const qrUrl = getQRCodeUrl(`Order:${orderData.id}|Amount:${orderData.netTotal}`);

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>فاتورة طلب #${orderData.id.slice(-6)}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        body { font-family: 'Tajawal', sans-serif; background: white; color: #1f2937; }
      </style>
    </head>
    <body class="p-8" onload="setTimeout(() => { window.print(); window.close(); }, 500);">
      
      <div class="flex justify-between items-start border-b-2 border-[#10b981] pb-6 mb-6">
        <div>
          <!-- الشعار من المستودع -->
          <img src="https://raw.githubusercontent.com/username/elmajd-erp/main/assets/images/logo.png" style="height: 60px;" alt="المجد للأعلاف">
          <h1 class="text-2xl font-black text-[#047857] mt-2">المجد للأعلاف</h1>
          <p class="text-sm text-gray-500">فاتورة مبيعات معتمدة</p>
        </div>
        <div class="text-left">
          <img src="${qrUrl}" alt="QR Code" class="h-20 w-20 ml-auto border p-1 rounded">
          <p class="text-sm font-bold mt-2">طلب #${orderData.id.slice(-6)}</p>
          <p class="text-xs text-gray-500">${formatDate(orderData.createdAt)}</p>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg mb-6 text-sm border border-gray-200">
        <div>
          <p class="text-gray-500 text-xs mb-1">بيانات العميل:</p>
          <p class="font-bold text-lg">${customerData.name}</p>
          <p>هاتف: <span dir="ltr">${customerData.phone}</span></p>
          <p>العنوان: ${customerData.address || 'غير مسجل'}</p>
        </div>
        <div class="text-left">
          <p class="text-gray-500 text-xs mb-1">المندوب المسؤول:</p>
          <p class="font-bold">${orderData.salesName}</p>
          <p class="text-xs bg-amber-100 text-[#d97706] inline-block px-2 py-1 rounded mt-1">${orderData.status}</p>
        </div>
      </div>

      <table class="w-full text-right mb-6 text-sm border-collapse border border-gray-200">
        <thead>
          <tr class="bg-[#047857] text-white">
            <th class="p-2 border border-gray-200">المنتج</th>
            <th class="p-2 text-center border border-gray-200">الكمية</th>
            <th class="p-2 text-left border border-gray-200">السعر</th>
            <th class="p-2 text-left border border-gray-200">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="p-2 border border-gray-200 font-bold">${orderData.productName}</td>
            <td class="p-2 text-center border border-gray-200">${orderData.qty}</td>
            <td class="p-2 text-left border border-gray-200">${formatCurrency(orderData.unitPrice)}</td>
            <td class="p-2 text-left border border-gray-200">${formatCurrency(orderData.subTotal)}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex justify-end mt-4">
        <div class="w-1/2 space-y-2 text-sm text-left">
          <div class="flex justify-between"><span>الإجمالي:</span> <span>${formatCurrency(orderData.subTotal)}</span></div>
          <div class="flex justify-between text-red-600"><span>الخصم:</span> <span>${formatCurrency(orderData.discount)}</span></div>
          <div class="flex justify-between font-black text-lg border-t-2 border-[#10b981] pt-2 text-[#047857]">
            <span>الصافي المطلوب:</span> <span>${formatCurrency(orderData.netTotal)}</span>
          </div>
        </div>
      </div>

      <div class="mt-12 pt-4 border-t border-gray-200 text-center text-xs text-gray-500 flex justify-between">
        <span>توقيع العميل: ......................</span>
        <span>توقيع المندوب: ......................</span>
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}
