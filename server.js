const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// إعدادات الوسيط (Middleware)
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات (يدعم التخزين الدائم على السحاب أو محلياً)
const dbDir = process.env.RENDER ? '/opt/render/project/data' : __dirname;
const dbPath = path.resolve(dbDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات المحلية:', err.message);
    } else {
        console.log('✅ تم الاتصال بنجاح بقاعدة البيانات SQLite في مسار:', dbPath);
        initDatabase();
    }
});

// دالة إنشاء جميع الجداول تلقائياً عند بدء التشغيل
function initDatabase() {
    db.serialize(() => {
        // 1. جدول الأقسام
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            image_url TEXT,
            code_from INTEGER,
            code_to INTEGER
        )`);

        // 2. جدول المنتجات
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT,
            image_url TEXT,
            price REAL,
            cost_price REAL,
            stock INTEGER,
            category_id INTEGER
        )`);

        // 3. جدول دليل الموردين
        db.run(`CREATE TABLE IF NOT EXISTS suppliers_directory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT
        )`);

        // 4. جدول فواتير الموردين (المشتريات)
        db.run(`CREATE TABLE IF NOT EXISTS suppliers_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            invoice_date TEXT,
            total_amount REAL,
            paid_amount REAL,
            items TEXT,
            is_return INTEGER
        )`);

        // 5. جدول دليل العملاء / التجار
        db.run(`CREATE TABLE IF NOT EXISTS customers_directory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            password TEXT
        )`);

        // 6. جدول فواتير العملاء (المبيعات)
        db.run(`CREATE TABLE IF NOT EXISTS customers_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            invoice_date TEXT,
            total_amount REAL,
            paid_amount REAL,
            items TEXT,
            is_return INTEGER
        )`);

        // 7. جدول طلبات العملاء عبر التطبيق
        db.run(`CREATE TABLE IF NOT EXISTS client_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            order_date TEXT,
            total_amount REAL,
            status TEXT,
            items TEXT
        )`);

        // 8. جدول إعدادات النظام وتفعيل البرنامج
        db.run(`CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);
    });
}

// ==================== 0. مسارات الإعدادات وتفعيل البرنامج وحذف البيانات ====================

// مسار تفعيل البرنامج
app.post('/api/app/activate', (req, res) => {
    const { status } = req.body;
    db.run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('is_activated', ?)`, [status || 'true'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'تم تفعيل البرنامج بنجاح' });
    });
});

// مسار التحقق من حالة التفعيل
app.get('/api/app/status', (req, res) => {
    db.get(`SELECT value FROM app_settings WHERE key = 'is_activated'`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ is_activated: row ? row.value : 'false' });
    });
});

// مسار حذف وتصفير جميع بيانات البرنامج (Clear / Reset All Data) - مُصحح وآمن ضد قيود السيكوال
app.post('/api/app/clear-all-data', (req, res) => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = OFF;");
        db.run('DELETE FROM categories');
        db.run('DELETE FROM products');
        db.run('DELETE FROM suppliers_directory');
        db.run('DELETE FROM suppliers_invoices');
        db.run('DELETE FROM customers_directory');
        db.run('DELETE FROM customers_invoices');
        db.run('DELETE FROM client_orders', (err) => {
            db.run("PRAGMA foreign_keys = ON;");
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'تم حذف وتصفير جميع بيانات البرنامج بنجاح' });
        });
    });
});

// ==================== 1. مسارات الأقسام (Categories) ====================
app.get('/api/categories', (req, res) => {
    db.all('SELECT * FROM categories ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categories', (req, res) => {
    let { name, image_url, code_from, code_to } = req.body;
    const cleanName = name ? String(name).trim() : 'قسم بدون اسم';
    const cleanImg = image_url ? String(image_url).trim() : null;
    const cleanFrom = (code_from !== '' && code_from != null) ? Number(code_from) : null;
    const cleanTo = (code_to !== '' && code_to != null) ? Number(code_to) : null;

    const query = `INSERT INTO categories (name, image_url, code_from, code_to) VALUES (?, ?, ?, ?)`;
    db.run(query, [cleanName, cleanImg, cleanFrom, cleanTo], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'تم إضافة القسم بنجاح' });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// ==================== 2. مسارات المنتجات (Products) ====================
app.get('/api/products', (req, res) => {
    const query = `
        SELECT products.*, categories.name as category_name 
        FROM products 
        LEFT JOIN categories ON products.category_id = categories.id 
        ORDER BY products.id ASC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/products', (req, res) => {
    let { code, name, image_url, price, cost_price, stock, category_id } = req.body;
    const query = `INSERT INTO products (code, name, image_url, price, cost_price, stock, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const values = [code || null, name, image_url || null, Number(price), Number(cost_price || 0), Number(stock || 0), category_id ? Number(category_id) : null];
    
    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'تم إضافة المنتج بنجاح' });
    });
});

