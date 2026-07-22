/**
 * Binance P2P Rate Tracker - Service Worker
 */

importScripts('binance-api.js');

const ALARM_NAME = 'BINANCE_P2P_REFRESH_ALARM';
const REFRESH_INTERVAL_MINUTES = 2;

// Set up alarm on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Binance P2P Tracker] Extension installed.');
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
  refreshP2PRates();
});

// Refresh rates when alarm triggers
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshP2PRates();
  }
});

// Fetch rates & update extension badge
async function refreshP2PRates() {
  try {
    const summary = await fetchP2PSummary('LKR', 'USDT');
    if (summary.success && summary.bestBuy) {
      const displayRate = summary.bestBuy.toFixed(1);
      
      // Update Toolbar Badge
      chrome.action.setBadgeText({ text: displayRate });
      chrome.action.setBadgeBackgroundColor({ color: '#F0B90B' }); // Binance Yellow
      chrome.action.setBadgeTextColor({ color: '#000000' });

      // Save to local storage cache
      chrome.storage.local.set({
        cachedSummary: summary,
        lastFetchTime: Date.now()
      });
    } else {
      chrome.action.setBadgeText({ text: 'ERR' });
      chrome.action.setBadgeBackgroundColor({ color: '#E53E3E' });
    }
  } catch (err) {
    console.error('[Background Refresh Error]', err);
  }
}

// Handle message requests from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_RATES') {
    fetchP2PSummary(request.fiat || 'LKR', request.asset || 'USDT', request.transAmount || null)
      .then(summary => {
        if (summary.success && summary.bestBuy) {
          chrome.action.setBadgeText({ text: summary.bestBuy.toFixed(1) });
          chrome.action.setBadgeBackgroundColor({ color: '#F0B90B' });
          chrome.action.setBadgeTextColor({ color: '#000000' });
          chrome.storage.local.set({ cachedSummary: summary, lastFetchTime: Date.now() });
        }
        sendResponse(summary);
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep response channel open for async promise
  }

  if (request.action === 'GET_CACHED_RATES') {
    chrome.storage.local.get(['cachedSummary', 'lastFetchTime'], (data) => {
      sendResponse(data);
    });
    return true;
  }
});
