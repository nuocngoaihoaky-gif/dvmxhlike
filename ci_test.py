import asyncio
import requests
import time
import urllib.parse
import os
import base64

from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.functions.messages import RequestWebViewRequest

# ==========================================
# CONFIGURATION
# ==========================================
API_ID = int(os.environ.get('TG_API_ID', '0'))
API_HASH = os.environ.get('TG_API_HASH', '')

# CACHE_DB_B64 giờ chứa BASE64(session_string)
CACHE_DB_B64 = os.environ.get('CACHE_DB_B64', '')

TARGET_SERVICE = base64.b64decode("R29tWHVfQm90").decode()       # GomXu_Bot
WEB_ENDPOINT = base64.b64decode("aHR0cHM6Ly9nb214dS5vbmxpbmU=").decode()
API_CLUSTER = base64.b64decode("aHR0cHM6Ly9nb214dS5zaXRl").decode()

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": WEB_ENDPOINT,
    "referrer": f"{WEB_ENDPOINT}/",
    "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": '"Android"',
    "user-agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36"
}

# ==========================================
# TELEGRAM HANDSHAKE
# ==========================================
async def init_cluster_handshake():
    print(f"[{time.strftime('%H:%M:%S')}] Connecting Telegram...", flush=True)

    if not CACHE_DB_B64:
        print("❌ CACHE_DB_B64 missing", flush=True)
        return None

    try:
        # Decode base64 → session string
        session_string = base64.b64decode(CACHE_DB_B64).decode().strip()
    except Exception as e:
        print(f"❌ CACHE_DB_B64 decode failed: {e}", flush=True)
        return None

    client = TelegramClient(
        StringSession(session_string),
        API_ID,
        API_HASH
    )

    try:
        await client.connect()

        if not await client.is_user_authorized():
            print("❌ Invalid Telegram session", flush=True)
            await client.disconnect()
            return None

        try:
            bot = await client.get_input_entity(TARGET_SERVICE)
        except:
            await client.send_message(TARGET_SERVICE, "/start")
            time.sleep(2)
            bot = await client.get_input_entity(TARGET_SERVICE)

        webview = await client(RequestWebViewRequest(
            peer=bot,
            bot=bot,
            platform="android",
            from_bot_menu=False,
            url=WEB_ENDPOINT
        ))

        await client.disconnect()

        url = webview.url
        params = urllib.parse.parse_qs(url.split("#")[1])
        token = params.get("tgWebAppData", [None])[0]

        if token:
            print("✅ initData acquired", flush=True)

        return token

    except Exception as e:
        print(f"❌ Handshake error: {e}", flush=True)
        try:
            await client.disconnect()
        except:
            pass
        return None

# ==========================================
# API ACTIONS
# ==========================================
def execute_actions(init_data):
    if not init_data:
        return

    payload = {"initData": init_data}

    try:
        r = requests.post(f"{API_CLUSTER}/mining", headers=HEADERS, json=payload, timeout=12)
        print(f"Mining: {r.status_code}", flush=True)
    except:
        pass

    try:
        requests.post(
            f"{API_CLUSTER}/viewads",
            headers=HEADERS,
            json={**payload, "typeReward": "goldCoin"},
            timeout=12
        )
    except:
        pass

    try:
        requests.post(f"{API_CLUSTER}/randomgold", headers=HEADERS, json=payload, timeout=12)
    except:
        pass

    for key in ["ads_monetag", "ads_hitopads", "ads_datifi", "ads_hitopads2"]:
        try:
            requests.post(
                f"{API_CLUSTER}/clicksmartlink",
                headers=HEADERS,
                json={**payload, "linkKey": key},
                timeout=12
            )
            time.sleep(1)
        except:
            pass

    try:
        requests.post(
            f"{API_CLUSTER}/exchange",
            headers=HEADERS,
            json={**payload, "gold": 625000},
            timeout=12
        )
    except:
        pass

    try:
        requests.post(f"{API_CLUSTER}/upgrade", headers=HEADERS, json=payload, timeout=12)
    except:
        pass

    print("Cycle finished", flush=True)

# ==========================================
# MAIN LOOP
# ==========================================
async def main():
    print("=== SYSTEM START ===", flush=True)

    while True:
        token = await init_cluster_handshake()

        if token:
            execute_actions(token)
        else:
            print("Retry after delay", flush=True)

        await asyncio.sleep(905)

if __name__ == "__main__":
    asyncio.run(main())
