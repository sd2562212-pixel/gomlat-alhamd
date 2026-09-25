const http = require('http');

// بيانات المستخدم التجريبي
const userData = JSON.stringify({
  name: "محمد أحمد",
  phone: "01012345678",
  password: "password123",
  role: "trader"
});

// إرسال طلب تسجيل حساب جديد (Register)
const reqOptions = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': userData.length
  }
};

const req = http.request(reqOptions, (res) => {
  let responseBody = '';
  res.on('data', (chunk) => { responseBody += chunk; });
  res.on('end', () => {
    console.log("📌 نتيجة اختبار التسجيل:", responseBody);
  });
});

req.on('error', (error) => {
  console.error("❌ حدث خطأ:", error.message);
});

req.write(userData);
req.end();