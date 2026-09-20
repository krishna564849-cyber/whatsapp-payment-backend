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
// 0. Android App API: नया अपडेट चेक करना (Force Update)
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
    res.send('Server is live and running!');
});

// सर्वर स्टार्ट
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
