import asyncio
import requests
import time
import urllib.parse
import os
import base64
from datetime import datetime
from telethon import TelegramClient
from telethon.tl.functions.messages import RequestWebViewRequest

# ==========================================
# CONFIGURATION
# ==========================================
CLOUD_ID = int(os.environ.get('AWS_CLUSTER_ID', '0'))
CLOUD_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
SYS_CACHE_FILE = 'monitor_cache' 

# [SECURE] Thông tin thanh toán
SECURE_BANK_ACC = os.environ.get('BANK_ACCOUNT', '')  
SECURE_BANK_NAME = os.environ.get('BANK_OWNER', '')   

# Cấu hình
TARGET_SERVICE = base64.b64decode("R29tWHVfQm90").decode() 
WEB_ENDPOINT = base64.b64decode("aHR0cHM6Ly9nb214dS5vbmxpbmU=").decode()
API_CLUSTER = base64.b64decode("aHR0cHM6Ly9nb214dS5zaXRl").decode()

CLUSTER_CONFIG = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": WEB_ENDPOINT,
    "referrer": f"{WEB_ENDPOINT}/",
    "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
}

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def log(msg, type="INFO"):
    # Hàm in log có màu sắc và thời gian
    timestamp = datetime.now().strftime("%H:%M:%S")
    icon = "ℹ️"
    if type == "SUCCESS": icon = "✅"
    elif type == "ERROR": icon = "❌"
    elif type == "WARN": icon = "⚠️"
    elif type == "WAIT": icon = "⏳"
    
    print(f"[{timestamp}] {icon} {msg}", flush=True)

def log_step(step_num, total, name):
    print(f"\n   --------------------------------------------------")
    print(f"   👉 STEP [{step_num}/{total}]: {name}")
    print(f"   --------------------------------------------------", flush=True)

# ==========================================
# CORE PROTOCOLS
# ==========================================
async def init_cluster_handshake():
    log("Khởi tạo kết nối Telegram...", "WAIT")
    
    client = TelegramClient(SYS_CACHE_FILE, CLOUD_ID, CLOUD_KEY)
    
    try:
        await client.connect()
        if not await client.is_user_authorized():
            log("Session không hợp lệ hoặc chưa đăng nhập!", "ERROR")
            await client.disconnect()
            return None

        log(f"Đang tìm Bot: {TARGET_SERVICE}...", "WAIT")
        try:
            bot_peer = await client.get_input_entity(TARGET_SERVICE)
        except:
            log("Không thấy Bot. Gửi lệnh /start để kích hoạt...", "WARN")
            await client.send_message(TARGET_SERVICE, "/start")
            time.sleep(2)
            bot_peer = await client.get_input_entity(TARGET_SERVICE)

        log("Đang lấy Query Token (WebView)...", "WAIT")
        webview_req = await client(RequestWebViewRequest(
            peer=bot_peer,
            bot=bot_peer,
            platform='android',
            from_bot_menu=False,
            url=WEB_ENDPOINT
        ))
        
        await client.disconnect()
        
        auth_url = webview_req.url
        params = urllib.parse.parse_qs(auth_url.split('#')[1])
        token = params.get('tgWebAppData', [None])[0]
        
        if token:
             log(f"Lấy Token thành công! (Length: {len(token)})", "SUCCESS")
        return token

    except Exception as e:
        log(f"Lỗi Handshake: {e}", "ERROR")
        try: await client.disconnect()
        except: pass
        return None

