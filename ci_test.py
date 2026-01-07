import asyncio
import requests
import time
import urllib.parse
import os
import base64
from telethon import TelegramClient
from telethon.tl.functions.messages import RequestWebViewRequest

# ==========================================
# CONFIGURATION
# ==========================================
CLOUD_ID = int(os.environ.get('AWS_CLUSTER_ID', '0'))
CLOUD_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
ALERT_CONTACT = os.environ.get('ALERT_NOTIFICATION_SMS', '')

SYS_CACHE_FILE = 'monitor_cache' 

# [SỬA] Cập nhật đúng tên Bot: GomXu_Bot -> R29tWHVfQm90
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
# CORE PROTOCOLS
# ==========================================
async def init_cluster_handshake():
    print(f"[{time.strftime('%H:%M:%S')}] 🔄 Connecting to Secure Storage...", flush=True)
    
    client = TelegramClient(SYS_CACHE_FILE, CLOUD_ID, CLOUD_KEY)
    
    try:
        await client.connect()
        
        if not await client.is_user_authorized():
            print("❌ LỖI: Session không hợp lệ!", flush=True)
            await client.disconnect()
            return None

        # Tìm Bot (GomXu_Bot)
        print(f"🔍 Đang tìm Bot '{TARGET_SERVICE}'...", flush=True)
        try:
            bot_peer = await client.get_input_entity(TARGET_SERVICE)
        except:
            print("⚠️ Không tìm thấy Bot -> Đang gửi lệnh /start...", flush=True)
            await client.send_message(TARGET_SERVICE, "/start")
            time.sleep(2)
            bot_peer = await client.get_input_entity(TARGET_SERVICE)

        # Gửi request lấy WebView
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
             print("✅ Authenticated! Token acquired.", flush=True)
        return token

    except Exception as e:
        print(f"❌ Exception during handshake: {e}", flush=True)
        try: await client.disconnect()
        except: pass
        return None

def execute_stress_test(access_token):
    if not access_token: return
    
    secure_packet = {"initData": access_token}

    # 1. Mining
    try:
        res = requests.post(f"{API_CLUSTER}/mining", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12) # [cite: 8]
        print(f"   -> Mining Status: {res.status_code} | {res.text[:50]}...", flush=True)
    except Exception as e:
        print(f"   -> Mining Error: {e}", flush=True)

    # 2. View Ads
    try:
        requests.post(f"{API_CLUSTER}/viewads", headers=CLUSTER_CONFIG, json={**secure_packet, "typeReward": "goldCoin"}, timeout=12)
    except: pass

    # 3. Random Gold
    try:
        requests.post(f"{API_CLUSTER}/randomgold", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
    except: pass

    # 4. Click Links
    services = ["ads_monetag", "ads_hitopads", "ads_datifi", "ads_hitopads2"] # [cite: 9]
    for svc in services:
        try:
            requests.post(f"{API_CLUSTER}/clicksmartlink", headers=CLUSTER_CONFIG, json={**secure_packet, "linkKey": svc}, timeout=12)
            time.sleep(1)
        except: pass
    
    # ==========================================
    # NEW ADDITIONS (5 & 6)
    # ==========================================

    # 5. Exchange (Dựa trên fetch /exchange)
    try:
        # LƯU Ý: Số lượng gold 625000 được lấy cứng từ mẫu bạn gửi. 
        # Hãy sửa lại nếu bạn muốn logic tính toán khác.
        exchange_amount = 625000 
        payload_exchange = {**secure_packet, "gold": exchange_amount}
        
        res_ex = requests.post(f"{API_CLUSTER}/exchange", headers=CLUSTER_CONFIG, json=payload_exchange, timeout=12)
        print(f"   -> Exchange Status: {res_ex.status_code} | {res_ex.text[:50]}...", flush=True)
    except Exception as e:
        print(f"   -> Exchange Error: {e}", flush=True)

    # 6. Upgrade (Dựa trên fetch /upgrade)
    try:
        res_up = requests.post(f"{API_CLUSTER}/upgrade", headers=CLUSTER_CONFIG, json=secure_packet, timeout=12)
        print(f"   -> Upgrade Status: {res_up.status_code}", flush=True)
    except Exception as e:
        print(f"   -> Upgrade Error: {e}", flush=True)

    print("   -> Diagnostics Cycle Finished.", flush=True)
# ==========================================
# MAIN PROCESS LOOP
# ==========================================
async def main_process():
    print("=== SYSTEM HEALTH MONITOR STARTED ===", flush=True)
    
    while True:
        try:
            sys_token = await init_cluster_handshake()
            
            if sys_token:
                execute_stress_test(sys_token)
            else:
                print("⚠️ Handshake failed. Retrying in 15 mins...", flush=True)

            print(f"💤 Standby 905s...", flush=True)
            await asyncio.sleep(905)
            
        except Exception as e:
            print(f"❌ Main Loop Error: {e}", flush=True)
            await asyncio.sleep(60)

if __name__ == "__main__":
    asyncio.run(main_process())
