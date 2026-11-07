/**
 * Binance P2P API Helper Service
 * Interacts directly with Binance's P2P endpoints with multi-domain fallback.
 *
 * NOTE: /bapi/c2c/v2/friendly/c2c/adv/search is an UNDOCUMENTED internal
 * endpoint (see #2). Binance may change, rate-limit, or block it at any
 * time; there is no SLA. Callers must back off on failure (background.js
 * does exponential backoff) and never treat this as a supported API.
 * No CORS-stripping rules are used: the background service worker fetches
 * with the extension's host permission, which does not need (and must not
 * have) Access-Control-Allow-Origin overrides (see #1).
 */

const BINANCE_ENDPOINTS = [
  'https://www.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
  'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
  'https://c2c.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'
];

/**
 * Fetch P2P Advertisements for a given trade type and fiat/asset configuration
 * @param {Object} options
 * @param {'BUY'|'SELL'} options.tradeType - BUY means buying crypto using fiat; SELL means selling crypto for fiat
 * @param {string} options.fiat - Currency code, default 'LKR'
 * @param {string} options.asset - Crypto asset, default 'USDT'
 * @param {Array<string>} options.payTypes - Optional payment method identifiers
 * @param {number|null} options.transAmount - User specified order limit amount in fiat (LKR)
 * @param {number} options.rows - Number of ads to return (default 10)
 * @param {number} options.page - Page number (default 1)
 * @returns {Promise<{success: boolean, data: Array, total: number, error?: string}>}
 */
async function fetchP2PAds(options = {}) {
  const {
    tradeType = 'BUY',
    fiat = 'LKR',
    asset = 'USDT',
    payTypes = [],
    transAmount = null,
    rows = 10,
    page = 1
  } = options;

  const payload = {
    page,
    rows,
    payTypes: Array.isArray(payTypes) ? payTypes : [],
    asset,
    tradeType,
    fiat,
    publisherType: null,
    filterType: 'all',
    transAmount: transAmount && parseFloat(transAmount) > 0 ? parseFloat(transAmount) : null
  };

  let lastError = null;

  // Try endpoints sequentially with fallback
  for (const url of BINANCE_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Clienttype': 'web'
        },
        body: JSON.stringify(payload)
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = new Error(`HTTP ${response.status} from ${url}`);
        // Surface Retry-After so the caller can back off for at least that long.
        const retryAfter = response.headers.get('Retry-After');
        if (response.status === 429 && retryAfter) {
          err.retryAfterSeconds = parseInt(retryAfter, 10) || null;
        }
        throw err;
      }

      const result = await response.json();

      if (result.code !== '000000' || !Array.isArray(result.data)) {
        throw new Error(result.message || 'Invalid payload received from Binance API');
      }

      const formattedAds = result.data.map(item => {
        const adv = item.adv || {};
        const advertiser = item.advertiser || {};
        const rawMethods = (adv.tradeMethods || []).map(m => (m.tradeMethodName || m.identifier || '').trim());
        const tradeMethods = [];
        const seenBases = new Set();

        rawMethods.forEach(name => {
          if (!name) return;
          const baseName = name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
          if (!seenBases.has(baseName) && !seenBases.has(name.toLowerCase())) {
            seenBases.add(baseName);
            seenBases.add(name.toLowerCase());
            tradeMethods.push(name);
          }
        });

        return {
          advNo: adv.advNo,
          price: parseFloat(adv.price || 0),
          priceFormatted: parseFloat(adv.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          nickName: advertiser.nickName || 'Anonymous Merchant',
          userType: advertiser.userType || 'merchant',
          isVerified: advertiser.userType === 'merchant' || advertiser.userType === 'block_merchant' || advertiser.proMerchant === true,
          monthOrderCount: advertiser.monthOrderCount || 0,
          monthFinishRate: Math.round((advertiser.monthFinishRate || 0) * 100),
          surplusAmount: parseFloat(adv.surplusAmount || 0),
          asset: adv.asset || asset,
          fiatUnit: adv.fiatUnit || fiat,
          minAmount: parseFloat(adv.minSingleTransAmount || 0),
          maxAmount: parseFloat(adv.maxSingleTransAmount || 0),
          paymentMethods: tradeMethods,
          advertiserNo: advertiser.userNo,
          tradeUrl: `https://p2p.binance.com/en/advertiserDetail?advertiserNo=${advertiser.userNo}`
        };
      });

      return {
        success: true,
        data: formattedAds,
        total: result.total || formattedAds.length,
        timestamp: Date.now()
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        err = new Error(`Request to ${url} timed out after 15s`);
      }
      console.warn(`[Binance P2P Endpoint Fallback] ${url} failed:`, err.message);
      lastError = err;
    }
  }

  return {
    success: false,
    data: [],
    error: lastError ? lastError.message : 'All Binance P2P endpoints failed to respond',
    retryAfterSeconds: lastError ? (lastError.retryAfterSeconds || null) : null
  };
}

/**
 * Fetch combined market summary for both Buy and Sell best rates
 * @param {string} fiat 
 * @param {string} asset 
 * @param {number|null} transAmount
 */
async function fetchP2PSummary(fiat = 'LKR', asset = 'USDT', transAmount = null) {
  const [buyRes, sellRes] = await Promise.all([
    fetchP2PAds({ tradeType: 'BUY', fiat, asset, transAmount, rows: 10 }),
    fetchP2PAds({ tradeType: 'SELL', fiat, asset, transAmount, rows: 10 })
  ]);

  if (!buyRes.success && !sellRes.success) {
    return {
      success: false,
      error: buyRes.error || sellRes.error || 'Network error fetching Binance P2P rates',
      retryAfterSeconds: buyRes.retryAfterSeconds || sellRes.retryAfterSeconds || null
    };
  }

  const bestBuy = buyRes.data.length > 0 ? buyRes.data[0].price : null;
  const bestSell = sellRes.data.length > 0 ? sellRes.data[0].price : null;

  // Calculate market spread
  let spreadLkr = 0;
  let spreadPercent = 0;
  if (bestBuy && bestSell) {
    spreadLkr = bestSell - bestBuy;
    spreadPercent = ((spreadLkr / bestBuy) * 100).toFixed(2);
  }

  return {
    success: true,
    fiat,
    asset,
    transAmount,
    bestBuy,
    bestSell,
    spreadLkr: spreadLkr.toFixed(2),
    spreadPercent,
    buyAds: buyRes.data.length > 0 ? buyRes.data : (sellRes.data || []),
    sellAds: sellRes.data.length > 0 ? sellRes.data : (buyRes.data || []),
    timestamp: Date.now()
  };
}

// Export for module or global window use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fetchP2PAds, fetchP2PSummary };
}
