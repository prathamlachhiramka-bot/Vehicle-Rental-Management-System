require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'Public')));

// --- EMAIL SETUP (Nodemailer) ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const otpStore = {}; 

// 1. DATABASE CONNECTION
const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+05:30',
    dateStrings: true,
    ssl: { ca: fs.readFileSync(path.join(__dirname, 'ca.pem')) }
});

(async () => {
    try {
        const connection = await db.getConnection();
        console.log('✅ Secured Aiven Cloud Database connected successfully!');
        connection.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
    }
})();

const JWT_SECRET = process.env.JWT_SECRET;

// 2. MIDDLEWARE
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ message: "Access Denied" });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) { res.status(401).json({ message: "Invalid token" }); }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') next();
    else res.status(403).json({ message: "Admin access required" });
};

// 3. API ROUTES

app.post('/api/auth/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 10 * 60000 }; 

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'VoltDrive - Verify Your Account',
        text: `Welcome to VoltDrive!\n\nYour account verification OTP is: ${otp}\n\nThis OTP is valid for 10 minutes. Please do not share this with anyone.`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP sent to your email!" });
    } catch (error) {
        console.error("Email Error:", error);
        res.status(500).json({ message: "Failed to send OTP. Admin needs to check server email settings." });
    }
});

app.post('/api/auth/signup', async (req, res) => {
    const { name, email, password, role, verification_id } = req.body;
    try {
        const storedData = otpStore[email];
        if (!storedData) return res.status(400).json({ message: "Please click 'Send OTP' first to verify email." });
        if (Date.now() > storedData.expires) return res.status(400).json({ message: "OTP has expired. Request a new one." });
        if (storedData.otp !== verification_id) return res.status(400).json({ message: "Invalid OTP. Please check your email." });

        const [existing] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ message: "Email already registered" });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.execute(
            'INSERT INTO users (name, email, password, role, verification_id) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashedPassword, role || 'customer', verification_id]
        );
        
        delete otpStore[email];

        res.status(201).json({ success: true, message: "User registered successfully" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, role } = req.body;
    try {
        if (role === 'admin' && email === 'admin' && password === 'admin123') {
            const token = jwt.sign({ id: 0, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
            return res.json({ 
                success: true, token, 
                user: { id: 0, name: "System Admin", role: "admin", email: "admin@voltdrive.com", verification_id: "ADMIN" }, 
                redirectUrl: '/admin-dashboard.html'
            });
        }
        const [users] = await db.execute('SELECT * FROM users WHERE email = ? AND role = ?', [email, role]);
        if (users.length === 0) return res.status(404).json({ message: "User not found for this role" });
        const user = users[0];

        if (user.status === 'Banned') return res.status(403).json({ message: `Access Denied: Your account has been permanently Banned.` });
        
        if (user.status === 'Suspended') {
            const [blockCheck] = await db.execute('SELECT block_until FROM users WHERE id = ?', [user.id]);
            const blockUntil = new Date(blockCheck[0].block_until);
            if (blockUntil > new Date()) {
                const dateStr = blockUntil.toLocaleString('en-US', { hour12: true });
                return res.status(403).json({ message: `Access Denied: Your account is temporarily blocked until ${dateStr}.` });
            } else {
                await db.execute("UPDATE users SET status = 'Active', block_until = NULL WHERE id = ?", [user.id]);
                user.status = 'Active';
            }
        }
        
        const isMatch = await bcrypt.compare(password, user.password).catch(() => password === user.password);
        if (!isMatch) return res.status(401).json({ message: "Wrong password" });
        
        await db.execute('UPDATE users SET last_login = ? WHERE id = ?', [new Date(), user.id]);
        
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
        const redirectUrl = user.role === 'admin' ? '/admin-dashboard.html' : '/discovery.html';
        res.json({ 
            success: true, token, 
            user: { id: user.id, name: user.name, email: user.email, role: user.role, verification_id: user.verification_id },
            redirectUrl: redirectUrl
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/auth/logout', verifyToken, async (req, res) => {
    try {
        const pastTime = new Date(Date.now() - 10 * 60000);
        await db.execute('UPDATE users SET last_login = ? WHERE id = ?', [pastTime, req.user.id]);
        res.json({ success: true, message: "Logged out successfully" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/auth/update-password', verifyToken, async (req, res) => {
    const { newPassword } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
        res.json({ success: true, message: "Password securely updated." });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/vehicles/fleet', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM vehicles');
        res.json(rows);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/vehicles/add', verifyToken, isAdmin, async (req, res) => {
    const { name, type, battery_range, price_per_day, image_url, status, quantity } = req.body;
    try {
        await db.execute(
            'INSERT INTO vehicles (name, type, battery_range, price_per_day, image_url, status, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, type, battery_range, price_per_day, image_url || 'https://via.placeholder.com/400x250', status || 'available', quantity || 1]
        );
        res.status(201).json({ success: true, message: "Vehicle added successfully!" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/vehicles/:id/status', verifyToken, isAdmin, async (req, res) => {
    const { status, quantity } = req.body; 
    const { id } = req.params;
    try {
        await db.execute('UPDATE vehicles SET status = ?, quantity = ? WHERE id = ?', [status, quantity, id]);
        res.json({ success: true, message: "Inventory updated successfully!" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/vehicles/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await db.execute('DELETE FROM bookings WHERE vehicle_id = ?', [id]);
        await db.execute('DELETE FROM vehicles WHERE id = ?', [id]);
        res.json({ success: true, message: "Vehicle removed from fleet!" });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/bookings/checkout', verifyToken, async (req, res) => {
    const { user_id, vehicle_id, start_date, end_date, total_price, pickup_location, driver_name } = req.body;
    try {
        await db.execute('INSERT INTO bookings (user_id, vehicle_id, start_date, end_date, total_price, pickup_location, driver_name, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        [user_id, vehicle_id, start_date, end_date, total_price, pickup_location || 'Main Hub', driver_name || 'Self', 'Pending']);
        res.json({ message: "Booking Request Submitted" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/bookings/:id/approve', verifyToken, isAdmin, async (req, res) => {
    const { vehicle_id } = req.body;
    try {
        await db.execute("UPDATE bookings SET status = 'Approved' WHERE id = ?", [req.params.id]);
        
        let v_id = vehicle_id;
        if (!v_id) {
            const [bData] = await db.execute('SELECT vehicle_id FROM bookings WHERE id = ?', [req.params.id]);
            if (bData.length > 0) v_id = bData[0].vehicle_id;
        }
        if (v_id) {
            await db.execute('UPDATE vehicles SET quantity = quantity - 1 WHERE id = ?', [v_id]);
        }
        
        res.json({ success: true, message: "Booking Approved successfully." });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/bookings/:id/reject', verifyToken, isAdmin, async (req, res) => {
    try {
        await db.execute("UPDATE bookings SET status = 'Rejected' WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Booking Rejected." });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/bookings/me', verifyToken, async (req, res) => {
    try {
        const [bookings] = await db.execute(`
            SELECT b.id, b.start_date, b.end_date, b.total_price, b.vehicle_id, b.status,
                   v.name as vehicle_name, v.image_url 
            FROM bookings b
            JOIN vehicles v ON b.vehicle_id = v.id
            WHERE b.user_id = ?
            ORDER BY b.id DESC
        `, [req.user.id]);
        res.json(bookings);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/bookings/me/:id', verifyToken, async (req, res) => {
    const bookingId = req.params.id;
    try {
        const [booking] = await db.execute('SELECT vehicle_id, status FROM bookings WHERE id = ? AND user_id = ?', [bookingId, req.user.id]);
        if (booking.length === 0) return res.status(404).json({ message: "Booking not found." });

        await db.execute('DELETE FROM bookings WHERE id = ?', [bookingId]);
        
        if (booking[0].status === 'Approved') {
            await db.execute('UPDATE vehicles SET quantity = quantity + 1 WHERE id = ?', [booking[0].vehicle_id]);
        }
        res.json({ success: true, message: "Booking cancelled safely." });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/bookings/all', verifyToken, isAdmin, async (req, res) => {
    try {
        const [bookings] = await db.execute(`
            SELECT b.id, b.start_date, b.end_date, b.total_price, b.pickup_location, b.driver_name, b.status, b.vehicle_id,
                   u.name as customer_name, u.email as customer_email, 
                   v.name as vehicle_name
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN vehicles v ON b.vehicle_id = v.id
            ORDER BY b.id DESC
        `);
        res.json(bookings);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/bookings/stats', verifyToken, isAdmin, async (req, res) => {
    try {
        const [rev] = await db.execute("SELECT SUM(total_price) as total FROM bookings WHERE status != 'Rejected'");
        const [active] = await db.execute("SELECT COUNT(*) as count FROM bookings WHERE end_date >= CURDATE() AND status = 'Approved'");
        const [totalCars] = await db.execute('SELECT SUM(GREATEST(quantity, 0)) as count FROM vehicles');
        const [avail] = await db.execute("SELECT SUM(quantity) as count FROM vehicles WHERE status = 'available' AND quantity > 0");
        const [maint] = await db.execute("SELECT SUM(quantity) as count FROM vehicles WHERE status = 'maintenance' AND quantity > 0");
        const [oos] = await db.execute("SELECT COUNT(*) as count FROM vehicles WHERE quantity <= 0 OR status = 'out of stock'");

        res.json({ 
            totalRevenue: rev[0].total || 0, 
            totalCars: totalCars[0].count || 0,
            activeRentals: active[0].count || 0, 
            pendingMaintenance: maint[0].count || 0,
            availableVehicles: avail[0].count || 0,
            outOfStock: oos[0].count || 0
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/reports/data', verifyToken, isAdmin, async (req, res) => {
    try {
        const [rev] = await db.execute("SELECT SUM(total_price) as total FROM bookings WHERE status != 'Rejected'");
        const [bookingsCount] = await db.execute("SELECT COUNT(*) as count FROM bookings WHERE status != 'Rejected'");
        const [active] = await db.execute("SELECT COUNT(*) as count FROM bookings WHERE end_date >= CURDATE() AND status = 'Approved'");
        
        const [topVehicles] = await db.execute(`
            SELECT v.name, COUNT(b.id) as rent_count 
            FROM vehicles v 
            JOIN bookings b ON v.id = b.vehicle_id 
            WHERE b.status != 'Rejected'
            GROUP BY v.id, v.name
            ORDER BY rent_count DESC LIMIT 5
        `);

        const [types] = await db.execute(`
            SELECT v.type, COUNT(b.id) as rent_count 
            FROM vehicles v 
            JOIN bookings b ON v.id = b.vehicle_id 
            WHERE b.status != 'Rejected'
            GROUP BY v.type
        `);

        res.json({
            totalRevenue: rev[0].total || 0,
            totalBookings: bookingsCount[0].count || 0,
            activeVehicles: active[0].count || 0,
            topVehicles,
            vehicleTypes: types
        });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/messages', async (req, res) => {
    const { name, email, message } = req.body;
    try {
        await db.execute('INSERT INTO customer_messages (customer_name, customer_email, message) VALUES (?, ?, ?)', [name, email, message]);
        res.status(201).json({ success: true, message: "Message sent safely!" });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/admin/messages', verifyToken, isAdmin, async (req, res) => {
    try {
        const [messages] = await db.execute('SELECT * FROM customer_messages ORDER BY id DESC');
        res.json(messages);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/all-customers', verifyToken, isAdmin, async (req, res) => {
    try {
        const [results] = await db.execute(`
            SELECT 
                u.id as uniqueId, 
                u.name, 
                u.email, 
                u.verification_id as verificationId, 
                u.role, 
                COALESCE(u.status, 'Active') as status,
                u.last_login,
                COALESCE(SUM(CASE WHEN b.status != 'Rejected' THEN b.total_price ELSE 0 END), 0) as voltPoints,
                COUNT(CASE WHEN b.status != 'Rejected' THEN b.id END) as rentedVehicles
            FROM users u
            LEFT JOIN bookings b ON u.id = b.user_id
            WHERE u.role = 'customer'
            GROUP BY u.id
            ORDER BY u.last_login DESC
        `);
        res.json(results);
    } catch (err) {
        console.error("Database error fetching customers:", err);
        res.status(500).json({ error: "Database failed to load customers." });
    }
});

app.put('/api/users/:id/block', verifyToken, isAdmin, async (req, res) => {
    const { days } = req.body;
    try {
        const futureTime = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await db.execute("UPDATE users SET status = 'Suspended', block_until = ? WHERE id = ?", [futureTime, req.params.id]);
        res.json({ success: true, message: `User blocked for ${days} days.` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/users/:id/unblock', verifyToken, isAdmin, async (req, res) => {
    try {
        await db.execute("UPDATE users SET status = 'Active', block_until = NULL WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: `User unblocked.` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/users/:id/status', verifyToken, isAdmin, async (req, res) => {
    const { status } = req.body;
    try {
        await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: `User status securely changed to ${status}` });
    } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- NAYA ROUTE: DATABASE KO ZINDA RAKHNE KE LIYE UPTIMEROBOT KE LIYE ---
app.get('/ping', (req, res) => {
    db.query('SELECT 1', (err, results) => {
        if (err) {
            console.log('Database ping fail ho gaya:', err);
            return res.status(500).send('Database so raha hai');
        }
        res.status(200).send('VoltDrive ka Server aur DB dono zinda hain! ⚡');
    });
});
// -------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server live: http://localhost:${PORT}`);
});