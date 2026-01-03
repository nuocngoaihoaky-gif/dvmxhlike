// --- 1. CẤU HÌNH & KHỞI TẠO ---

// Cấu hình Tailwind
tailwind.config = {
    theme: {
        extend: {
            colors: {
                bg: '#0B021C', surface: '#16082f', primary: '#a855f7', secondary: '#ec4899', accent: '#06b6d4', input: '#1e1b2e',
                success: '#22c55e', warning: '#f59e0b', error: '#ef4444'
            },
            fontFamily: { brand: ['Orbitron', 'sans-serif'], body: ['Outfit', 'sans-serif'] }
        }
    }
}

// Khởi tạo Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Biến toàn cục
let allServices = [];
let currentUserUID = null;
let isOrdering = false;

// 🔥 BIẾN MỚI CHO TÍNH NĂNG LỌC
let allOrdersCache = []; 
let currentFilter = 'all';

// Helper: Tạo headers chuẩn cho mọi request
const getHeaders = () => {
    return {
        'Content-Type': 'application/json',
        'x-init-data': tg.initData 
    };
};

// --- 2. LOGIC KHỞI ĐỘNG ---

async function initApp() {
    try {
        const user = tg.initDataUnsafe?.user;
        
        if (user) {
            let displayName = user.first_name;
            if(user.last_name) displayName += " " + user.last_name;
            document.querySelectorAll('.username-display').forEach(el => el.innerText = displayName);
            document.querySelectorAll('.userid-display').forEach(el => el.innerText = `ID: ${user.id}`);
            
            const avatarEl = document.getElementById('userAvatar'); 
            const avatarImg = document.getElementById('realUserAvatar');
            const defaultIcon = document.getElementById('defaultUserIcon');

            if (avatarImg && defaultIcon) {
                if (user.photo_url) {
                    avatarImg.src = user.photo_url;
                    avatarImg.classList.remove('hidden');   
                    defaultIcon.classList.add('hidden');    
                } else {
                    avatarImg.classList.add('hidden');
                    defaultIcon.classList.remove('hidden');
                }
            }
            
            const headerImg = document.getElementById('headerUserAvatar');
            const headerIcon = document.getElementById('headerUserIcon');

            if (headerImg && headerIcon) {
                if (user.photo_url) {
                    headerImg.src = user.photo_url;
                    headerImg.classList.remove('hidden');
                    headerIcon.classList.add('hidden');
                } else {
                    headerImg.classList.add('hidden');
                    headerIcon.classList.remove('hidden');
                }
            }
            currentUserUID = user.id;

            const bankInput = document.getElementById('bankContent');
            if(bankInput) bankInput.value = `DVMXHlike ${currentUserUID}`;
        } else {
            document.querySelectorAll('.username-display').forEach(el => el.innerText = "Khách");
            document.querySelectorAll('.userid-display').forEach(el => el.innerText = `ID: ---`);
        }

        await Promise.all([
            loadUserInfo(currentUserUID), 
            loadServices()
        ]);

        updateDepositQR();

    } catch (error) {
        console.error(error);
        tg.showAlert("⚠️ Chế độ Offline: " + error.message);
    } finally {
        const loading = document.getElementById('loadingOverlay');
        if(loading) {
            loading.style.opacity = '0';
            setTimeout(() => loading.remove(), 500);
        }
    }
}

// --- 3. LOGIC XỬ LÝ DỮ LIỆU (API) ---

async function loadUserInfo(uid) {
    if(!uid) return;
    try {
        const res = await fetch(`/api/user?uid=${uid}`, {
            method: 'GET',
            headers: getHeaders()
        });

        if(res.ok) {
            const data = await res.json();
            document.getElementById('balanceDisplayHeader').innerText = (data.balance || 0).toLocaleString();
            
            const statsBalance = document.getElementById('statsBalance');
            if(statsBalance) statsBalance.innerText = (data.balance || 0).toLocaleString();
            
            const statsDeposited = document.getElementById('statsDeposited');
            if(statsDeposited && data.total_deposit) statsDeposited.innerText = data.total_deposit.toLocaleString();
            
            const statsSpent = document.getElementById('statsSpent');
            if(statsSpent && data.total_spent) statsSpent.innerText = data.total_spent.toLocaleString();

            const statsOrders = document.getElementById('statsOrders');
            if(statsOrders) statsOrders.innerText = (data.total_orders || 0).toLocaleString();
        }
    } catch(e) { 
        console.error("Lỗi tải thông tin user:", e);
        document.getElementById('balanceDisplayHeader').innerText = "0";
    }
}

