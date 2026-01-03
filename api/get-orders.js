import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyInitData } from './_tg'; 

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

    // --- 2. XÁC THỰC NGƯỜI DÙNG ---
    const initData = req.headers['x-init-data'];
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const userAuth = verifyInitData(initData, botToken);

    if (!userAuth) {
        return res.status(401).json({ error: 'Unauthorized: Invalid Telegram Data' });
    }

    const uid = userAuth.id; 
    const API_KEY = process.env.PROVIDER_API_KEY; 

    try {
        const ordersRef = db.collection('orders');
        const usersRef = db.collection('users');

        // 🔥 [SỬA LỖI TẠI ĐÂY]: Lấy tham chiếu User (Ví tiền) NGAY TỪ ĐẦU
        // Để tí nữa vào Transaction chỉ việc trừ tiền, không cần tìm kiếm (Query) nữa -> Hết lỗi Transaction.
        let currentUserRef = null;
        const userSnapshot = await usersRef.where('telegram_id', '==', Number(uid)).limit(1).get();
        if (!userSnapshot.empty) {
            currentUserRef = userSnapshot.docs[0].ref;
        }

        // --- 3. TRUY VẤN DỮ LIỆU ĐƠN HÀNG ---
        const snapshot = await ordersRef
            .where('user_uid', '==', Number(uid))
            .orderBy('created_at', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            return res.status(200).json([]);
        }

        // --- 4. FORMAT DỮ LIỆU ---
        const orders = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id, 
                service_name: d.service_name || d.server_order, 
                link: d.link,            
                quantity: d.quantity,   
                total_price: d.total_price || 0, 
                status: d.status,       
                code_order: d.code_order, 
                start_count: d.start_count || 0, 
                buff_count: d.buff_count || 0,   
                created_at: d.created_at  
            };
        });

        // --- 5. ĐỒNG BỘ TRẠNG THÁI TỪ NGUỒN ---
        const ordersToCheck = orders.filter(o => 
            o.code_order && 
            o.code_order !== '---' && 
            !['done', 'cancel', 'refund', 'failed', 'success', 'completed', 'partial'].includes((o.status || '').toLowerCase())
        );

        if (ordersToCheck.length > 0 && API_KEY) {
            await Promise.all(ordersToCheck.map(async (order) => {
                try {
                    const form = new URLSearchParams();
                    form.append('apikey', API_KEY);
                    form.append('code_order', order.code_order);

                    const apiRes = await fetch('https://likenhanh.pro/api/service/view_order', {
                        method: 'POST', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    const apiData = await apiRes.json();

                    if (apiData.status === 'success' && apiData.data && apiData.data[0]) {
                        const sourceInfo = apiData.data[0];
                        const newStatusRaw = sourceInfo.status; 
                        const newStatus = newStatusRaw.toLowerCase(); 
                        const startCount = parseInt(sourceInfo.start) || 0;
                        const buffCount = parseInt(sourceInfo.buff) || 0;
                        const currentStatus = (order.status || '').toLowerCase();

                        // Nếu trạng thái khác nhau -> Cập nhật
                        if (newStatus !== currentStatus) {
                            
                            // 🔥 TRANSACTION CHUẨN (ĐỌC -> TÍNH -> GHI)
                            await db.runTransaction(async (t) => {
                                const orderDocRef = db.collection('orders').doc(order.id);
                                
                                // ✅ BƯỚC 1: ĐỌC (READ)
                                const freshDoc = await t.get(orderDocRef);
                                if (!freshDoc.exists) return;
                                const freshData = freshDoc.data();

                                if ((freshData.status || '').toLowerCase() === newStatus) return;

                                // ✅ BƯỚC 2: TÍNH TOÁN (LOGIC HOÀN TIỀN)
                                let refundAmount = 0;
                                const isRefundState = ['refund', 'refunded', 'partial', 'hoan tien'].some(s => newStatus.includes(s));
                                
                                if (isRefundState) {
                                    const oldSt = (freshData.status || '').toLowerCase();
                                    // Sửa lại logic chặn waitrefund cho chuẩn
                                    const isAlreadyProcessed = (oldSt.includes('refund') && oldSt !== 'waitrefund') || oldSt.includes('cancel');
                                    
                                    if (!isAlreadyProcessed) {
                                        const pricePerItem = freshData.total_price / freshData.quantity;
                                        const remainingItems = freshData.quantity - buffCount;
                                        if (remainingItems > 0) {
                                            refundAmount = Math.floor(remainingItems * pricePerItem);
                                        }
                                    }
                                }

                                // ✅ BƯỚC 3: GHI (WRITE) - Ghi Order và User cùng lúc
                                // 3.1 Cập nhật Order
                                t.update(orderDocRef, {
                                    status: newStatusRaw,
                                    start_count: startCount,
                                    buff_count: buffCount,
                                    updated_at: new Date().toISOString()
                                });

                                // 3.2 Cập nhật User (Dùng Ref đã lấy ở đầu hàm -> Hợp lệ!)
                                if (refundAmount > 0 && currentUserRef) {
                                    t.update(currentUserRef, {
                                        balance: FieldValue.increment(refundAmount),
                                        total_spent: FieldValue.increment(-refundAmount)
                                    });
                                }
                            });

                            // Cập nhật biến hiển thị
                            order.status = newStatusRaw;
                            order.buff_count = buffCount;

                        } 
                        // Update nhẹ số lượng
                        else if (buffCount != (order.buff_count || 0)) {
                            await db.collection('orders').doc(order.id).update({
                                start_count: startCount,
                                buff_count: buffCount
                            });
                            order.buff_count = buffCount;
                        }
                    }
                } catch (err) {
                    console.error(`Lỗi check đơn ${order.code_order}:`, err.message);
                }
            }));
        }

        // --- 6. TRẢ VỀ KẾT QUẢ ---
        return res.status(200).json(orders);

    } catch (error) {
        console.error("API Error:", error);
        
        if (error.code === 9) {
            return res.status(500).json({ error: 'Missing Database Index' });
        }

        return res.status(500).json({ error: error.message });
    }
}
