import { verifyInitData } from "./_tg";

export default async function handler(req, res) {
    // ===== 1. VERIFY TELEGRAM =====
    const initData = req.headers["x-init-data"];
    const user = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN);

    if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // ===== 2. CONFIG API NGUỒN =====
    const API_URL = "https://likenhanh.pro/api/service/list";
    const API_KEY = process.env.PROVIDER_API_KEY; // ⬅️ KHÔNG HARDCODE

    if (!API_KEY) {
        return res.status(500).json({ error: "Missing PROVIDER_API_KEY" });
    }

    try {
        // ===== 3. GỌI API NGUỒN =====
        const formData = new URLSearchParams();
        formData.append("apikey", API_KEY);

        const response = await fetch(API_URL, {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        const data = await response.json();
        if (data.status !== "success") {
            throw new Error("Không lấy được dịch vụ");
        }

        // ===== 4. ĂN CHÊNH =====
        const PERCENT_PROFIT = 30;

        const myServices = data.data
            .filter(s => s.status === "on")
            .map(service => {
                const originalPrice = parseFloat(service.prices);
                const myPrice = Math.ceil(originalPrice * (100 + PERCENT_PROFIT) / 100);

                return {
                    server_order: service.server_order,
                    name: service.name,
                    price: myPrice,
                    social: service.social,
                    service: service.service, // dùng để phân loại
                    min: service.min_order,
                    max: service.max_order,
                    detail: service.detail
                };
            });

        return res.status(200).json(myServices);

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
