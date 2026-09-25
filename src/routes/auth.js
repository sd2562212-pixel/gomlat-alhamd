const express = require('express');
const router = express.Router();
const supabase = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// تسجيل مستخدم جديد
router.post('/register', async (req, res) => {
  const { name, phone, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, phone, password: hashedPassword, role: role || 'trader' }])
      .select();

    if (error) throw error;
    res.status(201).json({ message: 'تم إنشاء الحساب بنجاح', user: data[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// تسجيل الدخول
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();

    if (error || !data) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) return res.status(400).json({ error: 'كلمة المرور غير صحيحة' });

    const token = jwt.sign({ id: data.id, role: data.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ message: 'تم تسجيل الدخول بنجاح', token, user: { id: data.id, name: data.name, role: data.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;