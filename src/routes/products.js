const express = require('express');
const router = express.Router();
const supabase = require('../config/db');

// جلب جميع المنتجات
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('products').select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة منتج جديد
router.post('/', async (req, res) => {
  const { name, description, price, stock, category } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'اسم المنتج والسعر إجباريان' });
  }
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([{ name, description, price, stock, category }])
      .select();
    if (error) throw error;
    res.status(201).json({ message: 'تم إضافة المنتج بنجاح', product: data[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب المنتجات حسب القسم ونطاق الأكواد الجديد
router.get('/category/:id', async (req, res) => {
    try {
        const categoryId = req.params.id;

        // 1. جلب بيانات القسم لمعرفة نطاق الأكواد (code_from و code_to)
        const { data: categoryData, error: catError } = await supabase
            .from('categories')
            .select('*')
            .eq('id', categoryId)
            .single();

        if (catError || !categoryData) {
            return res.status(404).json({ error: 'القسم غير موجود' });
        }

        const { code_from, code_to } = categoryData;

        // 2. جلب المنتجات الواقعة داخل نطاق الأكواد هذا
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('*')
            .gte('code', code_from)
            .lte('code', code_to);

        if (prodError) {
            return res.status(500).json({ error: prodError.message });
        }

        res.json({
            category: categoryData,
            products: products
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;