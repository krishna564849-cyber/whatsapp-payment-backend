require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Groq = require('groq-sdk');

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
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data || '[]');
    } catch (e) {
        return [];
    }
}

function savePayments(payments) {
    fs.writeFileSync(DB_FILE, JSON.stringify(payments, null, 2));
}

// ==========================================
// 🚀 Groq API Engine
// ==========================================
async function callGroqAPI(apiKey, promptText = "Hello") {
    try {
        const keyToUse = apiKey || process.env.GROQ_API_KEY || "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";

        const groq = new Groq({
            apiKey: keyToUse
        });

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: promptText
                }
            ],
            model: "llama-3.3-70b-versatile"
        });

        const reply = chatCompletion.choices[0]?.message?.content || "OK";
        return { success: true, reply: reply.trim() };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ==========================================
// 🤖 AI Test & Verification Endpoints
// ==========================================
const handleGroqTest = async (req, res) => {
    const apiKey = req.body.apiKey || req.body.api_key || req.body.key || req.query.apiKey;

    try {
        const result = await callGroqAPI(apiKey ? apiKey.trim() : null, "Reply 'OK' in one word to test connection.");
        if (result.success) {
            return res.json({ 
                success: true, 
                message: "Groq Connection Successful! ✅", 
                reply: result.reply 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "API Key test failed: " + result.error 
            });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error: " + err.message });
    }
};

app.post('/api/ai/test', handleGroqTest);
app.post('/api/ai/test-key', handleGroqTest);
app.post('/api/gemini/test', handleGroqTest);
app.post('/api/test-key', handleGroqTest);
app.get('/api/ai/test', handleGroqTest);

// WhatsApp Auto-Reply Chat Route
app.post('/api/ai/chat', async (req, res) => {
    const { apiKey, message, prompt } = req.body;
    const finalPrompt = message || prompt;

    if (!finalPrompt) {
        return res.status(400).json({ success: false, message: "Message anivarya hai." });
    }

    try {
        const result = await callGroqAPI(apiKey ? apiKey.trim() : null, finalPrompt);
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
// 📲 App Update & Payment Config
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
// 💳 Payment UTR Submit
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
// 🔔 PhonePe / MacroDroid Webhook Receiver (UPDATED)
// ==========================================
app.post('/webhook', (req, res) => {
    const { amount, notification } = req.body;
    const rawText = notification || '';

    // 1. PhonePe Txn ID (T se shuru hone wala ID) nikaalne ke liye
    const phonepeTxnMatch = rawText.match(/\bT[A-Za-z0-9]{15,25}\b/);

    // 2. 12-digit standard Bank UTR nikaalne ke liye
    const standardUtrMatch = rawText.match(/\b\d{12}\b/);

    // Final Reference / UTR ID
    const detectedTxnId = phonepeTxnMatch 
        ? phonepeTxnMatch[0] 
        : (standardUtrMatch ? standardUtrMatch[0] : ('AUTO_' + Date.now()));

    // 3. Sender ka naam nikaalein ("from [Name] via PhonePe")
    const senderMatch = rawText.match(/from\s+([A-Za-z\s]+?)\s+via/i);
    const customerName = senderMatch ? senderMatch[1].trim() : 'PhonePe User';

    // 4. Amount ko sanitize karein
    const finalAmount = amount || (rawText.match(/Rs\s*(\d+(\.\d+)?)/i)?.[1] || 99);

    console.log("🔔 New Webhook Payment Received:", {
        amount: finalAmount,
        transactionId: detectedTxnId,
        customerName: customerName,
        rawNotification: rawText
    });

    const payments = getPayments();

    // Duplicate check
    const existing = payments.find(p => p.utr.toLowerCase() === detectedTxnId.toLowerCase());
    if (existing) {
        return res.json({
            success: true,
            message: "Duplicate payment webhook received, already recorded.",
            payment: existing
        });
    }

    const autoPayment = {
        id: 'PAY_' + Date.now(),
        utr: detectedTxnId,
        planTier: 'PRIORITY_VERIFIED',
        amount: finalAmount,
        userPhone: 'Via Notification',
        userName: customerName,
        status: 'APPROVED',
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        rawNotification: rawText
    };

    payments.push(autoPayment);
    savePayments(payments);

    res.json({
        success: true,
        message: "Payment successfully recorded from webhook!",
        payment: autoPayment
    });
});

// ==========================================
// 🔍 Payment Status Check
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
// 🛡️ Admin APIs
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
// 📊 Web Admin Dashboard
// ==========================================
app.get('/admin', (req, res) => {
    const payments = getPayments().reverse();

    const rows = payments.map(p => `
        <tr style="border-bottom: 1px solid #e2e8f0; text-align: center;">
            <td style="padding: 14px; font-family: monospace; font-weight: bold; color: #1e293b;">${p.utr}</td>
            <td style="padding: 14px; text-align: left;">
                <b>${p.userName}</b><br>
                <span style="color: #64748b; font-size: 13px;">📞 ${p.userPhone}</span>
            </td>
            <td style="padding: 14px; font-weight: 600; color: #0f172a;">₹${p.amount} <br><small style="color: #0284c7;">(${p.planTier})</small></td>
            <td style="padding: 14px; color: #64748b; font-size: 13px;">${new Date(p.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
            <td style="padding: 14px;">
                <span style="
                    padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; display: inline-block;
                    background: ${p.status === 'APPROVED' ? '#dcfce7' : p.status === 'REJECTED' ? '#fee2e2' : '#fef9c3'};
                    color: ${p.status === 'APPROVED' ? '#15803d' : p.status === 'REJECTED' ? '#b91c1c' : '#a16207'};
                ">
                    ${p.status}
                </span>
            </td>
            <td style="padding: 14px;">
                ${p.status === 'PENDING' ? `
                    <button onclick="update('${p.utr}', 'APPROVED')" style="background:#16a34a; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:bold; margin-right: 5px;">Approve ✅</button>
                    <button onclick="update('${p.utr}', 'REJECTED')" style="background:#dc2626; color:#fff; border:none; padding:8px 14px; border-radius:6px; cursor:pointer; font-weight:bold;">Reject ❌</button>
                ` : `<span style="color: #94a3b8; font-size: 13px;">Completed</span>`}
            </td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html lang="hi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot Pro - Admin Dashboard</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #334155; padding: 25px; margin: 0; }
            .container { max-width: 1100px; margin: auto; background: #ffffff; border-radius: 12px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; }
            h2 { color: #0f766e; margin: 0; }
            .status-badge { background: #e0f2fe; color: #0369a1; padding: 6px 14px; border-radius: 20px; font-size: 14px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #0f766e; color: white; padding: 14px; text-transform: uppercase; font-size: 13px; letter-spacing: 0.5px; }
            tr:hover { background-color: #f8fafc; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>WhatsApp Bot Pro — Payment Dashboard</h2>
                <div class="status-badge">Total Requests: ${payments.length}</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>UTR / Txn ID</th>
                        <th>User Details</th>
                        <th>Plan & Amount</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows || '<tr><td colspan="6" style="padding:30px; text-align:center; color:#94a3b8;">Abhi koi payment request nahi aayi hai.</td></tr>'}
                </tbody>
            </table>
        </div>
        <script>
            function update(utr, status) {
                const adminKey = prompt("Admin Password daaliye:", "myAdminSecret123");
                if (!adminKey) return;
                fetch('/api/admin/update-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ utr, status, adminKey })
                })
                .then(r => r.json())
                .then(data => { 
                    alert(data.message); 
                    location.reload(); 
                })
                .catch(err => alert("Error: " + err));
            }
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Root
app.get('/', (req, res) => {
    res.send('Server is live! Access Admin Panel: <a href="/admin">/admin</a>');
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Admin Panel: http://localhost:${PORT}/admin`);
});
