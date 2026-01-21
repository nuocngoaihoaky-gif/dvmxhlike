import asyncio
import aiohttp
import time
import os
import base64
import urllib.parse
from datetime import datetime
from telethon import TelegramClient
from telethon.tl.functions.messages import RequestWebViewRequest

# ==========================================
# CẤU HÌNH HỆ THỐNG (GITHUB SECRETS)
# ==========================================
CLOUD_ID = int(os.environ.get('AWS_CLUSTER_ID', '0')) # API_ID
CLOUD_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '') # API_HASH
SYS_CACHE_FILE = 'monitor_cache' 

# GIẢI MÃ SERVER
TARGET_SERVICE = base64.b64decode("R29tWHVfQm90").decode() 
WEB_ENDPOINT = base64.b64decode("aHR0cHM6Ly9nb214dS5vbmxpbmU=").decode()
API_CLUSTER = base64.b64decode("aHR0cHM6Ly9nb214dS5zaXRl").decode()

# HEADERS (GIẢ LẬP ANDROID)
CLUSTER_CONFIG = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "vi,en;q=0.9",
    "content-type": "application/json",
    "origin": WEB_ENDPOINT,
    "referrer": f"{WEB_ENDPOINT}/",
    "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
}

class GomXuGodMode:
    def __init__(self):
        self.session = None
        
        # Token Management
        self.current_token = None
        self.token_created_at = 0 
        self.token_lock = asyncio.Lock()
        self.TOKEN_TTL = 180  # Token sống 3 phút
        self.MIN_REFRESH = 60 # Không lấy lại nếu chưa qua 60s

    # ==========================================
    # CORE: TOKEN MANAGER (AUTO LOGIN & REFRESH)
    # ==========================================
    async def get_telegram_token_raw(self):
        try:
            client = TelegramClient(SYS_CACHE_FILE, CLOUD_ID, CLOUD_KEY)
            await client.connect()
            
            if not await client.is_user_authorized():
                print("⛔ [AUTH] Session chưa đăng nhập!")
                await client.disconnect()
                return None

            try:
                bot = await client.get_input_entity(TARGET_SERVICE)
            except:
                await client.send_message(TARGET_SERVICE, "/start")
                await asyncio.sleep(2)
                bot = await client.get_input_entity(TARGET_SERVICE)

            webview = await client(RequestWebViewRequest(
                peer=bot,
                bot=bot,
                platform='android',
                from_bot_menu=False,
                url=WEB_ENDPOINT
            ))
            await client.disconnect()
            
            auth_url = webview.url
            token = urllib.parse.parse_qs(auth_url.split('#')[1]).get('tgWebAppData', [None])[0]
            return token
        except Exception as e:
            print(f"⛔ [AUTH] Lỗi Telethon: {e}")
            return None

    async def ensure_token(self):
        async with self.token_lock:
            now = time.time()
            if self.current_token is None or (now - self.token_created_at) > self.TOKEN_TTL:
                if (now - self.token_created_at) < self.MIN_REFRESH and self.current_token:
                    return self.current_token

                print(f"♻️ [AUTH] Refresh Token...")
                new_token = await self.get_telegram_token_raw()
                
                if new_token:
                    self.current_token = new_token
                    self.token_created_at = now
                    print(f"✅ [AUTH] Token Updated!")
                else:
                    print("⚠️ [AUTH] Lấy thất bại. Dùng token cũ.")
            return self.current_token

    async def request(self, method, endpoint, payload=None):
        token = await self.ensure_token()
        if not token: return 0, None
            
        url = f"{API_CLUSTER}{endpoint}"
        headers = CLUSTER_CONFIG.copy()
        payload = payload or {}
        payload['initData'] = token

        try:
            async with self.session.request(method, url, json=payload, headers=headers) as resp:
                if resp.status == 401:
                    print("🔄 [API] 401 Unauthorized -> Force Refresh.")
                    self.token_created_at = 0 
                    return await self.request(method, endpoint, payload)
                    
                if resp.content_type == 'application/json':
                    return resp.status, await resp.json()
                return resp.status, await resp.text()
        except Exception as e:
            return 0, str(e)

    # ==========================================
    # WORKER 1: ADS FARMER (View Ads & Status)
    # ==========================================
    async def worker_ads(self):
        print("📺 [ADS] Started...")
        while True:
            status, data = await self.request("POST", "/adsstatus")
            
            if status == 204: # Ready
                # print("🚀 [ADS] Attack!")
                await self.request("POST", "/viewads", {"typeReward": "goldCoin"})
                await self.request("POST", "/randomgold")
                await asyncio.sleep(5) # Hồi chiêu server xử lý
                continue

            if status == 200 and isinstance(data, dict):
                wait = data.get('time', 0)
                if wait > 0:
                    # print(f"⏳ [ADS] Sleep {wait}s")
                    await asyncio.sleep(wait + 1)
                    continue
                else:
                    await asyncio.sleep(5)
                    continue

            await asyncio.sleep(60)

    # ==========================================
    # WORKER 2: MINER (Đào khoáng)
    # ==========================================
    async def worker_miner(self):
        print("⛏️ [MINER] Started...")
        while True:
            status, data = await self.request("POST", "/ismining")

            if status == 202: # Ready
                print("💎 [MINER] Mining now!")
                ms, _ = await self.request("POST", "/mining")
                if ms == 200: await asyncio.sleep(5)
                else: await asyncio.sleep(60)
                continue

            if status == 200 and isinstance(data, dict) and "remainingTime" in data:
                wait = data["remainingTime"] + 1
                h, r = divmod(wait, 3600)
                m, s = divmod(r, 60)
                print(f"⏳ [MINER] Sleeping: {int(h)}h {int(m)}m {int(s)}s")
                await asyncio.sleep(wait)
                continue

            await asyncio.sleep(60)

    # ==========================================
    # WORKER 3: GOLD HUNTER (Rương vàng)
    # ==========================================
    async def worker_gold(self):
        print("🎁 [GOLD] Started...")
        while True:
            status, data = await self.request("POST", "/getstatusrandomgold")

            if status == 204:
                print("🎁 [GOLD] Claiming...")
                await self.request("POST", "/randomgold")
                await asyncio.sleep(5)
                continue

            if status == 200 and isinstance(data, dict) and "timeCointDown" in data:
                wait = data["timeCointDown"] + 1
                m, s = divmod(wait, 60)
                # print(f"⏳ [GOLD] Wait: {int(m)}m {int(s)}s")
                await asyncio.sleep(wait)
                continue

            await asyncio.sleep(60)

    # ==========================================
    # WORKER 4: SMART LINK (Link manager)
    # ==========================================
    async def worker_links(self):
        print("🔗 [LINK] Started...")
        while True:
            status, data = await self.request("POST", "/getsmartlink")

            if status != 200 or not isinstance(data, list):
                await asyncio.sleep(60)
                continue

            ready_links = []
            waiting_times = []
            active_missions = 0

            for item in data:
                rem = item.get("remainingClicks", 0)
                if rem > 0:
                    active_missions += 1
                    if item.get("canClick"):
                        ready_links.append(item.get("linkKey"))
                    elif item.get("cooldownRemaining", 0) > 0:
                        waiting_times.append(item.get("cooldownRemaining"))

            if active_missions == 0:
                print("⛔ [LINK] All done. Sleep 30 mins.")
                await asyncio.sleep(1800)
                continue

            if ready_links:
                print(f"🔗 [LINK] Clicking {len(ready_links)} links...")
                tasks = [self.request("POST", "/clicksmartlink", {"linkKey": k}) for k in ready_links]
                await asyncio.gather(*tasks)
                await asyncio.sleep(5)
                continue

            if waiting_times:
                wait = min(waiting_times) + 1
                # print(f"⏳ [LINK] Wait min: {wait}s")
                await asyncio.sleep(wait)
                continue

            await asyncio.sleep(60)

    # ==========================================
    # WORKER 5: FINANCE (Upgrade & Exchange) - TURBO MODE
    # ==========================================
    async def worker_finance(self):
        print("💰 [FINANCE] Started (Turbo Mode)...")
        while True:
            # 1. Check Balance
            s, data = await self.request("POST", "/balance")
            
            if s == 200 and isinstance(data, dict):
                gold = data.get("gold", 0)
                diamond = data.get("diamon", 0)

                # 2. Exchange Gold -> Diamond (Mốc 625k)
                if gold >= 625000:
                    print(f"💱 [EXCHANGE] {gold:,} Gold -> Diamond")
                    es, _ = await self.request("POST", "/exchange", {"gold": 625000})
                    if es == 200:
                        # Update nhanh số dư ảo để check upgrade luôn
                        diamond += 5000 
                        gold -= 625000

                # 3. Upgrade (Mốc 5k Diamond)
                if diamond >= 5000:
                    print(f"🆙 [UPGRADE] Using {diamond:,} Diamond")
                    await self.request("POST", "/upgrade")

            # CHẾ ĐỘ SPAM: Check ví liên tục mỗi 10 giây
            # Vì bạn bảo server trâu, ko lo block
            await asyncio.sleep(10)

    # ==========================================
    # MAIN
    # ==========================================
    async def run(self):
        print("\n=== GOMXU GOD MODE: ACTIVATED ===")
        async with aiohttp.ClientSession() as session:
            self.session = session
            await self.ensure_token() # Init token
            
            # Chạy 5 luồng song song
            await asyncio.gather(
                self.worker_ads(),
                self.worker_miner(),
                self.worker_gold(),
                self.worker_links(),
                self.worker_finance()
            )

if __name__ == "__main__":
    try:
        bot = GomXuGodMode()
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        pass
