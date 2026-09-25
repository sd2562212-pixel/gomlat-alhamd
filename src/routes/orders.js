const express = require('express');
const router = express.Router();
const supabase = require('../config/db.js');

// 1. جلب كل الطلبات
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ status: 'Error', message: 'فشل في جلب الطلبات', error: err.message });
  }
});

// 2. إنشاء طلب جديد متوافق مع جدول items و total_amount
router.post('/', async (req, res) => {
  try {
    const { product_id, quantity, shipping_address, address } = req.body;
    const finalAddress = shipping_address || address;

    if (!product_id || !quantity || !finalAddress) {
      return res.status(400).json({ status: 'Error', message: 'برجاء إدخال بيانات الطلب وعنوان الشحن' });
    }

    // جلب سعر المنتج من جدول products لحساب total_amount
    const { data: productData, error: prodError } = await supabase
      .from('products')
      .select('price, name')
      .eq('id', product_id)
      .single();

    if (prodError || !productData) {
      return res.status(404).json({ status: 'Error', message: 'المنتج غير موجود' });
    }

    const total_amount = productData.price * quantity;

    // إدخال الطلب بالشكل الصحيح المطابق لجدول الـ SQL لديك
    const { data, error } = await supabase
      .from('orders')
      .insert([{
        items: JSON.stringify([{ product_id, name: productData.name, quantity, price: productData.price }]),
        total_amount: total_amount,
        shipping_address: finalAddress,
        status: 'pending'
      }])
      .select();

    if (error) throw error;

    res.status(201).json({
      status: 'Success',
      message: 'تم تسجيل الطلب بنجاح',
      data: data[0]
    });
  } catch (err) {
    res.status(500).json({ status: 'Error', message: 'فشل في إنشاء الطلب', error: err.message });
  }
});

module.exports = router;