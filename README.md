<div align="center">

  # 🚀 Binance P2P LKR Rate Live Update

  **A modern, high-performance Manifest V3 Chrome Extension that tracks live Binance P2P USDT/LKR rates, top advertiser feeds, 7-day trend graphs, and currency converters right from your browser toolbar.**

  <br />

  [![Manifest V3](https://img.shields.io/badge/Manifest-V3-F0B90B?style=for-the-badge&logo=googlechrome&logoColor=white)](file:///manifest.json)
  [![Binance API](https://img.shields.io/badge/Binance-P2P_Public_API-F3BA2F?style=for-the-badge&logo=binance&logoColor=black)](https://p2p.binance.com)
  [![Pair](https://img.shields.io/badge/Pair-USDT_%2F_LKR-363C4E?style=for-the-badge)](https://p2p.binance.com)
  [![Made by Infiax](https://img.shields.io/badge/Made_with_%E2%9D%A4_by-Infiax_(Pvt)_Ltd-000000?style=for-the-badge)](https://infiax.com)
  [![License](https://img.shields.io/badge/License-MIT-0ECB81?style=for-the-badge)](LICENSE)

</div>

---

## 🌟 Key Features

- 🟢 **Live Summary Rates & Spread**: Real-time **Best Buy Rate**, **Best Sell Rate**, and calculated **Spread Margin %**.
- 🛒 **Top Merchant Ads Feed**: Displays seller nickname, verified merchant badge, monthly completion rate %, min-max order limits, and payment methods.
- 🎯 **User-Defined Order Limit Filter**: Enter your target LKR amount (e.g. `Rs. 50,000`) in the toolbar to filter ads and home summary rates specifically for your trade size.
- 🧮 **Visual USDT ↔ LKR Converter**: Calculate converted USDT or LKR using live rates with **Buy Rate / Sell Rate** mode chips, 1-tap quick preset pills (`25K`, `50K`, `100K`, `250K`, `500K`), and order limit warning alerts.
- 📊 **7-Day Trend Chart & History**: Interactive SVG sparkline graph with dual **Buy (Green)** and **Sell (Red)** trend curves, 7-day High/Low stats, and daily logs.
- 🔔 **Chrome Toolbar Rate Badge**: Background service worker periodically updates the extension toolbar icon with the current best LKR rate every 2 minutes.
- 🎨 **Binance Dark Aesthetics**: Sleek, ultra-compact interface crafted with `Poppins` and `Inter` typography.

---

## 🛠️ Project Structure

```
├── manifest.json         # Extension Manifest V3 configuration
├── binance-api.js        # Binance P2P public API engine with multi-domain fallback
├── background.js         # Service Worker for periodic background rate alarms & badge updates
├── popup.html            # Main extension popup HTML markup
├── popup.js              # Interactive UI logic, tab switching, filters, & calculator math
├── styles.css            # Binance dark theme styling & typography
├── rules.json            # DeclarativeNetRequest CORS header override rules
├── privacy-policy.html   # Standalone Privacy Policy page
└── icons/                # Extension icon assets (16x16, 32x32, 48x48, 128x128)
```

---

## 🚀 Quick Installation (Developer Mode)

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/harindujayakody/binance-p2p-lkr-rate-live-update.git
   ```
2. Open **Google Chrome** and navigate to:
   `chrome://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** (top-left) and select the cloned project folder.
5. Click the extension icon on your Chrome toolbar to view live P2P rates!

---

## 🔒 Privacy & Security

- **Zero Personal Data Collection**: This extension does **NOT** track, collect, store, or transmit personal user data, credentials, passwords, or browsing history.
- **Local Storage Only**: User settings (such as target order limit amounts) are stored on-device using Chrome's native `chrome.storage.local` API.
- **Direct Public API Calls**: Network requests connect directly to Binance's public JSON API (`binance.com`) without user identifiers.

---

## 📄 License & Credits

Distributed under the MIT License.

Developed with ❤️ by **[Infiax (Pvt) Ltd](https://infiax.com)**  
Contact: [contact@infiax.com](mailto:contact@infiax.com)
