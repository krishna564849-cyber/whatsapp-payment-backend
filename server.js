const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'payments.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database File Helpers
function getPayments() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify([]));
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data || '[]');
}

function savePayments(payments) {
    fs.writeFileSync(DB_FILE, JSON.stringify(payments, null, 2));
}

// ==========================================
// 🚀 Gemini AI API Caller (gemini-2.5-flash)
// ==========================================
function callGeminiAPI(apiKey, promptText = "Hello", modelName = "gemini-2.5-flash") {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (res.statusCode === 200) {
                        const reply = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "OK";
                        resolve({ success: true, reply });
                    } else {
                        resolve({ success: false, error: parsed?.error?.message || `HTTP ${res.statusCode}` });
                    }
                } catch (e) {
                    resolve({ success: false, error: "Invalid response from Google AI" });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
    });
}

// Helper with fallback model
async function testGeminiWithFallback(apiKey, promptText) {
    let result = await callGeminiAPI(apiKey, promptText, "gemini-2.5-flash");
    if (!result.success) {
        // Fallback to gemini-2.0-flash if needed
        result = await callGeminiAPI(apiKey, promptText, "gemini-2.0-flash");
    }
    return result;
}

// Android App Test Routes
const handleGeminiTest = async (req, res) => {
    const apiKey = req.body.apiKey || req.body.api_key || req.body.key || req.query.apiKey;

    if (!apiKey) {
        return res.status(400).json({ success: false, message: "API Key anivarya hai!" });
    }

    try {
        const result = await testGeminiWithFallback(apiKey.trim(), "Test ping");
        if (result.success) {
            return res.json({ success: true, message: "Gemini AI Connection Successful! ✅", reply: result.reply });
        } else {
            return res.status(400).json({ success: false, message: "API Key test failed: " + result.error });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error: " + err.message });
    }
};

// Test Routes
app.post('/api/ai/test', handleGeminiTest);
app.post('/api/ai/test-key', handleGeminiTest);
app.post('/api/gemini/test', handleGeminiTest);
app.post('/api/test-key', handleGeminiTest);
app.get('/api/ai/test', handleGeminiTest);

// Gemini Chat Route (Auto Reply)
app.post('/api/ai/chat', async (req, res) => {
    const { apiKey, message, prompt } = req.body;
    const finalPrompt = message || prompt;

    if (!apiKey || !finalPrompt) {
        return res.status(400).json({ success: false, message: "API Key aur message dono chahiye." });
    }

    try {
        const result = await testGeminiWithFallback(apiKey.trim(), finalPrompt);
        if (result.success) {
            res.json({ success: true, reply: result.reply });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// 0. App Update & UPI Config API
// ==========================================
app.get('/api/app/check-update', (req, res) => {
    res.json({
        success: true,
        latestVersion: "1.0.2",
        forceUpdate: true,
        downloadUrl: "https://drive.usercontent.google.com/download?id=1npKaYsL-SkKjjts81unLBTB3YrmKvMHV&export=download&authuser=0"
    });
});

app.get('/api/payment/config', (req, res) => {
    res.json({
        success: true,
        upiId: "Q620100299@ybl",
        amount: "299",
        merchantName: "WhatsApp Bot Pro"
    });
});

// ==========================================
// 1. Android App API: UTR Submit
// ==========================================
const handlePaymentSubmit = (req, res) => {
    const { utr, planTier, amount, userPhone, userName, phone, name } = req.body;

    const actualUtr = utr ? utr.trim() : null;
    const actualPhone = userPhone || phone || 'Not provided';
    const actualName = userName || name || 'Customer';

    if (!actualUtr) {
        return res.status(400).json({ success: false, message: "UTR anivarya hai." });
    }

    const payments = getPayments();
    const existing = payments.find(p => p.utr.toLowerCase() === actualUtr.toLowerCase());
    if (existing) {
        return res.json({
            success: true,
            message: "Yeh UTR pehle se submit hai. Status: " + existing.status,
            status: existing.status
        });
    }

    const newPayment = {
        id: 'PAY_' + Date.now(),
        utr: actualUtr,
        planTier: planTier || 'BASIC_299',
        amount: amount || (planTier === 'PRO_399' ? 399 : 299),
        userPhone: actualPhone,
        userName: actualName,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        approvedAt: null
    };

    payments.push(newPayment);
    savePayments(payments);

    res.json({
        success: true,
        message: "UTR safaltapurvak submit hua! Admin verification ke baad activate hoga.",
        payment: newPayment
    });
};

app.post('/api/payment/submit-utr', handlePaymentSubmit);
app.post('/api/payment/submit', handlePaymentSubmit);

// ==========================================
// 2. Android App API: Status Check
// ==========================================
app.get('/api/payment/status/:utr', (req, res) => {
    const { utr } = req.params;
    const payments = getPayments();
    const payment = payments.find(p => p.utr.toLowerCase() === utr.trim().toLowerCase());

    if (!payment) {
        return res.status(404).json({ success: false, message: "UTR nahi mila." });
    }

    res.json({
        success: true,
        utr: payment.utr,
        planTier: payment.planTier,
        status: payment.status,
        isApproved: payment.status === 'APPROVED'
    });
});

// ==========================================
// 3. Admin API: Update Status
// ==========================================
app.post('/api/admin/update-status', (req, res) => {
    const { utr, status, adminKey } = req.body;
    const SECRET_KEY = process.env.ADMIN_KEY || 'myAdminSecret123';

    if (adminKey !== SECRET_KEY) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payments = getPayments();
    const payment = payments.find(p => p.utr.toLowerCase() === utr.trim().toLowerCase());

    if (!payment) {
        return res.status(404).json({ success: false, message: "Record nahi mila." });
    }

    payment.status = status;
    if (status === 'APPROVED') {
        payment.approvedAt = new Date().toISOString();
    }
    savePayments(payments);

    res.json({ success: true, message: `UTR ${utr} ko ${status} kar diya gaya.`, payment });
});

// ==========================================
// 4. Admin API: Get All Payments
// ==========================================
app.get('/api/admin/payments', (req, res) => {
    const adminKey = req.query.adminKey || req.headers['x-admin-key'];
    const SECRET_KEY = process.env.ADMIN_KEY || 'myAdminSecret123';

    if (adminKey !== SECRET_KEY) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payments = getPayments().reverse();
    res.json({ success: true, payments });
});

// ==========================================
// 5. Admin Web Dashboard
// ==========================================
app.get('/admin', (req, res) => {
    const payments = getPayments().reverse();

    const rows = payments.map(p => `
        <tr style="border-bottom: 1px solid #ddd; text-align: center;">
            <td style="padding: 12px;"><b>${p.utr}</b></td>
            <td style="padding: 12px;">${p.userName}<br><small>${p.userPhone}</small></td>
            <td style="padding: 12px;">₹${p.amount} (${p.planTier})</td>
            <td style="padding: 12px;"><small>${new Date(p.createdAt).toLocaleString('en-IN')}</small></td>
            <td style="padding: 12px;">
                <span style="
                    padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold;
                    background: ${p.status === 'APPROVED' ? '#d4edda' : p.status === 'REJECTED' ? '#f8d7da' : '#fff3cd'};
                    color: ${p.status === 'APPROVED' ? '#155724' : p.status === 'REJECTED' ? '#721c24' : '#856404'};
                ">
                    ${p.status}
                </span>
            </td>
            <td style="padding: 12px;">
                ${p.status === 'PENDING' ? `
                    <button onclick="update('${p.utr}', 'APPROVED')" style="background:#28a745; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Approve ✅</button>
                    <button onclick="update('${p.utr}', 'REJECTED')" style="background:#dc3545; color:#fff; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Reject ❌</button>
                ` : `<span>Done</span>`}
            </td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="hi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Auto Sender - Payment Admin Panel</title>
        <style>
            body { font-family: sans-serif; background: #f4f7f6; padding: 20px; }
            .container { max-width: 1000px; margin: auto; background: #fff; border-radius: 10px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h2 { color: #075e54; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #128c7e; color: white; padding: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>WhatsApp Auto Sender - Payment Dashboard</h2>
            <table>
                <thead>
                    <tr>
                        <th>UTR Number</th>
                        <th>User Info</th>
                        <th>Plan & Amount</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="padding:20px; text-align:center;">Koi payment request nahi mili.</td></tr>'}
                </tbody>
            </table>
        </div>
        <script>
            function update(utr, status) {
                const adminKey = prompt("Admin Password dalein:", "myAdminSecret123");
                if (!adminKey) return;
                fetch('/api/admin/update-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ utr, status, adminKey })
                })
                .then(r => r.json())
                .then(data => { alert(data.message); location.reload(); })
                .catch(err => alert("Error: " + err));
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Home root
app.get('/', (req, res) => {
    res.send('Server is live! Admin Panel: <a href="/admin">/admin</a>');
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
