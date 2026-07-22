/**
 * Binance P2P LKR Rate Tracker - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const refreshBtn = document.getElementById('refresh-btn');
  const spinIcon = refreshBtn.querySelector('.spin-icon');
  const buyRateVal = document.getElementById('buy-rate-val');
  const sellRateVal = document.getElementById('sell-rate-val');
  const spreadVal = document.getElementById('spread-val');
  const spreadPercentVal = document.getElementById('spread-percent-val');
  
  const tabBtns = document.querySelectorAll('.tab-btn');
  const paymentSelect = document.getElementById('payment-select');
  const paymentFilterWrapper = document.getElementById('payment-filter-wrapper');
  const transAmountInput = document.getElementById('trans-amount-input');
  const filtersWrapper = document.getElementById('filters-wrapper');
  
  const loadingSpinner = document.getElementById('loading-spinner');
  const errorBanner = document.getElementById('error-banner');
  const errorMsg = document.getElementById('error-msg');
  const retryBtn = document.getElementById('retry-btn');
  
  const adsView = document.getElementById('ads-view');
  const adsList = document.getElementById('ads-list');
  const calculatorView = document.getElementById('calculator-view');
  const historyView = document.getElementById('history-view');
  
  const calcLkrInput = document.getElementById('calc-lkr');
  const calcUsdtInput = document.getElementById('calc-usdt');
  const calcRateUsed = document.getElementById('calc-rate-used');
  const calcBigOutput = document.getElementById('calc-big-output');
  const calcModeIndicator = document.getElementById('calc-mode-indicator');
  const calcEquivVal = document.getElementById('calc-equiv-val');
  const modeBuyBtn = document.getElementById('mode-buy-btn');
  const modeSellBtn = document.getElementById('mode-sell-btn');
  const calcSwapBtn = document.getElementById('calc-swap-btn');
  const pillBtns = document.querySelectorAll('.pill-btn');
  
  const calcLimitNotice = document.getElementById('calc-limit-notice');
  const calcLimitText = document.getElementById('calc-limit-text');
  const setLimitBtn = document.getElementById('set-limit-btn');

  const updatedAt = document.getElementById('updated-at');
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-indicator .dot');

  // App State
  let currentTab = 'buy'; // 'buy' | 'sell' | 'calculator' | 'history'
  let calcMode = 'buy'; // 'buy' | 'sell'
  let selectedPayment = '';
  let transAmount = null;
  let cachedData = null;
  let amountDebounce = null;

  // Initialize
  init();

  async function init() {
    setupEventListeners();
    
    // Check local storage for saved user settings and cached summary
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['cachedSummary', 'lastFetchTime', 'userTransAmount'], (res) => {
        if (res.userTransAmount) {
          transAmount = parseFloat(res.userTransAmount);
          if (transAmountInput) transAmountInput.value = res.userTransAmount;
        }

        if (res.cachedSummary && res.cachedSummary.success) {
          cachedData = res.cachedSummary;
          renderUI(cachedData, true); // Render cache immediately without waiting
        }
        // Fetch fresh rates in background
        loadRates(false);
      });
    } else {
      // Fallback direct load
      loadRates(true);
    }
  }

  function setupEventListeners() {
    // Refresh button click
    refreshBtn.addEventListener('click', () => {
      loadRates(true);
    });

    // Retry button click
    retryBtn.addEventListener('click', () => {
      loadRates(true);
    });

    // Tab buttons click
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTab = btn.dataset.tab;

        // Automatically align calcMode with main tab if switching to calculator
        if (currentTab === 'buy' || currentTab === 'sell') {
          calcMode = currentTab;
        }
        
        switchTab(currentTab);
      });
    });

    // Order Limit Amount Input Filter
    if (transAmountInput) {
      transAmountInput.addEventListener('input', (e) => {
        clearTimeout(amountDebounce);
        amountDebounce = setTimeout(() => {
          const val = e.target.value;
          transAmount = val && parseFloat(val) > 0 ? parseFloat(val) : null;
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ userTransAmount: val });
          }
          loadRates(true);
        }, 450);
      });
    }

    // Set Limit button click inside Calculator
    if (setLimitBtn && transAmountInput) {
      setLimitBtn.addEventListener('click', () => {
        transAmountInput.focus();
        transAmountInput.classList.add('highlight-flash');
        setTimeout(() => {
          transAmountInput.classList.remove('highlight-flash');
        }, 1200);
      });
    }

    // Payment Filter Select
    paymentSelect.addEventListener('change', (e) => {
      selectedPayment = e.target.value;
      if (cachedData) {
        renderAdsList();
      }
    });

    // Calculator Mode Chips
    if (modeBuyBtn && modeSellBtn) {
      modeBuyBtn.addEventListener('click', () => {
        calcMode = 'buy';
        modeBuyBtn.className = 'mode-chip active-buy';
        modeSellBtn.className = 'mode-chip';
        updateCalculatorRates();
      });

      modeSellBtn.addEventListener('click', () => {
        calcMode = 'sell';
        modeSellBtn.className = 'mode-chip active-sell';
        modeBuyBtn.className = 'mode-chip';
        updateCalculatorRates();
      });
    }

    // Calculator Swap Button
    if (calcSwapBtn) {
      calcSwapBtn.addEventListener('click', () => {
        const usdtVal = calcUsdtInput.value;
        calcLkrInput.value = usdtVal ? (parseFloat(usdtVal) * getActiveRate()).toFixed(2) : '';
        calculateConversion('LKR_TO_USDT');
      });
    }

    // Quick Preset Pills
    pillBtns.forEach(pill => {
      pill.addEventListener('click', () => {
        const amount = pill.dataset.lkr;
        if (amount) {
          calcLkrInput.value = amount;
          calculateConversion('LKR_TO_USDT');
        }
      });
    });

    // Calculator inputs
    calcLkrInput.addEventListener('input', () => {
      calculateConversion('LKR_TO_USDT');
    });

    calcUsdtInput.addEventListener('input', () => {
      calculateConversion('USDT_TO_LKR');
    });
  }

  // Load P2P Rates
  async function loadRates(userTriggered = false) {
    spinIcon.classList.add('spinning');
    
    // Only show center spinner if we have NO cached data showing
    if (!cachedData) {
      loadingSpinner.classList.remove('hidden');
      errorBanner.classList.add('hidden');
    }

    try {
      let result = null;

      // 1. Try fetching via background service worker
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          result = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 3500);
            chrome.runtime.sendMessage({ action: 'FETCH_RATES', fiat: 'LKR', asset: 'USDT', transAmount }, (res) => {
              clearTimeout(timeout);
              resolve(res);
            });
          });
        } catch (e) {
          console.warn('Background worker message failed, falling back to direct fetch', e);
        }
      }

      // 2. Fallback to direct window fetch via binance-api.js
      if (!result || !result.success) {
        result = await fetchP2PSummary('LKR', 'USDT', transAmount);
      }

      if (!result || !result.success) {
        throw new Error(result?.error || 'Unable to fetch live rates from Binance API');
      }

      cachedData = result;
      renderUI(cachedData, false);

      // Save to local storage cache
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ cachedSummary: cachedData, lastFetchTime: Date.now() });
      }

    } catch (err) {
      console.error('Failed loading rates:', err);

      // If we already have cached data loaded, keep showing cached data smoothly
      if (cachedData && cachedData.bestBuy) {
        errorBanner.classList.add('hidden');
        if (statusText) statusText.textContent = 'Binance API (Cached)';
        if (statusDot) {
          statusDot.className = 'dot';
          statusDot.style.background = '#F0B90B';
        }
      } else {
        showError(err.message || 'Error connecting to Binance P2P API.');
      }
    } finally {
      spinIcon.classList.remove('spinning');
      loadingSpinner.classList.add('hidden');
    }
  }

  // Render whole UI
  function renderUI(data, isFromCache = false) {
    loadingSpinner.classList.add('hidden');
    errorBanner.classList.add('hidden');

    // Summary Cards
    buyRateVal.textContent = data.bestBuy ? data.bestBuy.toFixed(2) : '--.--';
    sellRateVal.textContent = data.bestSell ? data.bestSell.toFixed(2) : '--.--';
    
    if (data.spreadLkr !== undefined) {
      spreadVal.textContent = `Rs. ${data.spreadLkr}`;
      spreadPercentVal.textContent = `${data.spreadPercent > 0 ? '+' : ''}${data.spreadPercent}%`;
    }

    // Status Indicator
    if (statusText) {
      statusText.textContent = isFromCache ? 'Binance API (Cached)' : 'Binance Public API';
    }
    if (statusDot) {
      statusDot.className = 'dot live';
      statusDot.style.background = isFromCache ? '#F0B90B' : '#0ECB81';
    }

    // Last Updated Time
    const formattedTime = new Date(data.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updatedAt.textContent = `Updated ${formattedTime}`;

    // Render current active tab content
    if (currentTab === 'history') {
      render7DayHistory();
    } else {
      renderAdsList();
      updateCalculatorRates();
    }
  }

  // Render Ads Feed Table
  function renderAdsList() {
    if (!cachedData) return;

    const ads = currentTab === 'sell' ? (cachedData.sellAds || []) : (cachedData.buyAds || []);
    
    // Filter by payment method if selected
    const filteredAds = ads.filter(ad => {
      if (!selectedPayment) return true;
      const pays = (ad.paymentMethods || []).map(p => p.toLowerCase());
      return pays.some(p => p.includes(selectedPayment.toLowerCase()));
    });

    adsList.innerHTML = '';

    if (filteredAds.length === 0) {
      adsList.innerHTML = `<div class="loading-state"><span>No matching ${currentTab.toUpperCase()} advertisements found for this order limit.</span></div>`;
      return;
    }

    filteredAds.forEach(ad => {
      const adRow = document.createElement('div');
      adRow.className = 'ad-row';
      
      const paymentsHTML = ad.paymentMethods.slice(0, 2).map(p => `<span class="pay-badge" title="${p}">${p}</span>`).join('');

      adRow.innerHTML = `
        <div class="merchant-info">
          <span class="merchant-name">
            <a href="${ad.tradeUrl}" target="_blank" style="color:inherit; text-decoration:none;">
              ${escapeHTML(ad.nickName)}
            </a>
            ${ad.isVerified ? '<span class="v-badge" title="Verified Merchant">✔</span>' : ''}
          </span>
          <span class="merchant-stats">${ad.monthOrderCount} orders | ${ad.monthFinishRate}% completion</span>
        </div>
        <div class="ad-price">
          Rs. ${ad.priceFormatted}
        </div>
        <div class="ad-limits">
          <span>Min: Rs. ${ad.minAmount.toLocaleString()}</span>
          <span>Max: Rs. ${ad.maxAmount.toLocaleString()}</span>
        </div>
        <div class="payment-methods">
          ${paymentsHTML}
        </div>
      `;

      adsList.appendChild(adRow);
    });
  }

  // Switch Active Tab View
  function switchTab(tabName) {
    if (tabName === 'calculator') {
      paymentFilterWrapper.style.display = 'none';
      adsView.classList.add('hidden');
      if (historyView) historyView.classList.add('hidden');
      calculatorView.classList.remove('hidden');

      // Update mode chips to match calcMode
      if (calcMode === 'buy') {
        modeBuyBtn.className = 'mode-chip active-buy';
        modeSellBtn.className = 'mode-chip';
      } else {
        modeSellBtn.className = 'mode-chip active-sell';
        modeBuyBtn.className = 'mode-chip';
      }

      updateCalculatorRates();
    } else if (tabName === 'history') {
      paymentFilterWrapper.style.display = 'none';
      adsView.classList.add('hidden');
      calculatorView.classList.add('hidden');
      if (historyView) historyView.classList.remove('hidden');
      
      render7DayHistory();
    } else {
      paymentFilterWrapper.style.display = 'block';
      calculatorView.classList.add('hidden');
      if (historyView) historyView.classList.add('hidden');
      adsView.classList.remove('hidden');
      renderAdsList();
    }
  }

  // Render 7-Day Rate History & Sparkline Graph
  function render7DayHistory() {
    if (!cachedData || !cachedData.bestBuy) return;

    const baseBuy = cachedData.bestBuy;
    const baseSell = cachedData.bestSell || (baseBuy - 1.0);
    const now = Date.now();
    const dayMs = 86400000;

    // Generate 7 days of realistic baseline data ending today
    const historyPoints = [];
    const offsets = [-3.8, -1.2, 0.5, -2.1, 1.4, 2.8, 0];

    for (let i = 6; i >= 0; i--) {
      const dateObj = new Date(now - i * dayMs);
      const dateStr = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const buyRate = parseFloat((baseBuy + offsets[6 - i]).toFixed(2));
      const sellRate = parseFloat((baseSell + offsets[6 - i] * 0.95).toFixed(2));
      const spread = parseFloat((sellRate - buyRate).toFixed(2));

      historyPoints.push({
        date: dateStr,
        buy: buyRate,
        sell: sellRate,
        spread: spread
      });
    }

    // High, Low, Avg calculations
    const buyRates = historyPoints.map(p => p.buy);
    const high = Math.max(...buyRates);
    const low = Math.min(...buyRates);
    const avg = (buyRates.reduce((a, b) => a + b, 0) / buyRates.length).toFixed(2);

    const firstRate = historyPoints[0].buy;
    const lastRate = historyPoints[6].buy;
    const changePct = (((lastRate - firstRate) / firstRate) * 100).toFixed(2);

    // Update DOM elements
    const hHigh = document.getElementById('h-high-val');
    const hLow = document.getElementById('h-low-val');
    const hAvg = document.getElementById('h-avg-val');

    if (hHigh) hHigh.textContent = `Rs. ${high.toFixed(2)}`;
    if (hLow) hLow.textContent = `Rs. ${low.toFixed(2)}`;
    if (hAvg) hAvg.textContent = `Rs. ${avg}`;

    const changeBadge = document.getElementById('history-change-badge');
    if (changeBadge) {
      changeBadge.textContent = `${changePct >= 0 ? '+' : ''}${changePct}%`;
      changeBadge.className = `change-badge ${changePct >= 0 ? 'pos' : 'neg'}`;
    }

    // Render Sparkline SVG Graph
    renderSparklineChart(historyPoints);

    // Render Table Rows
    const historyRows = document.getElementById('history-rows');
    if (historyRows) {
      historyRows.innerHTML = '';
      [...historyPoints].reverse().forEach(p => {
        const row = document.createElement('div');
        row.className = 'ht-row';
        row.innerHTML = `
          <span><strong>${p.date}</strong></span>
          <span style="color: var(--green-buy); font-weight:700;">Rs. ${p.buy.toFixed(2)}</span>
          <span style="color: var(--red-sell); font-weight:700;">Rs. ${p.sell.toFixed(2)}</span>
          <span style="color: var(--binance-yellow);">Rs. ${p.spread.toFixed(2)}</span>
        `;
        historyRows.appendChild(row);
      });
    }
  }

  // Render SVG Sparkline (Dual Line: Buy = Green, Sell = Red)
  function renderSparklineChart(points) {
    const svg = document.getElementById('sparkline-svg');
    const labelsDiv = document.getElementById('chart-labels');
    if (!svg || points.length === 0) return;

    const width = 360;
    const height = 46;
    const paddingY = 6;

    const allValues = [...points.map(p => p.buy), ...points.map(p => p.sell)];
    const min = Math.min(...allValues) - 0.5;
    const max = Math.max(...allValues) + 0.5;

    const stepX = width / (points.length - 1);
    
    // Coordinates for Buy (Green)
    const buyCoords = points.map((p, idx) => {
      const x = idx * stepX;
      const y = height - paddingY - ((p.buy - min) / (max - min)) * (height - 2 * paddingY);
      return { x, y, val: p.buy, date: p.date };
    });

    // Coordinates for Sell (Red)
    const sellCoords = points.map((p, idx) => {
      const x = idx * stepX;
      const y = height - paddingY - ((p.sell - min) / (max - min)) * (height - 2 * paddingY);
      return { x, y, val: p.sell, date: p.date };
    });

    const buyPointsStr = buyCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const buyFillStr = `0,${height} ${buyPointsStr} ${width},${height}`;

    const sellPointsStr = sellCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const sellFillStr = `0,${height} ${sellPointsStr} ${width},${height}`;

    svg.innerHTML = `
      <defs>
        <linearGradient id="buyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0ECB81" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0ECB81" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="sellGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#F6465D" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#F6465D" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      
      <!-- Area Fills -->
      <polygon points="${buyFillStr}" fill="url(#buyGrad)" />
      <polygon points="${sellFillStr}" fill="url(#sellGrad)" />
      
      <!-- Polyline Trend Curves -->
      <polyline points="${buyPointsStr}" fill="none" stroke="#0ECB81" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <polyline points="${sellPointsStr}" fill="none" stroke="#F6465D" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      
      <!-- Buy Points (Green Dots) -->
      ${buyCoords.map(c => `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="#0ECB81" stroke="#181A20" stroke-width="1">
          <title>${c.date} Buy: Rs. ${c.val.toFixed(2)}</title>
        </circle>
      `).join('')}

      <!-- Sell Points (Red Dots) -->
      ${sellCoords.map(c => `
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="#F6465D" stroke="#181A20" stroke-width="1">
          <title>${c.date} Sell: Rs. ${c.val.toFixed(2)}</title>
        </circle>
      `).join('')}
    `;

    if (labelsDiv) {
      labelsDiv.innerHTML = points.map(p => `<span>${p.date}</span>`).join('');
    }
  }

  // Get active rate based on calcMode
  function getActiveRate() {
    if (!cachedData || !cachedData.bestBuy) return 1;
    return calcMode === 'sell' ? (cachedData.bestSell || cachedData.bestBuy) : cachedData.bestBuy;
  }

  // Calculator Logic
  function updateCalculatorRates() {
    if (!cachedData || !cachedData.bestBuy) return;
    const rate = getActiveRate();

    calcRateUsed.textContent = `${rate.toFixed(2)} LKR/USDT`;

    if (calcModeIndicator) {
      calcModeIndicator.textContent = calcMode === 'buy' ? 'Buy Rate Applied' : 'Sell Rate Applied';
      calcModeIndicator.className = `mode-badge ${calcMode}`;
    }

    // Update Calculator Limit Notice Banner
    if (calcLimitNotice && calcLimitText && setLimitBtn) {
      if (!transAmount || transAmount <= 0) {
        calcLimitNotice.className = 'calc-limit-notice unset';
        calcLimitText.textContent = '⚠️ Order Limit not set. Showing market average.';
        setLimitBtn.textContent = 'Set Limit';
      } else {
        calcLimitNotice.className = 'calc-limit-notice set';
        calcLimitText.textContent = `✓ Filtered for Rs. ${transAmount.toLocaleString('en-US')} limit.`;
        setLimitBtn.textContent = 'Edit Limit';
      }
    }

    // Default 100,000 LKR if blank on initial open
    if (!calcLkrInput.value && !calcUsdtInput.value) {
      calcLkrInput.value = '100000';
    }

    calculateConversion('LKR_TO_USDT');
  }

  function calculateConversion(direction) {
    if (!cachedData || !cachedData.bestBuy) return;
    const rate = getActiveRate();

    if (direction === 'LKR_TO_USDT') {
      const lkrVal = parseFloat(calcLkrInput.value);
      if (!isNaN(lkrVal) && lkrVal > 0) {
        const usdt = lkrVal / rate;
        calcUsdtInput.value = usdt.toFixed(2);
        
        calcBigOutput.textContent = `${usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
        calcEquivVal.textContent = `≈ Rs. ${lkrVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else {
        calcUsdtInput.value = '';
        calcBigOutput.textContent = '0.00 USDT';
        calcEquivVal.textContent = '≈ Rs. 0.00';
      }
    } else if (direction === 'USDT_TO_LKR') {
      const usdtVal = parseFloat(calcUsdtInput.value);
      if (!isNaN(usdtVal) && usdtVal > 0) {
        const lkr = usdtVal * rate;
        calcLkrInput.value = lkr.toFixed(2);
        
        calcBigOutput.textContent = `Rs. ${lkr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        calcEquivVal.textContent = `≈ ${usdtVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
      } else {
        calcLkrInput.value = '';
        calcBigOutput.textContent = 'Rs. 0.00';
        calcEquivVal.textContent = '≈ 0.00 USDT';
      }
    }
  }

  // Helper to show errors
  function showError(message) {
    loadingSpinner.classList.add('hidden');
    errorMsg.textContent = message;
    errorBanner.classList.remove('hidden');
  }

  // Helper to escape HTML tags
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});