app.put('/api/products/:id', (req, res) => {
    const { name, price, cost_price, stock, image_url, code, category_id } = req.body;
    const query = `UPDATE products SET name = ?, price = ?, cost_price = ?, stock = ?, image_url = ?, code = ?, category_id = ? WHERE id = ?`;
    const values = [name, Number(price), Number(cost_price || 0), Number(stock || 0), image_url, code, category_id ? Number(category_id) : null, req.params.id];
    
    db.run(query, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: true, message: 'تم تحديث المنتج بنجاح' });
    });
});

app.delete('/api/products/:id', (req, res) => {
    db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: true });
    });
});

// ==================== 3. مسارات الموردين وفواتير الشراء ====================
app.get('/api/suppliers-directory', (req, res) => {
    db.all('SELECT * FROM suppliers_directory ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/suppliers-directory', (req, res) => {
    const { name, phone } = req.body;
    db.run('INSERT INTO suppliers_directory (name, phone) VALUES (?, ?)', [name, phone], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.get('/api/suppliers-invoices', (req, res) => {
    const query = `
        SELECT si.*, sd.name as supplier_name, sd.phone as supplier_phone 
        FROM suppliers_invoices si 
        LEFT JOIN suppliers_directory sd ON si.supplier_id = sd.id 
        ORDER BY si.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/suppliers-invoices', (req, res) => {
    let { supplier_id, invoice_date, total_amount, paid_amount, items, is_return } = req.body;
    const isReturnFlag = is_return ? 1 : 0;
    const cleanDate = invoice_date || new Date().toISOString().split('T')[0];

    let processedItems = [];
    let calculatedTotal = 0;
    if (items && Array.isArray(items)) {
        processedItems = items.map(item => {
            let itemPrice = Number(item.price || 0);
            if (isReturnFlag === 1 && itemPrice > 0) {
                itemPrice = -itemPrice;
            }
            const itemTotal = itemPrice * Number(item.quantity || 0);
            calculatedTotal += itemTotal;
            return { ...item, price: itemPrice };
        });
    }

    const finalTotal = calculatedTotal !== 0 ? calculatedTotal : Number(total_amount);
    let finalPaid = Number(paid_amount || 0);
    if (isReturnFlag === 1 && finalPaid === 0 && finalTotal < 0) {
        finalPaid = finalTotal;
    }

    const query = `INSERT INTO suppliers_invoices (supplier_id, invoice_date, total_amount, paid_amount, items, is_return) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [Number(supplier_id), cleanDate, finalTotal, finalPaid, JSON.stringify(processedItems), isReturnFlag], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const invoiceId = this.lastID;

        if (items && Array.isArray(items)) {
            items.forEach(item => {
                if (item.product_id) {
                    const qty = Number(item.quantity || 0);
                    const stockChange = isReturnFlag ? -qty : qty;
                    db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [stockChange, Number(item.product_id)]);
                }
            });
        }
        res.json({ id: invoiceId });
    });
});

// ==================== 4. مسارات العملاء وفواتير البيع ====================
app.get('/api/customers-directory', (req, res) => {
    db.all('SELECT * FROM customers_directory ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/customers-directory', (req, res) => {
    const { name, phone, password } = req.body;
    db.run('INSERT INTO customers_directory (name, phone, password) VALUES (?, ?, ?)', [name, phone, password || '123456'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.get('/api/customers-invoices', (req, res) => {
    const query = `
        SELECT ci.*, cd.name as customer_name, cd.phone as customer_phone 
        FROM customers_invoices ci 
        LEFT JOIN customers_directory cd ON ci.customer_id = cd.id 
        ORDER BY ci.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/customers-invoices', (req, res) => {
    let { customer_id, invoice_date, total_amount, paid_amount, items, is_return } = req.body;
    const isReturnFlag = is_return ? 1 : 0;
    const cleanDate = invoice_date || new Date().toISOString().split('T')[0];

    let processedItems = [];
    let calculatedTotal = 0;
    if (items && Array.isArray(items)) {
        processedItems = items.map(item => {
            let itemPrice = Number(item.price || 0);
            if (isReturnFlag === 1 && itemPrice > 0) {
                itemPrice = -itemPrice;
            }
            const itemTotal = itemPrice * Number(item.quantity || 0);
            calculatedTotal += itemTotal;
            return { ...item, price: itemPrice };
        });
    }

    const finalTotal = calculatedTotal !== 0 ? calculatedTotal : Number(total_amount);
    let finalPaid = Number(paid_amount || 0);
    if (isReturnFlag === 1 && finalPaid === 0 && finalTotal < 0) {
        finalPaid = finalTotal;
    }

    const query = `INSERT INTO customers_invoices (customer_id, invoice_date, total_amount, paid_amount, items, is_return) VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(query, [Number(customer_id), cleanDate, finalTotal, finalPaid, JSON.stringify(processedItems), isReturnFlag], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const invoiceId = this.lastID;

        if (items && Array.isArray(items)) {
            items.forEach(item => {
                if (item.product_id) {
                    const qty = Number(item.quantity || 0);
                    const stockChange = isReturnFlag ? qty : -qty;
                    db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [stockChange, Number(item.product_id)]);
                }
            });
        }
        res.json({ id: invoiceId });
    });
});

// ==================== 5. مسارات طلبات التجار عبر التطبيق ====================
app.get('/api/client-orders', (req, res) => {
    const query = `
        SELECT co.*, cd.name as customer_name, cd.phone as customer_phone 
        FROM client_orders co 
        LEFT JOIN customers_directory cd ON co.customer_id = cd.id 
        ORDER BY co.id DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/client-orders', (req, res) => {
    const { customer_id, total_amount, items } = req.body;
    const order_date = new Date().toISOString();
    const query = `INSERT INTO client_orders (customer_id, order_date, total_amount, status, items) VALUES (?, ?, ?, 'pending', ?)`;
    
    db.run(query, [Number(customer_id), order_date, Number(total_amount), JSON.stringify(items || [])], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'تم إرسال الطلبية بنجاح' });
    });
});

app.put('/api/client-orders/:id/status', (req, res) => {
    const { status } = req.body;
    const orderId = req.params.id;

    db.get('SELECT * FROM client_orders WHERE id = ?', [orderId], (err, order) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!order) return res.status(404).json({ error: 'الطلبية غير موجودة' });

        if (status === 'approved' && order.status !== 'approved') {
            try {
                const items = JSON.parse(order.items || '[]');
                items.forEach(item => {
                    if (item.product_id) {
                        const qty = Number(item.quantity || 0);
                        db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, Number(item.product_id)]);
                    }
                });

                db.run(
                    'INSERT INTO customers_invoices (customer_id, invoice_date, total_amount, paid_amount, items, is_return) VALUES (?, ?, ?, 0, ?, 0)',
                    [order.customer_id, new Date().toISOString().split('T')[0], order.total_amount, order.items]
                );
            } catch (e) {}
        }

        db.run('UPDATE client_orders SET status = ? WHERE id = ?', [status, orderId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: `تم تحديث حالة الطلبية إلى: ${status}` });
        });
    });
});

// ==================== 6. مسار تقرير الأرباح والخزينة ====================
app.get('/api/reports/profits', (req, res) => {
    db.all('SELECT items, paid_amount, is_return FROM customers_invoices', [], (err, custInvRows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all('SELECT id, cost_price FROM products', [], (err, prodRows) => {
            if (err) return res.status(500).json({ error: err.message });

            const costMap = {};
            prodRows.forEach(p => { costMap[p.id] = p.cost_price || 0; });

            let totalSalesRevenue = 0;
            let totalCostOfGoodsSold = 0;

            custInvRows.forEach(inv => {
                try {
                    const items = JSON.parse(inv.items || '[]');
                    const isRet = inv.is_return === 1;
                    items.forEach(item => {
                        const itemTotal = Number(item.price || 0) * Number(item.quantity || 0);
                        const pCost = item.product_id ? (costMap[item.product_id] || 0) * Number(item.quantity || 0) : 0;

                        if (isRet) {
                            totalSalesRevenue += itemTotal;
                            totalCostOfGoodsSold += (pCost > 0 ? -pCost : pCost);
                        } else {
                            totalSalesRevenue += itemTotal;
                            totalCostOfGoodsSold += pCost;
                        }
                    });
                } catch(e) {}
            });

            db.all('SELECT paid_amount FROM suppliers_invoices', [], (err, suppRows) => {
                if (err) return res.status(500).json({ error: err.message });

                db.all('SELECT paid_amount FROM customers_invoices', [], (err, allCustRows) => {
                    if (err) return res.status(500).json({ error: err.message });

                    let totalCashIn = 0;
                    let totalCashOut = 0;

                    allCustRows.forEach(ci => {
                        if (ci.paid_amount > 0) totalCashIn += Number(ci.paid_amount);
                        else if (ci.paid_amount < 0) totalCashOut += Math.abs(Number(ci.paid_amount));
                    });

                    suppRows.forEach(si => {
                        if (si.paid_amount > 0) totalCashOut += Number(si.paid_amount);
                        else if (si.paid_amount < 0) totalCashIn += Math.abs(Number(si.paid_amount));
                    });

                    const netProfit = totalSalesRevenue - totalCostOfGoodsSold;
                    const cashDrawer = totalCashIn - totalCashOut;

                    res.json({
                        totalSalesRevenue,
                        totalCostOfGoodsSold,
                        netProfit,
                        totalCashIn,
                        totalCashOut,
                        cashDrawer
                    });
                });
            });
        });
    });
});

// تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل بكامل كفاءته على المنفذ: ${PORT}`);
});