async function loadServices() {
    const platformSelect = document.getElementById('platformSelect');
    try {
        const res = await fetch('/api/services', {
            method: 'GET',
            headers: getHeaders()
        });

        if(!res.ok) throw new Error("API Error");
        allServices = await res.json();

    } catch (e) {
        console.log("Demo Mode");
        allServices = [];
    }

    const platforms = [...new Set(allServices.map(s => s.social))];
    if(platformSelect) {
        platformSelect.innerHTML = '';
        platforms.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.innerText = p.toUpperCase();
            platformSelect.appendChild(opt);
        });
        if (platforms.length > 0) renderCategories(platforms[0]);
    }
}

// --- 4. LOGIC GIAO DIỆN ---

function switchTab(tabName) {
    if(tg.HapticFeedback) tg.HapticFeedback.selectionChanged();

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const view = document.getElementById(`view-${tabName}`);
    const nav = document.getElementById(`nav-${tabName}`);
    
    if(view) view.classList.remove('hidden');
    if(nav) nav.classList.add('active');

    if (tabName === 'history') {
        renderHistoryData(); 
    } else if (tabName === 'deposit') {
        renderDepositHistory(); 
        loadUserInfo(currentUserUID);
    } else if (tabName === 'profile') {
        loadUserInfo(currentUserUID);
    }
}

// --- 5. LOGIC ORDER ---

function renderCategories(platform) {
    const categorySelect = document.getElementById('categorySelect');
    if(!categorySelect) return;
    
    categorySelect.innerHTML = '<option value="">-- Chọn phân loại --</option>';
    const servicesInPlatform = allServices.filter(s => s.social === platform);
    const rawCategories = [...new Set(servicesInPlatform.map(s => s.service))];
    
    rawCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.innerText = formatCategoryName(cat); 
        categorySelect.appendChild(opt);
    });

    if (rawCategories.length > 0) {
        categorySelect.selectedIndex = 0;
        renderServices(rawCategories[0]);
    }
}

function renderServices(categoryCode) {
    const platform = document.getElementById('platformSelect').value;
    const serviceSelect = document.getElementById('serviceSelect');
    serviceSelect.innerHTML = '<option value="">-- Chọn máy chủ --</option>'; 
    
    const filtered = allServices.filter(s => s.social === platform && s.service === categoryCode);
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.server_order; 
        opt.setAttribute('data-price', s.price);
        opt.setAttribute('data-min', s.min);
        opt.setAttribute('data-max', s.max);
        let niceDetail = (s.detail || "").replace(/(\r\n|\n|\r)/gm, "<br>");
        opt.setAttribute('data-detail', encodeURIComponent(niceDetail));
        opt.innerText = (s.status === 'off') ? `🔴 [BẢO TRÌ] ${s.name}` : `${s.name} - ${s.price}đ`;
        if(s.status === 'off') opt.disabled = true;
        serviceSelect.appendChild(opt);
    });

    serviceSelect.selectedIndex = 0; 
    updateServiceInfo(); 
}

