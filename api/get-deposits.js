import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { verifyInitData } from './_tg'; // ⬅️ Import hàm xác thực

// --- 1. KẾT NỐI FIREBASE ---
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
    // Chỉ cho phép GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // --- 2. XÁC THỰC NGƯỜI DÙNG (CHUẨN MỚI) ---
    const initData = req.headers['x-init-data'];
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const userAuth = verifyInitData(initData, botToken);

    if (!userAuth) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Telegram Data' });
    }

    const uid = userAuth.id; // Lấy UID an toàn từ Telegram

    try {
        const depositsRef = db.collection('deposits');

        // --- 3. TRUY VẤN DỮ LIỆU ---
        // Lọc theo user_uid (đảm bảo chỉ xem được của chính mình)
        // Sắp xếp thời gian giảm dần (mới nhất lên đầu)
        const snapshot = await depositsRef
            .where('user_uid', '==', Number(uid)) 
            .orderBy('created_at', 'desc')
            .limit(50) // Giới hạn 50 giao dịch gần nhất
            .get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        // Format lại dữ liệu trả về cho gọn
        const deposits = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                transId: data.transId,       // Mã giao dịch ngân hàng
                amount: data.amount,         // Số tiền
                content: data.content,       // Nội dung nạp
                status: data.status,         // Trạng thái (success/pending)
                created_at: data.created_at  // Thời gian
            };
        });

        return res.status(200).json(deposits);

    } catch (error) {
        console.error("API Get Deposits Error:", error);
        
        // Lỗi phổ biến: Thiếu Index trong Firestore
        if (error.code === 9 || error.message.includes('requires an index')) {
            return res.status(500).json({ 
                error: 'Database Error: Missing Index. Vui lòng check console server để tạo index.' 
            });
        }

        return res.status(500).json({ error: 'Lỗi lấy lịch sử nạp' });
    }
}
