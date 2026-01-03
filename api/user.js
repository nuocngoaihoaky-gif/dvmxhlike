import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyInitData } from './_tg'; // ⬅️ Import hàm verify

// --- 1. KHỞI TẠO FIREBASE (Giữ nguyên) ---
if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            initializeApp({ credential: cert(serviceAccount) });
        } catch (e) {
            console.error("Firebase Init Error:", e);
        }
    }
}
const db = getFirestore();

export default async function handler(req, res) {
    // --- 2. XÁC THỰC TELEGRAM (BẮT BUỘC) ---
    const initData = req.headers['x-init-data'];
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Verify chữ ký
    const user = verifyInitData(initData, botToken);

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Telegram Data' });
    }

    // ✅ LẤY UID TỪ DỮ LIỆU ĐÃ VERIFY (An toàn tuyệt đối)
    const uid = user.id; 

    try {
        const usersRef = db.collection('users');
        
        // --- 3. TÌM USER TRONG DB ---
        // Ưu tiên tìm theo Number (chuẩn Telegram ID)
        let snapshot = await usersRef.where('telegram_id', '==', Number(uid)).limit(1).get();

        // Fallback: Tìm theo String (đề phòng dữ liệu cũ lưu dạng string)
        if (snapshot.empty) {
            snapshot = await usersRef.where('telegram_id', '==', String(uid)).limit(1).get();
        }

        // --- 4. NẾU CHƯA CÓ -> TẠO MỚI (AUTO REGISTER) ---
        if (snapshot.empty) {
            const newUser = {
                telegram_id: Number(uid), // Luôn lưu chuẩn Number
                username: user.username || user.first_name || "New User",
                balance: 0,           // Tiền mặc định
                total_deposit: 0,     // Tổng nạp
                total_spent: 0,       // Tổng tiêu
                total_orders: 0,
                created_at: new Date().toISOString()
            };
            
            await usersRef.add(newUser);

            return res.status(200).json(newUser);
        }

        // --- 5. NẾU ĐÃ CÓ -> TRẢ VỀ DATA ---
        const docData = snapshot.docs[0].data();
        
        return res.status(200).json({
            balance: docData.balance || 0,
            total_spent: docData.total_spent || 0,
            total_deposit: docData.total_deposit || 0,
            total_orders: docData.total_orders || 0
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