function updateServiceInfo() {
    const serviceSelect = document.getElementById('serviceSelect');
    const selected = serviceSelect.options[serviceSelect.selectedIndex];
    const noteDiv = document.getElementById('serviceNote');

    if (!selected || !selected.value) {
        if(noteDiv) noteDiv.classList.add('hidden');
        document.getElementById('minLimit').innerText = "0";
        document.getElementById('totalPriceDisplay').innerText = "0";
        return;
    }

    document.getElementById('minLimit').innerText = selected.getAttribute('data-min');
    calculatePrice();

    const rawDetail = selected.getAttribute('data-detail');
    if (noteDiv && rawDetail && rawDetail !== "undefined" && rawDetail !== "") {
        document.getElementById('noteText').innerHTML = decodeURIComponent(rawDetail); 
        noteDiv.classList.remove('hidden');
    } else if(noteDiv) {
        noteDiv.classList.add('hidden');
    }
}

function calculatePrice() {
    const serviceSelect = document.getElementById('serviceSelect');
    const selected = serviceSelect.options[serviceSelect.selectedIndex];
    if (!selected || !selected.value) {
            document.getElementById('totalPriceDisplay').innerText = "0";
            return;
    }
    const price = parseFloat(selected.getAttribute('data-price')) || 0;
    const quantity = parseInt(document.getElementById('quantityInput').value) || 0;
    document.getElementById('totalPriceDisplay').innerText = (price * quantity).toLocaleString();
}

function adjustQuantity(amount) {
    const input = document.getElementById('quantityInput');
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + amount);
    input.value = val;
    calculatePrice();
}

function showSafeError(msg) {
    let text = msg || 'Giao dịch thất bại do lỗi không xác định';
    if (text.length > 200) text = text.slice(0, 195) + '...';

    tg.showPopup({
        title: '❌ Thất bại',
        message: text,
        buttons: [{ type: 'ok', text: 'Đóng' }]
    });
}

async function submitOrder() {
    if (isOrdering) return;
    isOrdering = true;

    if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');

    const link = document.getElementById('linkInput').value.trim();
    const quantity = parseInt(document.getElementById('quantityInput').value);
    const serviceSelect = document.getElementById('serviceSelect');
    const server_order = serviceSelect.value;
    const min = parseInt(serviceSelect.options[serviceSelect.selectedIndex]?.getAttribute('data-min') || 0);

    if (!server_order) { isOrdering = false; return tg.showAlert("❌ Chưa chọn dịch vụ!"); }
    if (!link || link.length < 5) { isOrdering = false; return tg.showAlert("❌ Link không hợp lệ!"); }
    if (quantity < min) { isOrdering = false; return tg.showAlert(`❌ Số lượng tối thiểu là ${min}!`); }

    const totalPrice = document.getElementById('totalPriceDisplay').innerText;
    
    tg.showPopup({
        title: 'Xác nhận thanh toán',
        message: `Mua ${quantity} lượt?\nTổng tiền: ${totalPrice}đ`,
        buttons: [
            { id: 'ok', type: 'default', text: 'Mua ngay' },
            { id: 'cancel', type: 'destructive', text: 'Hủy' }
        ]
    }, async (btnId) => {
        if (btnId !== 'ok') {
            isOrdering = false;
            return;
        }

        const btn = document.getElementById('btnSubmit');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG XỬ LÝ...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/buy', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ server_order, link, quantity })
            });

            let result;
            try {
                result = await res.json();
            } catch (e) {
                throw new Error("Máy chủ không phản hồi JSON");
            }

            if (res.ok && result.success) {
                tg.showAlert("✅ " + result.msg);
                loadUserInfo(currentUserUID);
                switchTab('history');
            } else {
                showSafeError(result.error || "Lỗi không xác định từ máy chủ");
            }

        } catch (err) {
            console.error(err);
            showSafeError("Lỗi kết nối mạng hoặc máy chủ đang bận.");
        } finally {
            btn.innerHTML = oldHtml;
            btn.disabled = false;
            isOrdering = false;
        }
    });
}

// --- 6. LOGIC NẠP TIỀN ---

function adjustDeposit(amount) {
    const input = document.getElementById('depositAmount');
    let val = parseInt(input.value) || 0;
    val += amount;
    if(val < 10000) { 
        val = 10000; 
        if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning'); 
    } else { 
        if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); 
    }
    input.value = val;
    updateDepositQR();
}

