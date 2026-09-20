const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'payments.json');

// Gemini AI इनिशियलाइज़ेशन (GEMINI_API_KEY को पर्यावरण वेरिएबल में रखें)
const ai = new GoogleGenAI({});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// डेटाबेस फ़ाइल फ़ंक्शन
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
// 1. App Update & UPI Configuration
// ==========================================
app.get('/api/app/check-update', (req, res) => {
    res.json({
        success: true,
        latestVersion: "1.0.2",
        forceUpdate: false,
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
// 2. Gemini AI Assistant API (Flywheel Transport)
// ==========================================
const FLYWHEEL_SYSTEM_PROMPT = `
आप Flywheel Transport Pvt. Ltd. के आधिकारिक व्हाट्सएप AI असिस्टेंट हैं, जो Delhi-NCR (Gurgaon, Noida, Delhi) में कॉर्पोरेट कैब अटैचमेंट, फ्लीट और एम्प्लॉई ट्रांसपोर्टेशन सेवाएं संभालते हैं।

मुख्य नियम:
1. भाषा और टोन: सरल हिंदी/हिंग्लिश। संक्षिप्त, विनम्र और स्पष्ट उत्तर दें। मोबाइल स्क्रीन के लिए स्पष्ट लाइन ब्रेक्स, इमोजी और बुलेट पॉइंट्स का उपयोग करें।
2. जब भी कोई नया यूजर 'Hi', 'Hello', 'Hii', 'Start' या 'Menu' भेजे, केवल मुख्य मेनू भेजें:

Welcome to *Flywheel Transport Pvt. Ltd.* 🚗✨
हम Delhi-NCR में कॉर्पोरेट कैब अटैचमेंट और फ्लीट सेवाएं प्रदान करते हैं।

कृपया नंबर लिखकर विकल्प चुनें:
1️⃣ Attach a Cab / Fleet (Ertiga, Dzire, Aura, EVs, आदि)
2️⃣ Corporate / Employee Transport Inquiry
3️⃣ Duty Rates & Route Information
4️⃣ Speak with Operations / Human Support

3. यदि यूजर '1' या गाड़ी लगाने की बात करे, तो पूछें:
• गाड़ी का मॉडल और फ्यूल (उदा. Dzire CNG, Aura CNG, Ertiga, Tigor EV)
• मॉडल वर्ष (उदा. 2023, 2024, 2025)
• रजिस्ट्रेशन प्रकार (कमर्शियल पीली प्लेट: हाँ / नहीं)
• पसंदीदा लोकेशन (Gurgaon / Noida / Delhi)

4. यदि यूजर दस्तावेज़ पूछे:
गाड़ी के कागजात: RC (पीली प्लेट), फिटनेस, कमर्शियल इंश्योरेंस, परमिट, PUC।
ड्राइवर के कागजात: कमर्शियल DL, पुलिस वेरिफिकेशन, आधार/पैन, बैंक खाता विवरण।

5. यदि यूजर '2' चुने: कंपनी नाम, गाड़ियों की आवश्यकता, संख्या और ऑफिस लोकेशन पूछें।
6. यदि यूजर '3' चुने: बताएं कि रेट्स मॉडल (Sedan/SUV/EV), शिफ्ट और लोकेशन पर निर्भर करते हैं और गाड़ी का मॉडल पूछें।
7. यदि यूजर '4' चुने: ऑपरेशंस टीम से कनेक्ट करने का भरोसा दें और सवाल पूछें।
8. यदि यूजर 'Ok', 'Done' आदि कोई साधारण बात कहे, तो विनम्रता से पूछें कि उन्हें क्या सहायता चाहिए या 'Menu' टाइप करने को कहें। कभी भी शांत न रहें।
`;

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, reply: "मैसेज खाली है।" });
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: message,
            config: {
                systemInstruction: FLYWHEEL_SYSTEM_PROMPT,
                temperature: 0.3
            }
        });

        res.json({
            success: true,
            reply: response.text
        });
    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({
            success: false,
            reply: "सर्वर व्यस्त है। कृपया मुख्य मेनू देखने के लिए 'Menu' टाइप करें।"
        });
    }
});

// ==========================================
// 3. Android App API: UTR सबमिट करना
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
        message: "UTR सफलतापूर्वक सबमिट हुआ! एडमिन वेरिफिकेशन के बाद एक्टिवेट होगा।",
        payment: newPayment
    });
};

app.post('/api/payment/submit-utr', handlePaymentSubmit);
app.post('/api/payment/submit', handlePaymentSubmit);

// ==========================================
// 4. Android App API: स्टेटस चेक करना
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
// 5. Admin API: स्टेटस अपडेट और पेमेंट्स लिस्ट
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
// 6. Admin Web Dashboard
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
        <title>Flywheel Transport - Payment Admin Panel</title>
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
            <p>यहाँ UTR नंबर चेक करें और <b>Approve</b> करें ताकि यूज़र के ऐप में प्लान तुरंत अनलॉक हो सके।</p>
            <p><b>Active UPI ID:</b> Q620100299@ybl | <b>App Version:</b> 1.0.2</p>
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

// Home Route
app.get('/', (req, res) => {
    res.send('Server is live! Admin Panel: <a href="/admin">/admin</a>');
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🤖 AI Chat API: POST http://localhost:${PORT}/api/ai/chat`);
    console.log(`🔄 Version Check: http://localhost:${PORT}/api/app/check-update (v1.0.2)`);
    console.log(`===================================================`);
});
