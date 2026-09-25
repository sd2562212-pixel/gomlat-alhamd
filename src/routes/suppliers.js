const express = require('express');
const router = express.Router();

// يمكنك استبدال هذا بالعميل الخاص بـ Supabase المُعرف في مشروعك
// أو التعامل معه عبر الكود الحالي المعتمد لديك في السيرفر

// مسار لإضافة فاتورة مورد جديدة
router.post('/add-invoice', async (req, res) => {
    const { supplier_name, product_id, quantity_purchased } = req.body;

    try {
        // إدخال الفاتورة في جدول supplier_invoices 
        // (قاعدة البيانات ستقوم تلقائياً بتحديث المخزن عبر الـ Trigger الذي أنشأناه)
        const { data, error } = await req.supabaseClient // أو استخدام كود الاتصال بـ supabase لديك
            .from('supplier_invoices')
            .insert([{ supplier_name, product_id, quantity_purchased }]);

        if (error) throw error;

        res.status(200).json({ success: true, message: 'تم حفظ الفاتورة وتحديث المخزن تلقائياً بنجاح!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;