function updateDepositQR() {
    const bankID = "MB";
    const accountNo = "0348023102";
    const accountName = "BUI THANH TU";
    const content = `DVMXHlike ${currentUserUID}`; 
    let amount = parseInt(document.getElementById('depositAmount').value) || 0;
    
    const qrURL = `https://img.vietqr.io/image/${bankID}-${accountNo}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;
    
    const qrImg = document.getElementById('qrImage');
    if(qrImg) qrImg.src = qrURL;
    
    const bankContentInput = document.getElementById('bankContent');
    if(bankContentInput) bankContentInput.value = content;
}

// --- 7. HELPER & LỌC LỊCH SỬ ---

function formatCategoryName(code) {
    // (Giữ nguyên logic format tên dài dòng của bạn)
    const str = code.toLowerCase();
    if (str.includes('tang-like-facebook-new-2')) return 'Tăng Like Facebook New 2';
    if (str.includes('tang-share-facebook-new-2')) return 'Tăng Share Facebook New 2';
    if (str.includes('tang-mat-live-facebook-new-2')) return 'Tăng Mắt Live Facebook New 2';
    if (str.includes('tang-like-cam-xuc-binh-luan')) return 'Tăng Like Cảm Xúc Bình Luận';
    if (str.includes('tang-share-kem-comment')) return 'Tăng Share Kèm Comment';
    if (str.includes('tang-like-comment-new-2')) return 'Tăng Like Comment New 2';
    if (str.includes('tang-like-fanpage')) return 'Tăng Like Fanpage';
    if (str.includes('tang-theo-doi-fanpage')) return 'Tăng Theo Dõi Fanpage';
    if (str.includes('tang-danh-gia-fanpage')) return 'Tăng Đánh Giá Fanpage';
    if (str.includes('facebook-ad-break')) return 'Facebook Ad Break';
    if (str.includes('vip-like')) return 'Vip Like Facebook';
    if (str.includes('tang-like-facebook')) return 'Tăng Like Facebook';
    if (str.includes('tang-theo-doi-facebook')) return 'Tăng Theo Dõi Facebook';
    if (str.includes('tang-share-facebook')) return 'Tăng Share Facebook';
    if (str.includes('tang-loi-moi-ket-ban')) return 'Tăng Lời Mời Kết Bạn';
    if (str.includes('su-kien-facebook')) return 'Sự Kiện Facebook';
    if (str.includes('tang-view-story')) return 'Tăng View Story';
    if (str.includes('tang-like-story')) return 'Tăng Like Story';
    if (str.includes('tang-cam-xuc-story')) return 'Tăng Cảm Xúc Story';
    if (str.includes('tang-mat-livestream')) return 'Tăng Mắt Xem Livestream';
    if (str.includes('tang-mat-live')) return 'Tăng Mắt Live';
    if (str.includes('tang-view-tiktok-new-2')) return 'Tăng View TikTok New 2';
    if (str.includes('tang-mat-live-tiktok-new-2')) return 'Tăng Mắt Live TikTok New 2';
    if (str.includes('tang-tym-tiktok-new-2')) return 'Tăng Tym TikTok New 2';
    if (str.includes('tang-view-kem-savetok-va-share')) return 'Tăng View Kèm SaveTok Và Share';
    if (str.includes('tang-like-kem-view-story')) return 'Tăng Like View Story';
    if (str.includes('tang-like-kem-view')) return 'Tăng Like Kèm View';
    if (str.includes('tha-tym-live-tiktok')) return 'Tăng Tym Live TikTok';
    if (str.includes('tang-share-live-tiktok')) return 'Tăng Share Live TikTok';
    if (str.includes('vip-like-tiktok')) return 'Vip Like TikTok';
    if (str.includes('tang-savetok')) return 'Tăng SaveTok';
    if (str.includes('diem-chien-dau-pk-live-tik-tok')) return 'Tăng Điểm Chiến Đấu PK Live';
    if (str.includes('tang-view-tik-tok')) return 'Tăng View TikTok';
    if (str.includes('tang-tym-video')) return 'Tăng Tym Video';
    if (str.includes('tang-mat-live-instagram-new-2')) return 'Tăng Mắt Live Instagram New 2';
    if (str.includes('tang-luot-thich-instagram-new-2')) return 'Tăng Lượt Thích Instagram New 2';
    if (str.includes('tang-follower-instagram-new-2')) return 'Tăng Follower Instagram New 2';
    if (str.includes('tang-mat-live-instagram')) return 'Tăng Mắt Live Instagram';
    if (str.includes('tang-member-channel-instagram')) return 'Tăng Member Channel Instagram';
    if (str.includes('tang-like-threads')) return 'Tăng Like Threads';
    if (str.includes('tang-follower-threads')) return 'Tăng Follower Threads';
    if (str.includes('tang-reshare')) return 'Tăng Reshare Threads';
    if (str.includes('view-short')) return 'View Short';
    if (str.includes('like-short')) return 'Like Short';
    if (str.includes('tang-4k-gio-xem-video-youtube')) return 'Tăng 4K Giờ Xem Youtube';
    if (str.includes('tang-view-telegram')) return 'Tăng View Telegram';
    if (str.includes('danh-gia-google-map')) return 'Đánh Giá Google Map';
    if (str.includes('random-emote-comment')) return 'Random Emote Comment';
    if (str.includes('tang-comment-ai')) return 'Tăng Comment AI';
    if (str.includes('tang-like-comment')) return 'Tăng Like Comment';
    if (str.includes('tang-binh-luan')) return 'Tăng Bình Luận';
    if (str.includes('tang-comment')) return 'Tăng Comment';
    if (str.includes('tang-like')) return 'Tăng Like';
    if (str.includes('tang-share')) return 'Tăng Share';
    if (str.includes('tang-view-video')) return 'Tăng View Video';
    if (str.includes('tang-view')) return 'Tăng View';
    if (str.includes('tang-theo-doi')) return 'Tăng Theo Dõi';
    if (str.includes('tang-sub')) return 'Tăng Sub';
    if (str.includes('tang-thanh-vien-new-2')) return 'Tăng Thành Viên New 2';
    if (str.includes('tang-thanh-vien')) return 'Tăng Thành Viên';
    if (str.includes('tang-cam-xuc-kem-view')) return 'Tăng Cảm Xúc Kèm View';
    if (str.includes('tang-cam-xuc')) return 'Tăng Cảm Xúc';
    if (str.includes('tang-traffic')) return 'Tăng Traffic';
    return code.replace(/-/g, ' ').toUpperCase();
}

// 🔥 TÁCH HÀM RENDER RA ĐỂ XỬ LÝ LỌC
function filterHistory(type) {
    currentFilter = type;
    
    // Update UI nút bấm (Đổi màu nút đang chọn)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('bg-primary/20', 'text-primary', 'border-primary/30');
        btn.classList.add('bg-surface', 'text-gray-400', 'border-white/5');
    });
    
    const activeBtn = document.getElementById(`filter-${type}`);
    if(activeBtn) {
        activeBtn.classList.remove('bg-surface', 'text-gray-400', 'border-white/5');
        activeBtn.classList.add('bg-primary/20', 'text-primary', 'border-primary/30');
    }

    // Lọc và Render lại
    renderOrdersList(allOrdersCache);
}

// 1. Hàm Gọi API (Chỉ chạy 1 lần khi chuyển tab)
async function renderHistoryData() {
    const list = document.getElementById('historyList');
    if(!list) return;

    list.innerHTML = '<div class="text-center py-10 text-gray-500 text-sm"><i class="fa-solid fa-spinner fa-spin mb-2"></i><br>Đang đồng bộ đơn hàng...</div>';
    
    try {
        const res = await fetch('/api/get-orders', {
            method: 'GET',
            headers: getHeaders()
        });

        if (!res.ok) throw new Error("Lỗi tải dữ liệu");

        const history = await res.json();
        if (currentUserUID) loadUserInfo(currentUserUID);
        // Lưu vào Cache
        allOrdersCache = history;

        // Render mặc định theo filter hiện tại (mặc định là 'all')
        filterHistory(currentFilter);

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-center py-4 text-xs text-red-400">Không thể tải lịch sử đơn</div>';
    }
}

// 2. Hàm Hiển thị ra màn hình (Chạy mỗi khi bấm nút lọc)
function renderOrdersList(orders) {
    const list = document.getElementById('historyList');
    if(!list) return;

    let filteredOrders = [];

    // LOGIC LỌC
    if (currentFilter === 'all') {
        filteredOrders = orders;
    } else if (currentFilter === 'running') {
        filteredOrders = orders.filter(item => {
            const st = item.status ? item.status.toLowerCase() : 'pending';
            return ['pending', 'processing', 'inprogress', 'running', 'active'].includes(st);
        });
    } else if (currentFilter === 'finished') {
        filteredOrders = orders.filter(item => {
            const st = item.status ? item.status.toLowerCase() : 'pending';
            return ['success', 'completed', 'done', 'finish', 'cancel', 'cancelled', 'refund', 'failed', 'error'].includes(st);
        });
    }

    if (filteredOrders.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-xs text-gray-500 flex flex-col items-center"><i class="fa-regular fa-folder-open text-2xl mb-2 opacity-50"></i>Không tìm thấy đơn nào</div>';
        return;
    }

    list.innerHTML = '';
    
    filteredOrders.forEach(item => {
        let statusBadge = '';
        const st = item.status ? item.status.toLowerCase() : 'pending';

        if (['done', 'completed', 'finish'].includes(st)) {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500 border border-green-500/20">Hoàn thành</span>';
        } else if (st === 'refund') {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">Đã hoàn tiền</span>';
        } else if (['cancel', 'cancelled', 'error', 'failed'].includes(st)) {
             statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">Đã hủy</span>';
        } else if (st === 'waitrefund') {
             statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">Chờ hoàn tiền</span>';
        } else {
            statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20"><i class="fa-solid fa-circle-notch fa-spin mr-1"></i>Đang chạy</span>';
        }

        let progressHtml = '';
        if (item.quantity > 0 && !['cancel', 'cancelled', 'refund', 'failed'].includes(st)) {
            const current = item.buff_count || 0;
            const percent = Math.min(100, Math.floor((current / item.quantity) * 100));
            
            progressHtml = `
                <div class="mt-2 pt-2 border-t border-white/5">
                    <div class="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Tiến độ: <b class="text-white">${current}</b> / ${item.quantity}</span>
                        <span>${percent}%</span>
                    </div>
                    <div class="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div class="bg-primary h-full rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                    </div>
                </div>
            `;
        }

        const dateObj = new Date(item.created_at);
        const timeStr = dateObj.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
        const dateStr = dateObj.toLocaleDateString('vi-VN', {day: '2-digit', month:'2-digit'});

        const card = document.createElement('div');
        card.className = 'bg-white/5 border border-white/10 rounded-xl p-4 mb-3 relative overflow-hidden group animate-fade-in';
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="pr-2 overflow-hidden">
                    <h4 class="font-bold text-sm text-white leading-tight mb-1 truncate">${item.service_name}</h4>
                    <div class="flex items-center gap-2 text-[10px] text-gray-400 font-mono">
                        <span>${timeStr} ${dateStr}</span>
                        <span class="bg-white/5 px-1.5 rounded text-gray-500">ID: ${item.code_order || '---'}</span>
                    </div>
                </div>
                <div class="shrink-0 pl-2">
                    ${statusBadge}
                </div>
            </div>
            
            <div class="bg-black/20 rounded p-2 border border-white/5 truncate flex items-center gap-2 text-xs mb-2">
                <i class="fa-solid fa-link text-gray-500 text-[10px]"></i> 
                <span class="text-gray-300 font-mono truncate cursor-pointer" onclick="copyTextValue('${item.link}')">${item.link}</span>
            </div>

            <div class="flex justify-between items-center text-xs">
                <span class="text-gray-500">Thanh toán:</span>
                <span class="font-brand font-bold text-primary">${(item.total_price || 0).toLocaleString()} đ</span>
            </div>

            ${progressHtml}
        `;
        list.appendChild(card);
    });
}

