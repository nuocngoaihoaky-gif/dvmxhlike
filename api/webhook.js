import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- 1. KẾT NỐI FIREBASE ---
if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            initializeApp({ credential: cert(serviceAccount) });
        } catch (e) {
            console.error("Firebase Init Error", e);
        }
    }
}

const db = getFirestore();

export default async function handler(req, res) {
    // Chỉ nhận POST request
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // --- 2. BẢO MẬT (TUỲ CHỌN NHƯNG KHUYÊN DÙNG) ---
        // Nếu bạn cấu hình SePay/Casso gửi kèm header Authorization hoặc token
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (webhookSecret) {
            const incomingToken = req.headers['authorization'] || req.query.api_key;
            if (incomingToken !== webhookSecret) {
                console.warn("Webhook Unauthorized Access Attempt");
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        const data = req.body;
        console.log("Nhận Webhook:", JSON.stringify(data));

        // --- 3. CHUẨN HÓA DỮ LIỆU ĐẦU VÀO ---
        // Hỗ trợ cả SePay, Casso, VietQR
        const amount = Number(data.transferAmount || data.amountIn || data.amount || 0);
        const content = (data.content || data.description || "").toString();
        const transId = (data.id || data.transactionId || data.referenceCode || "").toString();

        if (amount <= 0) return res.status(200).json({ status: 'ignored', msg: 'Số tiền không hợp lệ' });
        if (!transId) return res.status(200).json({ status: 'ignored', msg: 'Thiếu mã giao dịch' });

        // --- 4. PHÂN TÍCH NỘI DUNG (THEO UID) ---
        // Logic mới: Tìm "INTROLIKE" + khoảng trắng + "UID (số)"
        // Ví dụ: "INTROLIKE 123456789" (được sinh ra từ file _tg.js)
        const match = content.match(/DVMXHLIKE\s*(\d+)/i);
        
        if (!match) {
             // Fallback: Nếu không thấy số, thử tìm username string (để hỗ trợ user cũ nếu cần)
             // Nhưng chuẩn mới ưu tiên UID số
             console.log(`Nội dung không đúng cú pháp: ${content}`);
             return res.status(200).json({ status: 'ignored', msg: 'Sai cú pháp nạp' });
        }

        const targetUID = Number(match[1]); // Lấy UID dạng số

        // --- 5. XỬ LÝ GIAO DỊCH (TRANSACTION) ---
        // Sử dụng runTransaction để đảm bảo an toàn tuyệt đối về tiền bạc
        await db.runTransaction(async (t) => {
            
            // A. Kiểm tra chống nạp đúp (Idempotency)
            // Tìm xem mã giao dịch này đã được xử lý chưa
            const depositQuery = await t.get(db.collection('deposits').where('transId', '==', transId));
            
            if (!depositQuery.empty) {
                console.log(`Giao dịch ${transId} đã được xử lý trước đó.`);
                return; // Dừng lại, coi như thành công (để Gateway không gửi lại nữa)
            }

            // B. Tìm User theo UID (telegram_id)
            const userQuery = await t.get(db.collection('users').where('telegram_id', '==', targetUID).limit(1));

            if (userQuery.empty) {
                throw new Error(`User UID ${targetUID} không tồn tại trong hệ thống`);
            }

            const userDoc = userQuery.docs[0];
            const userData = userDoc.data();
            const currentBalance = Number(userData.balance) || 0;
            const currentTotalDeposit = Number(userData.total_deposit) || 0;

            // C. Tính toán số dư mới
            const newBalance = currentBalance + amount;
            const newTotalDeposit = currentTotalDeposit + amount;

            // D. Thực hiện Update (Ghi vào DB)
            // 1. Update User
            t.update(userDoc.ref, {
                balance: newBalance,
                total_deposit: newTotalDeposit
            });

            // 2. Tạo lịch sử nạp (deposits)
            const newDepositRef = db.collection('deposits').doc(); // Auto ID
            t.set(newDepositRef, {
                user_uid: targetUID,           // Lưu UID để truy vấn
                username: userData.username,   // Lưu username để hiển thị cho tiện
                amount: amount,
                content: content,
                transId: transId,
                gateway_data: data,            // Lưu raw data để debug sau này
                status: 'success',
                created_at: new Date().toISOString()
            });
        });

        console.log(`✅ Nạp thành công ${amount} cho UID ${targetUID}`);
        return res.status(200).json({ success: true, msg: 'Processed successfully' });

    } catch (error) {
        // Nếu lỗi là do User không tồn tại, trả về 200 để Gateway không retry (vì retry cũng sẽ lỗi)
        if (error.message.includes('không tồn tại')) {
             console.warn(error.message);
             return res.status(200).json({ status: 'error', msg: error.message });
        }

        console.error("❌ Lỗi Webhook Transaction:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