def execute_stress_test(access_token):
    default_sleep = 905 
    if not access_token: return default_sleep
    
    secure_packet = {"initData": access_token}
    
    print("\n🚀 BẮT ĐẦU CHU KỲ NHIỆM VỤ MỚI")
    print("==================================================")

    # [1] View Ads
    log_step(1, 6, "VIEW ADS REWARD")
    try:
        res = requests.post(f"{API_CLUSTER}/viewads", headers=CLUSTER_CONFIG, json={**secure_packet, "typeReward": "goldCoin"}, timeout=12)
        log(f"Status: {res.status_code} | Response: {res.text}", "INFO")
    except Exception as e: 
        log(f"Lỗi Request: {e}", "ERROR")

    # [2] Random Gold
    log_step(2, 6, "RANDOM GOLD")
    try:
        res = requests.post(f"{API_CLUSTER}/randomgold", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
        log(f"Status: {res.status_code} | Response: {res.text}", "INFO")
    except Exception as e:
        log(f"Lỗi Request: {e}", "ERROR")

    # [3] Click Links
    log_step(3, 6, "CLICK SMART LINKS")
    services = ["ads_monetag", "ads_hitopads", "ads_datifi", "ads_hitopads2"]
    for i, svc in enumerate(services):
        try:
            print(f"      🔸 [{i+1}/{len(services)}] Requesting: {svc}...", end=" ", flush=True)
            res = requests.post(f"{API_CLUSTER}/clicksmartlink", headers=CLUSTER_CONFIG, json={**secure_packet, "linkKey": svc}, timeout=12)
            print(f"[{res.status_code}]")
            # Nếu cần in chi tiết body mỗi link thì bỏ comment dòng dưới
            # print(f"         └── Response: {res.text}")
            time.sleep(1)
        except Exception as e:
            print(f"[FAIL] {e}")

    # [4] Mining Logic
    log_step(4, 6, "MINING OPERATION")
    try:
        # Check status
        res_check = requests.post(f"{API_CLUSTER}/ismining", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
        log(f"Kiểm tra trạng thái (/ismining): Code {res_check.status_code} | Body: {res_check.text}", "INFO")
        
        if res_check.status_code == 202:
            log("Trạng thái 202 (Ready). Đang gọi lệnh đào...", "WAIT")
            res_mine = requests.post(f"{API_CLUSTER}/mining", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
            log(f"Kết quả đào: Code {res_mine.status_code} | Body: {res_mine.text}", "SUCCESS")
        else:
            log("Chưa đến giờ đào hoặc đang đào (Status != 202). Bỏ qua.", "WARN")
    except Exception as e:
        log(f"Lỗi Mining: {e}", "ERROR")

    # [5] Auto Withdraw Logic
    log_step(5, 6, "AUTO WITHDRAW CHECK")
    try:
        if not SECURE_BANK_ACC or not SECURE_BANK_NAME:
            log("Thiếu thông tin BANK_ACCOUNT hoặc BANK_OWNER trong ENV. Bỏ qua bước này.", "WARN")
        else:
            res_bal = requests.post(f"{API_CLUSTER}/balance", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
            if res_bal.status_code == 200:
                data = res_bal.json()
                current_gold = data.get('gold', 0)
                
                print(f"      💰 Số dư hiện tại: {current_gold:,.0f} Gold")
                print(f"      🎯 Mục tiêu rút  : 20,000,000 Gold")
                
                if current_gold >= 20000000:
                    log("ĐỦ ĐIỀU KIỆN RÚT TIỀN! ĐANG THỰC HIỆN...", "SUCCESS")
                    withdraw_body = {
                        "initData": access_token,
                        "payload": {
                            "bankName": "momo",
                            "bankAccount": SECURE_BANK_ACC,
                            "bankOwner": SECURE_BANK_NAME,
                            "withdrawAmount": 20000000
                        }
                    }
                    res_wd = requests.post(f"{API_CLUSTER}/withdraw", headers=CLUSTER_CONFIG, json=withdraw_body, timeout=15)
                    log(f"Lệnh rút tiền: Code {res_wd.status_code} | Body: {res_wd.text}", "INFO")
                else:
                    log("Chưa đủ tiền rút. Bỏ qua.", "INFO")
            else:
                log(f"Không lấy được số dư. Code: {res_bal.status_code}", "ERROR")
    except Exception as e:
        log(f"Lỗi Withdraw: {e}", "ERROR")

    # [6] Check Ads Status & Calculate Sleep Time
    log_step(6, 6, "CALCULATE NEXT CYCLE")
    try:
        res_status = requests.post(f"{API_CLUSTER}/adsstatus", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
        log(f"Phản hồi Server: Code {res_status.status_code}", "INFO")
        print(f"      📄 Body: {res_status.text}")
        
        if res_status.status_code == 200:
            data = res_status.json()
            server_wait_time = data.get('time', 0)
            
            calculated_sleep = server_wait_time + 1
            log(f"Server yêu cầu chờ: {server_wait_time}s", "INFO")
            log(f"Thời gian ngủ tính toán: {calculated_sleep}s", "SUCCESS")
            
            return calculated_sleep
        else:
            log("Lỗi lấy thời gian chờ. Dùng mặc định.", "ERROR")
            return default_sleep

    except Exception as e:
        log(f"Lỗi tính toán thời gian: {e}", "ERROR")
        return default_sleep

# ==========================================
# MAIN PROCESS LOOP
# ==========================================
async def main_process():
    print("\n=== SYSTEM HEALTH MONITOR STARTED (VERBOSE MODE) ===", flush=True)
    
    while True:
        try:
            sys_token = await init_cluster_handshake()
            
            wait_time = 905 
            
            if sys_token:
                wait_time = execute_stress_test(sys_token)
                
                if wait_time < 60: 
                    log("Thời gian chờ < 60s. Force set lên 60s để an toàn.", "WARN")
                    wait_time = 60
            else:
                log("Handshake thất bại. Thử lại sau 15 phút.", "ERROR")
                wait_time = 900

            print(f"\n💤 NGỦ ĐÔNG {wait_time} GIÂY...", flush=True)
            print("==================================================\n")
            await asyncio.sleep(wait_time)
            
        except Exception as e:
            log(f"Lỗi Vòng Lặp Chính: {e}", "ERROR")
            await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main_process())