async function renderDepositHistory() {
    const list = document.getElementById('depositHistoryList');
    if(!list) return;

    list.innerHTML = '<div class="text-center py-10 text-gray-500 text-sm"><i class="fa-solid fa-spinner fa-spin mb-2"></i><br>Đang tải lịch sử...</div>';
    
    try {
        const res = await fetch('/api/get-deposits', {
            method: 'GET',
            headers: getHeaders()
        });

        if (!res.ok) throw new Error("Lỗi tải dữ liệu");

        const history = await res.json();

        if (history.length === 0) {
            list.innerHTML = '<div class="text-center py-4 text-xs text-gray-500">Chưa có giao dịch nào gần đây</div>';
            return;
        }

        list.innerHTML = '';
        history.forEach(item => {
            const dateObj = new Date(item.created_at);
            const timeStr = dateObj.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            const dateStr = dateObj.toLocaleDateString('vi-VN', {day: '2-digit', month:'2-digit'});

            const card = document.createElement('div');
            card.className = 'bg-white/5 border border-white/10 rounded-xl p-3 mb-2 flex justify-between items-center animate-fade-in';
            card.innerHTML = `
                <div>
                    <div class="text-sm font-bold text-white">Nạp tiền Bank</div>
                    <div class="text-[10px] text-gray-400 font-mono">
                        ${timeStr} ${dateStr} • <span class="text-gray-500">#${item.transId ? item.transId.slice(-4) : '---'}</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-brand font-bold text-success">+${item.amount.toLocaleString()}</div>
                    <div class="text-[10px] text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 inline-block">
                        Thành công
                    </div>
                </div>
            `;
            list.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="text-center py-4 text-xs text-red-400">Không thể tải lịch sử</div>';
    }
}

async function pasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if(text) {
            document.getElementById('linkInput').value = text;
            if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
        } else tg.showAlert("⚠️ Clipboard trống!");
    } catch (err) {
        tg.showAlert('⚠️ Vui lòng dán thủ công (Quyền bị chặn)!');
    }
}

