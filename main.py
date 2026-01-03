import os
import signal
import sys
from telebot import TeleBot, types

sys_core_token = os.environ.get("APP_KEY")

if not sys_core_token:
    sys.exit(1)

service_node = TeleBot(sys_core_token)

BROADCAST_MSG = """🎊 SALE NĂM MỚI 2026 – ƯU ĐÃI MỞ BÁT 🎊

🔥 DVMXH Like chính thức ra mắt năm mới
💥 MỞ BÁT ĐẦU NĂM – GIÁ SỐC CHÀO XUÂN

💸 BẢNG GIÁ SALE:
🧧 8K = 1.000 Follow Facebook
🧧 28K = 1.000 Follow TikTok
🧧 3K = 1.000 Tym TikTok

⚙️ Hệ thống phản hồi ổn định
🎯 Phù hợp test dịch vụ & tương tác

👇 Chọn hành động bên dưới để truy cập hệ thống
"""

main_dashboard = types.ReplyKeyboardMarkup(resize_keyboard=True, row_width=1)

web_module_config = types.WebAppInfo("https://dvmxhlike.vercel.app/")
btn_main = types.KeyboardButton(text="🚀 TRUY CẬP", web_app=web_module_config)

btn_channel = types.KeyboardButton(text="📢 Intro Like Channel")
btn_group = types.KeyboardButton(text="👥 Cộng Đồng Intro Like")

main_dashboard.add(btn_main)

inline_start = types.InlineKeyboardMarkup()
inline_start.add(types.InlineKeyboardButton(text="🚀 TRUY CẬP", url="https://t.me/dvmxh_like_bot/MiniApp"))

def grace_shutdown(sig, frame):
    service_node.stop_polling()
    sys.exit(0)

signal.signal(signal.SIGTERM, grace_shutdown)
signal.signal(signal.SIGINT, grace_shutdown)

@service_node.message_handler(commands=["start"])
def init_handshake(transaction):
    service_node.send_message(
        transaction.chat.id,
        "👋 Chào mừng bạn đến với DVMXH Like!",
        reply_markup=main_dashboard
    )
    
    service_node.send_message(
        transaction.chat.id,
        BROADCAST_MSG,
        reply_markup=inline_start
    )

@service_node.message_handler(func=lambda m: m.text == "📢 Intro Like Channel")
def nav_channel(transaction):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton(text="👉 BẤM ĐỂ THAM GIA KÊNH", url="https://t.me/vienduatin"))
    service_node.send_message(transaction.chat.id, "Truy cập kênh chính thức dưới đây:", reply_markup=markup)

@service_node.message_handler(func=lambda m: m.text == "👥 Cộng Đồng Intro Like")
def nav_group(transaction):
    markup = types.InlineKeyboardMarkup()
    markup.add(types.InlineKeyboardButton(text="👉 BẤM ĐỂ VÀO NHÓM", url="https://t.me/BAOAPPMIENPHI22"))
    service_node.send_message(transaction.chat.id, "Tham gia cộng đồng thảo luận:", reply_markup=markup)

if __name__ == "__main__":
    try:
        service_node.infinity_polling()
    except:
        pass
