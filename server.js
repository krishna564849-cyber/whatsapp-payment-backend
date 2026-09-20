const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PAYMENTS = path.join(__dirname, 'payments.json');
const DB_SETTINGS = path.join(__dirname, 'settings.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// डेटाबेस हेल्पर्स
function getPayments() {
    if (!fs.existsSync(DB_PAYMENTS)) fs.writeFileSync(DB_PAYMENTS, JSON.stringify([]));
    try {
        return JSON.parse(fs.readFileSync(DB_PAYMENTS, 'utf8') || '[]');
    } catch (e) {
        return [];
    }
}

function savePayments(data) {
    fs.writeFileSync(DB_PAYMENTS, JSON.stringify(data, null, 2));
}

function getSettings() {
    const defaultSettings = {
        upiId: "Q620100299@ybl",
        amount: "199",
        merchantName: "WhatsApp Bot Pro"
    };
    if (!fs.existsSync(DB_SETTINGS)) fs.writeFileSync(DB_SETTINGS, JSON.stringify(defaultSettings));
    try {
        return JSON.parse(fs.readFileSync(DB_SETTINGS, 'utf8') || JSON.stringify(defaultSettings));
    } catch (e) {
        return defaultSettings;
    }
}

function saveSettings(data) {
    fs.writeFileSync(DB_SETTINGS, JSON.stringify(data, null, 2));
}

// ==========================================
// 1. Android App APIs
// ==========================================

// अपडेट चेक API
app.get('/api/app/check-update', (req, res) => {
    res.json({
        success: true,
        latestVersion: "1.0.1",
        forceUpdate: true,
        downloadUrl: "https://drive.usercontent.google.com/download?id=1npKaYsL-SkKjjts81unLBTB3YrmKvMHV&export=download&authuser=0"
    });
});

// पेमेंट सेटिंग्स प्राप्त करना (UPI ID & Amount)
app.get('/api/payment/config', (req, res) => {
    res.json({ success: true, ...getSettings() });
});

// ऐप से पेमेंट सबमिट करना (UTR दर्ज करना)
app.post('/api/payment/submit', (req, res) => {
    const { utr, phone, name, amount, plan } = req.body;
    if (!utr || !phone) {
        return res.status(400).json({ success: false, message: "UTR और Phone नंबर आवश्यक हैं।" });
    }

    const payments = getPayments();
    const cleanUtr = utr.trim();
    
    // पहले से मौजूद UTR चेक
    const existing = payments.find(p => p.utr === cleanUtr);
    if (existing) {
        return res.json({ success: true, message: "रिक्वेस्ट पहले से दर्ज है।", status: existing.status });
    }

    const newPayment = {
        id: Date.now().toString(),
        utr: cleanUtr,
        phone: phone.trim(),
        name: name || "User",
        amount: amount || getSettings().amount,
        plan: plan || "Monthly Pro",
        status: "Pending", // Pending, Approved, Rejected
        createdAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    };

    payments.unshift(newPayment);
    savePayments(payments);

    res.json({ success: true, message: "पेमेंट सबमिट हो गया, अप्रूवल का इंतज़ार करें।", id: newPayment.id });
});

// ऐप द्वारा स्टेटस चेक (Polling)
app.get('/api/payment/status/:phoneOrUtr', (req, res) => {
    const key = req.params.phoneOrUtr.trim();
    const payments = getPayments();
    const payment = payments.find(p => p.utr === key || p.phone === key);

    if (!payment) {
        return res.json({ success: false, isApproved: false, status: "NotFound" });
    }

    res.json({
        success: true,
        status: payment.status,
        isApproved: payment.status === "Approved"
    });
});

// ==========================================
// 2. ऑटोमैटिक वेरिफिकेशन एंडपॉइंट (SMS बॉट के लिए)
// ==========================================
app.post('/api/payment/auto-verify', (req, res) => {
    const { utr } = req.body;
    if (!utr) {
        return res.status(400).json({ success: false, message: "UTR आवश्यक है।" });
    }

    const cleanUtr = utr.trim();
    const payments = getPayments();
    const payment = payments.find(p => p.utr === cleanUtr);

    if (payment) {
        payment.status = "Approved";
        savePayments(payments);
        return res.json({ success: true, message: `UTR ${cleanUtr} ऑटो-अप्रूव हो गया!` });
    }

    res.status(404).json({ success: false, message: "डेटाबेस में यह UTR नहीं मिला।" });
});

// ==========================================
// 3. Admin Dashboard & Actions
// ==========================================

// सेटिंग्स सेव करना (UPI / Amount)
app.post('/admin/settings/update', (req, res) => {
    const { upiId, amount, merchantName } = req.body;
    saveSettings({
        upiId: (upiId || "Q620100299@ybl").trim(),
        amount: amount || "199",
        merchantName: merchantName || "WhatsApp Bot Pro"
    });
    res.redirect('/admin');
});

// एडमिन एक्शन (Approve / Reject बटन)
app.post('/admin/payment/action', (req, res) => {
    const { id, action } = req.body;
    const payments = getPayments();
    const index = payments.findIndex(p => p.id === id);

    if (index !== -1) {
        payments[index].status = action === 'approve' ? 'Approved' : 'Rejected';
        savePayments(payments);
    }
    res.redirect('/admin');
});

// एडमिन वेब डैशबोर्ड
app.get('/admin', (req, res) => {
    const payments = getPayments();
    const settings = getSettings();

    let rows = '';
    payments.forEach((p, index) => {
        let badgeColor = '#eab308';
        if (p.status === 'Approved') badgeColor = '#10b981';
        if (p.status === 'Rejected') badgeColor = '#ef4444';

        rows += `
            <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 12px;">${index + 1}</td>
                <td style="padding: 12px; font-weight: bold; color: #38bdf8;">${p.utr}</td>
                <td style="padding: 12px;">${p.phone}</td>
                <td style="padding: 12px;">₹${p.amount}</td>
                <td style="padding: 12px;">
                    <span style="background: ${badgeColor}22; color: ${badgeColor}; padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 13px;">
                        ${p.status}
                    </span>
                </td>
                <td style="padding: 12px; color: #94a3b8; font-size: 12px;">${p.createdAt}</td>
                <td style="padding: 12px;">
                    ${p.status === 'Pending' ? `
                        <form method="POST" action="/admin/payment/action" style="display:inline;">
                            <input type="hidden" name="id" value="${p.id}">
                            <input type="hidden" name="action" value="approve">
                            <button type="submit" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600;">Approve</button>
                        </form>
                        <form method="POST" action="/admin/payment/action" style="display:inline; margin-left: 6px;">
                            <input type="hidden" name="id" value="${p.id}">
                            <input type="hidden" name="action" value="reject">
                            <button type="submit" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Reject</button>
                        </form>
                    ` : `<span style="color: #64748b; font-size: 13px;">No action</span>`}
                </td>
            </tr>
        `;
    });

    if (payments.length === 0) {
        rows = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8;">कोई पेमेंट रिक्वेस्ट नहीं मिली।</td></tr>`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="hi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Admin Panel</title>
        <style>
            body { font-family: system-ui, sans-serif; background: #0b1329; color: #f1f5f9; margin: 0; padding: 20px; }
            .container { max-width: 1050px; margin: auto; }
            .box { background: #16223f; border: 1px solid #233358; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
            h2, h3 { color: #38bdf8; margin-top: 0; }
            input { background: #0b1329; border: 1px solid #334155; color: #fff; padding: 10px; border-radius: 6px; margin-right: 10px; margin-bottom: 10px; }
            button.btn-save { background: #38bdf8; color: #000; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; }
            table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 10px; }
            th { background: #0b1329; padding: 12px; color: #94a3b8; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>⚙️ WhatsApp Payment Approval & Admin Panel</h2>
            
            <div class="box">
                <h3>QR Code / UPI सेटिंग्स</h3>
                <form method="POST" action="/admin/settings/update" style="display:flex; flex-wrap: wrap; align-items: center;">
                    <div>
                        <label style="display:block; font-size: 12px; color:#94a3b8; margin-bottom:4px;">UPI ID</label>
                        <input type="text" name="upiId" value="${settings.upiId}" required>
                    </div>
                    <div>
                        <label style="display:block; font-size: 12px; color:#94a3b8; margin-bottom:4px;">राशि (₹)</label>
                        <input type="number" name="amount" value="${settings.amount}" required>
                    </div>
                    <div>
                        <label style="display:block; font-size: 12px; color:#94a3b8; margin-bottom:4px;">Merchant Name</label>
                        <input type="text" name="merchantName" value="${settings.merchantName}">
                    </div>
                    <div style="margin-top: 16px;">
                        <button type="submit" class="btn-save">सेटिंग्स सेव करें</button>
                    </div>
                </form>
            </div>

            <div class="box">
                <h3>पेमेंट रिक्वेस्ट्स (${payments.filter(p=>p.status==='Pending').length} पेंडिंग)</h3>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>UTR / Trans ID</th>
                                <th>Phone</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
});

// होम रूट
app.get('/', (req, res) => {
    res.send('Server is live! Go to <a href="/admin">/admin</a>');
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