function copyText(id) {
    const el = document.getElementById(id);
    if(el) {
        el.select();
        navigator.clipboard.writeText(el.value).then(() => {
            if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
            tg.showAlert("Đã sao chép nội dung!");
        });
    }
}

function copyTextValue(val) {
     navigator.clipboard.writeText(val).then(() => {
        if(tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert("Đã sao chép số tài khoản!");
    });
}

function logout() {
    if(confirm("Đăng xuất khỏi thiết bị này?")) {
        tg.close();
    }
}

// --- 8. KHỞI CHẠY ---

document.addEventListener("DOMContentLoaded", () => {
    const pSelect = document.getElementById('platformSelect');
    if(pSelect) pSelect.addEventListener('change', function() { renderCategories(this.value); });
    
    const cSelect = document.getElementById('categorySelect');
    if(cSelect) cSelect.addEventListener('change', function() { renderServices(this.value); });
    
    document.querySelectorAll('input').forEach(input => {
        input.addEventListener('focus', function() {
            setTimeout(() => this.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
        });
    });

    initApp();
});

// EXPORT CHO GLOBAL SCOPE
window.switchTab = switchTab;
window.adjustQuantity = adjustQuantity;
window.submitOrder = submitOrder;
window.pasteFromClipboard = pasteFromClipboard;
window.calculatePrice = calculatePrice;
window.updateServiceInfo = updateServiceInfo;
window.adjustDeposit = adjustDeposit;
window.updateDepositQR = updateDepositQR;
window.copyText = copyText;
window.copyTextValue = copyTextValue;
window.logout = logout;
window.filterHistory = filterHistory; // 🔥 Đã export hàm lọc
