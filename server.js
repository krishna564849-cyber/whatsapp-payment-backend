const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'payments.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// GEMINI MULTI-USER CHAT MEMORY (बिना किसी बाहरी पैकेज के)
// ==========================================
// हर यूजर और उनके कस्टमर की पिछली बातचीत याद रखने के लिए
const chatHistories = {};

// 15 मिनट से पुराने सेशन को अपने आप मिटाने के लिए टाइमर
setInterval(() => {
    const now = Date.now();
    for (const key in chatHistories) {
        if (now - chatHistories[key].lastActive > 15 * 60 * 1000) {
            delete chatHistories[key];
        }
    }
}, 5 * 60 * 1000);

// डेटाबेस फ़ाइल लोड / इनिशियलाइज़ करना
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
// 0. App Update & UPI Config API
// ==========================================
app.get('/api/app/check-update', (req, res) => {
    res.json({
        success: true,
        latestVersion: "1.0.1",
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
// NAYA: Gemini AI Chat API (बिना किसी NPM पैकेज के - Direct REST API)
// ==========================================
app.post('/api/ai/chat', async (req, res) => {
    try {
        const { apiKey, userPhone, customerPhone, message, businessPrompt } = req.body;

        if (!apiKey) {
            return res.status(400).json({ success: false, message: "Gemini API Key अनिवार्य है।" });
        }
        if (!message) {
            return res.status(400).json({ success: false, message: "Message अनिवार्य है।" });
        }

        const sessionUser = userPhone || 'default_user';
        const sessionCustomer = customerPhone || req.ip;
        const sessionKey = `${sessionUser}_${sessionCustomer}`;

        const defaultPrompt = `आप WhatsApp बिज़नेस असिस्टेंट हैं। 
नियम:
1. जब कस्टमर पहली बार नमस्ते या हाय बोले, तब वेलकम मैसेज और ऑप्शन्स (1, 2) दें।
2. जब कस्टमर विकल्प चुनें (जैसे '1', '2', 'Cab', या गाड़ी का नाम), तो दोबारा वेलकम मैसेज कभी न दोहराएं।
3. सीधे उस विकल्प से जुड़ी सटीक जानकारी दें।`;

        // अगर इस कस्टमर की कोई हिस्ट्री नहीं है, तो नया एरे बनाएं
        if (!chatHistories[sessionKey]) {
            chatHistories[sessionKey] = {
                history: [],
                lastActive: Date.now()
            };
        }

        const userSession = chatHistories[sessionKey];
        userSession.lastActive = Date.now();

        // नया यूज़र मैसेज हिस्ट्री में जोड़ें
        userSession.history.push({
            role: "user",
            parts: [{ text: message.trim() }]
        });

        // Gemini REST API को डायरेक्ट कॉल (कोई नया पैकेज नहीं चाहिए)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

        const payload = {
            systemInstruction: {
                parts: [{ text: businessPrompt || defaultPrompt }]
            },
            contents: userSession.history
        };

        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "Gemini API Error");
        }

        const botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "माफ़ कीजिए, मुझे समझ नहीं आया।";

        // AI के जवाब को भी हिस्ट्री में जोड़ें ताकि अगली बार उसे याद रहे
        userSession.history.push({
            role: "model",
            parts: [{ text: botReply }]
        });

        res.json({
            success: true,
            reply: botReply
        });

    } catch (error) {
        console.error("[Gemini Chat Error]:", error);
        res.status(500).json({
            success: false,
            message: "AI जवाब देने में समस्या: " + (error.message || error)
        });
    }
});

// ==========================================
// 1. Android App API: UTR सबमिट करना
// ==========================================
const handlePaymentSubmit = (req, res) => {
    const { utr, planTier, amount, userPhone, userName, phone, name } = req.body;

    const actualUtr = utr ? utr.trim() : null;
    const actualPhone = userPhone || phone || 'Not provided';
    const actualName = userName || name || 'Customer';

    if (!actualUtr) {
        return res.status(400).json({
            success: false,
            message: "UTR अनिवार्य है।"
        });
    }

    const payments = getPayments();

    const existing = payments.find(p => p.utr.toLowerCase() === actualUtr.toLowerCase());
    if (existing) {
        return res.json({
            success: true,
            message: "यह UTR पहले से सबमिट है। स्थिति: " + existing.status,
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

    console.log(`[NEW PAYMENT] UTR: ${actualUtr}, Plan: ${newPayment.planTier}, User: ${actualPhone}`);

    res.json({
        success: true,
        message: "UTR सफलतापुर्वक सबमिट हुआ! एडमिन वेरिफिकेशन के बाद एक्टिवेट होगा।",
        payment: newPayment
    });
};

app.post('/api/payment/submit-utr', handlePaymentSubmit);
app.post('/api/payment/submit', handlePaymentSubmit);

// ==========================================
// 2. Android App API: स्टेटस चेक करना
// ==========================================
app.get('/api/payment/status/:utr', (req, res) => {
    const { utr } = req.params;
    const payments = getPayments();
    const payment = payments.find(p => p.utr.toLowerCase() === utr.trim().toLowerCase());

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: "UTR नहीं मिला।"
        });
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
// 3. Admin API: अप्रूव या रिजेक्ट करना
// ==========================================
app.post('/api/admin/update-status', (req, res) => {
    const { utr, status, adminKey } = req.body;

    const SECRET_KEY = process.env.ADMIN_KEY || 'myAdminSecret123';
    if (adminKey !== SECRET_KEY) {
        return res.status(401).json({ success: false, message: "अनधिकृत (Unauthorized)" });
    }

    const payments = getPayments();
    const payment = payments.find(p => p.utr.toLowerCase() === utr.trim().toLowerCase());

    if (!payment) {
        return res.status(404).json({ success: false, message: "रिकॉर्ड नहीं मिला।" });
    }

    payment.status = status;
    if (status === 'APPROVED') {
        payment.approvedAt = new Date().toISOString();
    }
    savePayments(payments);

    res.json({ success: true, message: `UTR ${utr} को ${status} कर दिया गया।`, payment });
});

// ==========================================
// 4. Admin API: सभी पेमेंट्स JSON में लाना
// ==========================================
app.get('/api/admin/payments', (req, res) => {
    const adminKey = req.query.adminKey || req.headers['x-admin-key'];
    const SECRET_KEY = process.env.ADMIN_KEY || 'myAdminSecret123';

    if (adminKey !== SECRET_KEY) {
        return res.status(401).json({ success: false, message: "अनधिकृत (Unauthorized)" });
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
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f7f6; padding: 20px; }
            .container { max-width: 1000px; margin: auto; background: #fff; border-radius: 10px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h2 { color: #075e54; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #128c7e; color: white; padding: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>WhatsApp Auto Sender - UTR Payment Verifier</h2>
            <p>यहाँ आपके बैंक में आया UTR नंबर चेक करें और सीधे <b>Approve</b> करें। Approve करते ही यूज़र के ऐप में प्लान अनलॉक हो जाएगा।</p>
            <p><b>Active UPI ID:</b> Q620100299@ybl | <b>Latest App Version:</b> 1.0.1</p>
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
                    ${rows || '<tr><td colspan="6" style="padding:20px; text-align:center;">कोई पेमेंट रिक्वेस्ट नहीं मिली।</td></tr>'}
                </tbody>
            </table>
        </div>

        <script>
            function update(utr, status) {
                const adminKey = prompt("कृपया Admin Password डालें:", "myAdminSecret123");
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

// Home root
app.get('/', (req, res) => {
    res.send('Server is live! Admin Panel: <a href="/admin">/admin</a>');
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🔄 Version Check: http://localhost:${PORT}/api/app/check-update (v1.0.1)`);
    console.log(`📲 API Submit: POST http://localhost:${PORT}/api/payment/submit-utr`);
    console.log(`🤖 AI Chat Webhook: POST http://localhost:${PORT}/api/ai/chat`);
    console.log(`===================================================`);
});
