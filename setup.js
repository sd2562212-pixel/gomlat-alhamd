const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// الاتصال بقاعدة بيانات Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ==================== مسارات المنتجات (Products) ====================

// جلب كل المنتجات
app.get('/api/products', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching products:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// إضافة منتج جديد
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, price, stock } = req.body;
        const { data, error } = await supabase
            .from('products')
            .insert([{ name, description, price, stock: parseInt(stock || 0) }])
            .select();
        
        if (error) throw error;
        res.status(201).json({ message: 'تم إضافة المنتج بنجاح', data: data[0] });
    } catch (err) {
        console.error('Error adding product:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// زيادة كمية المخزن (فواتير التوريد)
app.put('/api/products/:id/add-stock', async (req, res) => {
    try {
        const { id } = req.params;
        const { additionalStock } = req.body;

        const qtyToAdd = parseInt(additionalStock || 0);
        if (qtyToAdd <= 0) {
            return res.status(400).json({ error: 'يجب تحديد كمية صحيحة للإضافة' });
        }

        const { data: prodData, error: prodErr } = await supabase
            .from('products')
            .select('stock')
            .eq('id', id)
            .single();

        if (prodErr || !prodData) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }

        const newStock = prodData.stock + qtyToAdd;

        const { data, error } = await supabase
            .from('products')
            .update({ stock: newStock })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({ message: 'تم زيادة كمية المخزن بنجاح', data: data[0] });
    } catch (err) {
        console.error('Error adding stock:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// تحديث سعر المنتج في أي وقت
app.put('/api/products/:id/price', async (req, res) => {
    try {
        const { id } = req.params;
        const { newPrice } = req.body;

        const priceNum = parseFloat(newPrice);
        if (isNaN(priceNum) || priceNum < 0) {
            return res.status(400).json({ error: 'يجب تحديد سعر صحيح' });
        }

        const { data, error } = await supabase
            .from('products')
            .update({ price: priceNum })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({ message: 'تم تحديث سعر المنتج بنجاح', data: data[0] });
    } catch (err) {
        console.error('Error updating price:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// مسح منتج نهائياً من المخزن
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ status: 'Success', message: 'تم حذف المنتج من المخزن نهائياً' });
    } catch (err) {
        console.error('Error deleting product:', err.message);
        res.status(500).json({ status: 'Error', message: 'فشل في حذف المنتج', error: err.message });
    }
});

// ==================== مسارات الطلبات (Orders) ====================

// جلب كل الطلبات
app.get('/api/orders', async (req, res) => {
    try {
        const { data, error } = await supabase.from('orders').select('*').order('id', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error('Error fetching orders:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', async (req, res) => {
    try {
        const { product_id, quantity, shipping_address } = req.body;

        const { data: productData, error: productError } = await supabase
            .from('products')
            .select('*')
            .eq('id', product_id)
            .single();

        if (productError || !productData) {
            return res.status(404).json({ error: 'المنتج غير موجود' });
        }

        const qty = parseInt(quantity || 1);
        const total_amount = productData.price * qty;
        const items = [{ id: productData.id, name: productData.name, quantity: qty, price: productData.price }];

        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert([{
                items: items,
                total_amount: total_amount,
                shipping_address: shipping_address,
                status: 'pending'
            }])
            .select();

        if (orderError) throw orderError;

        res.status(201).json({ message: 'تم إنشاء الطلب بنجاح', data: orderData[0] });
    } catch (err) {
        console.error('Error creating order:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// تحديث حالة الطلب مع التحقق الصارم من توفر المخزن عند التوصيل
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ status: 'Error', message: 'الحالة مطلوبة للتحديث' });
        }

        const { data: currentOrder, error: fetchError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !currentOrder) {
            return res.status(404).json({ status: 'Error', message: 'الطلب غير موجود' });
        }

        const oldStatus = currentOrder.status;

        let itemsList = [];
        try {
            if (typeof currentOrder.items === 'string') {
                itemsList = JSON.parse(currentOrder.items);
            } else if (Array.isArray(currentOrder.items)) {
                itemsList = currentOrder.items;
            } else if (currentOrder.items) {
                itemsList = [currentOrder.items];
            }
        } catch (err) {
            console.error('Failed to parse order items:', err);
        }

        if (status === 'delivered' && oldStatus !== 'delivered') {
            for (const item of itemsList) {
                const prodId = item.id || item.product_id;
                const qty = parseInt(item.quantity || 1);

                if (prodId) {
                    const { data: prod, error: prodErr } = await supabase.from('products').select('name, stock').eq('id', prodId).single();
                    if (prodErr || !prod) {
                        return res.status(404).json({ status: 'Error', message: 'المنتج المرتبط بالطلب غير موجود في المخزن' });
                    }

                    if (prod.stock < qty) {
                        return res.status(400).json({ 
                            status: 'Error', 
                            message: `فشل التوصيل: الكمية غير متوفرة في المخزن للمنتج "${prod.name}". المتاح حالياً (${prod.stock}) بينما المطلوبة (${qty}).` 
                        });
                    }
                }
            }

            for (const item of itemsList) {
                const prodId = item.id || item.product_id;
                const qty = parseInt(item.quantity || 1);

                if (prodId) {
                    const { data: prod } = await supabase.from('products').select('stock').eq('id', prodId).single();
                    if (prod) {
                        const newStock = prod.stock - qty;
                        await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
                    }
                }
            }
        } else if (oldStatus === 'delivered' && status !== 'delivered') {
            for (const item of itemsList) {
                const prodId = item.id || item.product_id;
                const qty = parseInt(item.quantity || 1);

                if (prodId) {
                    const { data: prod } = await supabase.from('products').select('stock').eq('id', prodId).single();
                    if (prod) {
                        const restoredStock = prod.stock + qty;
                        await supabase.from('products').update({ stock: restoredStock }).eq('id', prodId);
                    }
                }
            }
        }

        const { data, error } = await supabase
            .from('orders')
            .update({ status: status })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.json({
            status: 'Success',
            message: 'تم تحديث حالة الطلب وإدارة المخزون بنجاح',
            data: data[0]
        });
    } catch (err) {
        console.error('Server Error updating order:', err.message);
        res.status(500).json({ status: 'Error', message: err.message || 'فشل في تحديث حالة الطلب' });
    }
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});