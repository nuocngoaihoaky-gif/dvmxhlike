import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyInitData } from './_tg';

// ================== CONSTANT ==================
const AGENCY_UID = 6458968163;

// ================== FIREBASE INIT ==================

// DB KHÁCH
let mainApp;
if (!getApps().length) {
  mainApp = initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}
const db = getFirestore(mainApp);

// DB WEB CHÍNH (ĐẠI LÝ)
const agencyApp = initializeApp(
  {
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_2)),
  },
  'AGENCY_APP'
);
const dbAgency = getFirestore(agencyApp);

// ================== ERROR FILTER ==================
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

// ================== HANDLER ==================
export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    // ---------- AUTH ----------
    const initData = req.headers['x-init-data'];
    const userAuth = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!userAuth) throw new Error('Phiên đăng nhập không hợp lệ');

    const uid = Number(userAuth.id);

    // ---------- INPUT ----------
    const { server_order, link, quantity } = req.body;
    if (!server_order || !link || !quantity || quantity <= 0)
      throw new Error('Dữ liệu không hợp lệ');

    const qty = parseInt(quantity);

    // ---------- API INFO ----------
    const API_URL_LIST = 'https://likenhanh.pro/api/service/list';
    const API_URL_BUY = 'https://likenhanh.pro/api/create/service';
    const API_KEY = process.env.PROVIDER_API_KEY;

    // ---------- GET SERVICE ----------
    const listForm = new URLSearchParams();
    listForm.append('apikey', API_KEY);

    const listRes = await fetch(API_URL_LIST, {
      method: 'POST',
      body: listForm,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const listData = await listRes.json();

    const service = listData.data.find(s => s.server_order === server_order);
    if (!service || service.status === 'off')
      throw new Error('Gói dịch vụ đang bảo trì');

    // ---------- PRICE ----------
    const basePrice = parseFloat(service.prices);

    const customerCost = Math.ceil(basePrice * 4) * qty;   // +300%
    const agencyCost = Math.ceil(basePrice * 1.3) * qty;   // +30%

    // ---------- REFS ----------
    let customerRef, agencyRef;
    let orderCustomerId, orderAgencyId;

    // ================== STEP 1: KHÁCH ==================
    await db.runTransaction(async t => {
      const q = await t.get(
        db.collection('users')
          .where('telegram_id', '==', uid)
          .limit(1)
      );
      if (q.empty) throw new Error('Tài khoản khách không tồn tại');

      const userDoc = q.docs[0];
      customerRef = userDoc.ref;

      const balance = userDoc.data().balance || 0;
      if (balance < customerCost)
        throw new Error('Số dư khách không đủ');

      const orderRef = db.collection('orders').doc();
      orderCustomerId = orderRef.id;

      t.update(userDoc.ref, {
        balance: balance - customerCost,
        total_spent: FieldValue.increment(customerCost),
        total_orders: FieldValue.increment(1),
      });

      t.set(orderRef, {
        user_uid: uid,
        role: 'customer',
        server_order,
        service_name: service.name,
        link,
        quantity: qty,
        total_price: customerCost,
        base_price: basePrice,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
    });

    // ================== STEP 2: ĐẠI LÝ ==================
    try {
      await dbAgency.runTransaction(async t => {
        const q = await t.get(
          dbAgency.collection('users')
            .where('telegram_id', '==', AGENCY_UID)
            .limit(1)
        );
        if (q.empty) throw new Error('Tài khoản đại lý không tồn tại');

        const agencyDoc = q.docs[0];
        agencyRef = agencyDoc.ref;

        const balance = agencyDoc.data().balance || 0;
        if (balance < agencyCost)
          throw new Error('Số dư đại lý không đủ');

        const orderRef = dbAgency.collection('orders').doc();
        orderAgencyId = orderRef.id;

        t.update(agencyDoc.ref, {
          balance: balance - agencyCost,
          total_spent: FieldValue.increment(agencyCost),
          total_orders: FieldValue.increment(1),
        });

        t.set(orderRef, {
          user_uid: AGENCY_UID,
          role: 'agency',
          related_customer_uid: uid,
          server_order,
          service_name: service.name,
          link,
          quantity: qty,
          total_price: agencyCost,
          base_price: basePrice,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      });
    } catch (e) {
      // ROLLBACK KHÁCH
      await db.runTransaction(async t => {
        t.update(customerRef, {
          balance: FieldValue.increment(customerCost),
          total_spent: FieldValue.increment(-customerCost),
          total_orders: FieldValue.increment(-1),
        });
        t.delete(db.collection('orders').doc(orderCustomerId));
      });
      throw new Error(e.message);
    }

    // ================== STEP 3: CALL PROVIDER ==================
    try {
      const buyForm = new URLSearchParams();
      buyForm.append('apikey', API_KEY);
      buyForm.append('server_order', server_order);
      buyForm.append('account', link);
      buyForm.append('amount', qty);

      const buyRes = await fetch(API_URL_BUY, {
        method: 'POST',
        body: buyForm,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const buyData = await buyRes.json();

      if (buyData.status !== 'success')
        throw new Error(filterProviderMessage(buyData.msg));

      await db.collection('orders').doc(orderCustomerId).update({
        status: 'success',
        code_order: buyData.data?.code_order || 'OK',
      });

      await dbAgency.collection('orders').doc(orderAgencyId).update({
        status: 'success',
        code_order: buyData.data?.code_order || 'OK',
      });

      return res.status(200).json({
        success: true,
        msg: `Thành công! -${customerCost.toLocaleString()}đ`,
      });
    } catch (apiErr) {
      // ROLLBACK ĐẠI LÝ
      await dbAgency.runTransaction(async t => {
        t.update(agencyRef, {
          balance: FieldValue.increment(agencyCost),
          total_spent: FieldValue.increment(-agencyCost),
          total_orders: FieldValue.increment(-1),
        });
        t.delete(dbAgency.collection('orders').doc(orderAgencyId));
      });

      // ROLLBACK KHÁCH
      await db.runTransaction(async t => {
        t.update(customerRef, {
          balance: FieldValue.increment(customerCost),
          total_spent: FieldValue.increment(-customerCost),
          total_orders: FieldValue.increment(-1),
        });
        t.delete(db.collection('orders').doc(orderCustomerId));
      });

      throw new Error(apiErr.message);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
