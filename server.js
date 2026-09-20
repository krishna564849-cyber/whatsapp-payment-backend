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
// 1. Android App API: नया अपडेट चेक करना (Force Update)
// ==========================================
app.get('/api/app/check-update', (req, res) => {
    res.json({
        success: true,
        latestVersion: "1.0.1",
        forceUpdate: true,
        downloadUrl: "https://drive.usercontent.google.com/download?id=1npKaYsL-SkKjjts81unLBTB3YrmKvMHV&export=download&authuser=0"
    });
});

// डिफ़ॉल्ट होम रूट
app.get('/', (req, res) => {
    res.send('Server is live and running! Go to <a href="/admin">/admin</a> for Admin Panel.');
});

// ==========================================
// 2. Admin Dashboard Panel (/admin)
// ==========================================
app.get('/admin', (req, res) => {
    const payments = getPayments();
    
    let rows = '';
    payments.forEach((p, index) => {
        rows += `
            <tr style="border-bottom: 1px solid #334155;">
                <td style="padding: 12px;">${index + 1}</td>
                <td style="padding: 12px; font-weight: bold;">${p.name || p.user || 'N/A'}</td>
                <td style="padding: 12px;">${p.phone || p.mobile || 'N/A'}</td>
                <td style="padding: 12px; color: #10b981; font-weight: bold;">₹${p.amount || 0}</td>
                <td style="padding: 12px;">${p.plan || 'Standard'}</td>
                <td style="padding: 12px;"><span style="background: #065f46; color: #34d399; padding: 4px 8px; border-radius: 6px; font-size: 12px;">${p.status || 'Success'}</span></td>
                <td style="padding: 12px; color: #94a3b8; font-size: 13px;">${p.date || 'N/A'}</td>
            </tr>
        `;
    });

    if (payments.length === 0) {
        rows = `<tr><td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8;">कोई पेमेंट रिकॉर्ड मौजूद नहीं है।</td></tr>`;
    }

    const html = `
    <!DOCTYPE html>
    <html lang="hi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot - एडमिन डैशबोर्ड</title>
        <style>
            body { font-family: system-ui, -apple-system, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
            .container { max-width: 1000px; margin: auto; background: #1e293b; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            h1 { margin-top: 0; color: #38bdf8; font-size: 24px; display: flex; align-items: center; justify-content: space-between; }
            .stats { display: flex; gap: 16px; margin: 20px 0; }
            .card { background: #0f172a; padding: 16px; border-radius: 8px; flex: 1; border: 1px solid #334155; }
            .card-title { font-size: 13px; color: #94a3b8; }
            .card-val { font-size: 22px; font-weight: bold; margin-top: 6px; color: #10b981; }
            table { width: 100%; border-collapse: collapse; text-align: left; margin-top: 15px; }
            th { background: #0f172a; padding: 12px; color: #94a3b8; font-weight: 600; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>
                <span>📊 व्हाट्सएप पेमेंट बैकएंड - एडमिन डैशबोर्ड</span>
                <span style="font-size: 14px; color: #10b981;">● Live</span>
            </h1>

            <div class="stats">
                <div class="card">
                    <div class="card-title">कुल पेमेंट्स</div>
                    <div class="card-val">${payments.length}</div>
                </div>
                <div class="card">
                    <div class="card-title">सिस्टम स्थिति</div>
                    <div class="card-val" style="color: #38bdf8;">सक्रिय (v1.0.1)</div>
                </div>
            </div>

            <h3>हाल के ट्रांज़ैक्शन (Payments)</h3>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>यूज़र / नाम</th>
                            <th>मोबाइल नंबर</th>
                            <th>राशि</th>
                            <th>प्लान</th>
                            <th>स्टेटस</th>
                            <th>दिनांक</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
