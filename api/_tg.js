import crypto from "crypto";

export function verifyInitData(initData, botToken) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  // 1. Tạo chuỗi check (Giữ nguyên)
  const dataCheckString = [...params.entries()]
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  // 2. So sánh chữ ký (Giữ nguyên)
  if (calculatedHash !== hash) return null;

  // 3. ✅ CÁI BẠN CẦN THÊM: Check hạn sử dụng (Chống Replay Attack)
  const authDate = parseInt(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000); // Thời gian hiện tại (giây)

  // Nếu dữ liệu cũ quá 24h (86400 giây) -> Từ chối
  // Bạn có thể chỉnh xuống 300s (5 phút) nếu muốn bảo mật cực cao
  if (now - authDate > 86400) {
      console.error("InitData expired (Quá hạn)");
      return null;
  }

  // 4. Trả về user (Giữ nguyên)
  try {
    return JSON.parse(params.get("user"));
  } catch {
    return null;
  }
}
