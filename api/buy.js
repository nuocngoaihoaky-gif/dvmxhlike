import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyInitData } from './_tg';

// ================= 1. FIREBASE INIT =================
if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            initializeApp({ credential: cert(serviceAccount) });
        } catch (e) {
            console.error('Firebase Init Error:', e);
        }
    }
}

const db = getFirestore();

// ================= 2. BỘ LỌC LỖI (DỊCH TỪ SERVER) =================
// Hàm này sẽ biến lỗi tiếng Anh/Kỹ thuật thành tiếng Việt dễ hiểu
function filterProviderMessage(msg) {
    if (!msg) return 'Giao dịch thất bại do lỗi lạ';

    const m = msg.toLowerCase();

    // Các lỗi phổ biến từ nguồn Like/Sub
    // SỬA LỖI Ở ĐÂY: Thêm toán tử || giữa các điều kiện
    

    if (m.includes('không mở nút follow') || m.includes('private')) {
        return 'Tài khoản đang để riêng tư';
    }

    if (m.includes('số dư không đủ') || m.includes('balance')) {
        return 'Hệ thống đang bảo trì thanh toán (Admin)';
    }
    if (m.includes('object id') || m.includes('object with id')) {
        return 'Link không hợp lệ (Máy chủ chỉ nhận UID)';
    }
    // Nếu không khớp cái nào -> Trả về nguyên gốc (hoặc rút gọn nếu quá dài)
    return msg.length > 100 ? msg.substring(0, 100) + '...' : msg;
}

// ================= 3. HANDLER CHÍNH =================
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // --- A. XÁC THỰC ---
    const initData = req.headers['x-init-data'];
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const userAuth = verifyInitData(initData, botToken);

    if (!userAuth) {
        return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ, hãy tải lại App!' });
    }
    const uid = userAuth.id;

    // --- B. LẤY DATA ---
    const { server_order, link, quantity } = req.body;
    
    // Validate cơ bản
    if (!server_order || !link || !quantity) return res.status(400).json({ error: 'Vui lòng điền đủ thông tin' });
    if (quantity <= 0) return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });

    const API_URL_LIST = 'https://likenhanh.pro/api/service/list';
    const API_URL_BUY = 'https://likenhanh.pro/api/create/service';
    const API_KEY = process.env.PROVIDER_API_KEY;

    if (!API_KEY) return res.status(500).json({ error: 'Lỗi cấu hình hệ thống (Thiếu API Key)' });

    try {
        // --- C. LẤY GIÁ GỐC ---
        const listForm = new URLSearchParams();
        listForm.append('apikey', API_KEY);
        
        const listRes = await fetch(API_URL_LIST, { 
            method: 'POST', body: listForm, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const listData = await listRes.json();
        
        const service = listData.data.find(s => s.server_order === server_order);
        if (!service || service.status === 'off') {
            return res.status(400).json({ error: 'Gói này đang bảo trì hoặc đã tắt' });
        }

        // Tính tiền
        const PERCENT_PROFIT = 30;
        const myPrice = Math.ceil(parseFloat(service.prices) * (100 + PERCENT_PROFIT) / 100);
        const totalCost = myPrice * parseInt(quantity);

        // --- D. TRANSACTION (Trừ tiền trước & Giữ chỗ) ---
        let orderRefId;
        
        // Dùng runTransaction để đảm bảo an toàn
        await db.runTransaction(async (t) => {
            const userQuery = await t.get(db.collection('users').where('telegram_id', '==', Number(uid)).limit(1));
            
            if (userQuery.empty) throw new Error("Tài khoản chưa được khởi tạo");
            
            const userDoc = userQuery.docs[0];
            const currentBalance = userDoc.data().balance || 0;

            if (currentBalance < totalCost) {
                // Ném lỗi này để catch phía dưới bắt được
                throw new Error(`Số dư của bạn không đủ. Thiếu ${(totalCost - currentBalance).toLocaleString()}đ`);
            }

            // Trừ tiền
            t.update(userDoc.ref, {
                balance: currentBalance - totalCost,
                total_spent: FieldValue.increment(totalCost),
                total_orders: FieldValue.increment(1)
            });

            // Tạo đơn Pending (Giữ chỗ)
            const newOrderRef = db.collection('orders').doc();
            orderRefId = newOrderRef.id;
            
            t.set(newOrderRef, {
                user_uid: Number(uid),
                username: userDoc.data().username || "User",
                server_order,
                service_name: service.name,
                link,
                quantity: parseInt(quantity),
                total_price: totalCost,
                code_order: '---',
                status: 'pending',
                created_at: new Date().toISOString()
            });
        });

        // --- E. GỌI API MUA ---
        try {
            const buyForm = new URLSearchParams();
            buyForm.append('apikey', API_KEY);
            buyForm.append('server_order', server_order);
            buyForm.append('account', link);
            buyForm.append('amount', quantity);

            const buyRes = await fetch(API_URL_BUY, {
                method: 'POST', body: buyForm, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const buyData = await buyRes.json();

            // Nếu nguồn báo lỗi -> Ném lỗi để nhảy xuống catch hoàn tiền
            if (buyData.status !== 'success') {
                // Dùng hàm lọc lỗi ở trên để dịch sang tiếng Việt
                const niceMsg = filterProviderMessage(buyData.msg);
                throw new Error(niceMsg); 
            }

            // Thành công -> Update đơn hàng
            await db.collection('orders').doc(orderRefId).update({
                status: 'success',
                code_order: buyData.data?.code_order || 'Ordered',
                original_response: buyData
            });

            return res.status(200).json({ 
                success: true, 
                msg: `Thành công! -${totalCost.toLocaleString()}đ` 
            });

        } catch (apiError) {
            console.error("Lỗi API Nguồn:", apiError.message);

            // --- HOÀN TIỀN & XÓA ĐƠN (ROLLBACK) ---
            await db.runTransaction(async (t) => {
                const userQuery = await t.get(db.collection('users').where('telegram_id', '==', Number(uid)).limit(1));
                if (!userQuery.empty) {
                    const userDoc = userQuery.docs[0];
                    t.update(userDoc.ref, {
                        balance: FieldValue.increment(totalCost),
                        total_spent: FieldValue.increment(-totalCost),
                        total_orders: FieldValue.increment(-1)
                    });
                }
                // 🛑 THAY ĐỔI Ở ĐÂY: Dùng t.delete() thay vì t.update status failed
                if (orderRefId) {
                    t.delete(db.collection('orders').doc(orderRefId));
                }
            });

            // Trả về lỗi 400 để Frontend hiển thị
            return res.status(400).json({ error: apiError.message });
        }

    } catch (error) {
        // Lỗi chung (Số dư không đủ, User không tồn tại...)
        return res.status(400).json({ error: error.message });
    }
}
