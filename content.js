(function() {
  'use strict';

  const STORAGE_KEY = 'railwayBookingPrefs';
  const PASSENGER_KEY = 'railwayPassengers';

  function isSearchPage() {
    const url = window.location.href;
    return url.includes('eticket.railway.gov.bd') && url.includes('/booking/train/search');
  }

  function isPassengerPage() {
    const url = window.location.href;
    return url.includes('eticket.railway.gov.bd') && (
      url.includes('/passenger') || url.includes('/booking/passenger')
    );
  }

  function waitForElement(selectors, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) return resolve(el);
        }
        if (Date.now() - start > timeout) {
          reject(new Error(`Element not found: ${selectors.join(', ')}`));
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function clickElement(element) {
    if (!element) return false;
    element.scrollIntoView({ behavior: 'auto', block: 'center' });
    setTimeout(() => {
      const r = element.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true, view: window,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      element.focus && element.focus();
      element.dispatchEvent(new PointerEvent('pointerdown', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new PointerEvent('pointerup', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.click();
    }, 150);
    return true;
  }

  function setValue(element, value) {
    if (!element) return false;
    try {
      if (element.tagName === 'SELECT') {
        const option = Array.from(element.options).find(opt =>
          opt.value === value ||
          opt.textContent.trim().toLowerCase() === value.toLowerCase() ||
          opt.textContent.trim().toLowerCase().includes(value.toLowerCase()) ||
          opt.value.toLowerCase().includes(value.toLowerCase())
        );
        if (option) {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(element, option.value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    } catch (error) {
      console.warn('[Railway Assistant] Failed to set value:', error);
      return false;
    }
  }

  function showNotification(message, type = 'success') {
    const existing = document.getElementById('railway-assistant-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'railway-assistant-notification';
    const bgColor = type === 'error' ? '#c62828' : '#2e7d32';
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 10000;
      background: ${bgColor}; color: white; padding: 12px 20px;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: system-ui; font-size: 13px; max-width: 350px;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  window.selectTrainAndBook = async function(data) {
    if (!isSearchPage()) {
      showNotification('Not on train search page', 'error');
      return;
    }

    try {
      let cards;
      try {
        await waitForElement(['app-single-trip .single-trip-wrapper'], 15000);
        cards = Array.from(document.querySelectorAll('app-single-trip'));
      } catch (e) {
        showNotification('No train results found', 'error');
        return;
      }

      const trainName = (card) =>
        (card.querySelector('.trip-name h2')?.textContent || '').trim();
      const seatClassOf = (el) =>
        (el.querySelector('.seat-class-name')?.textContent || '').trim().toUpperCase();
      const bookBtnOf = (el) => el.querySelector('.book-now-btn');
      // Seat classes in priority order (1st choice first)
      const wanted = (data.seatClasses?.length ? data.seatClasses : [data.seatClass])
        .map(x => (x || '').trim().toUpperCase()).filter(Boolean);
      const blocksOf = (card) => Array.from(card.querySelectorAll('.single-seat-class'));
      // First class in priority order that this train still sells (no class preference: any)
      const pickBlock = (card) => {
        const blocks = blocksOf(card);
        if (!wanted.length) return blocks.find(bookBtnOf);
        for (const cls of wanted) {
          const b = blocks.find(s => seatClassOf(s) === cls && bookBtnOf(s));
          if (b) return b;
        }
        return null;
      };

      let targetTrain = null;
      if (data.filter) {
        const f = data.filter.toLowerCase();
        targetTrain = cards.find(c => c.textContent.toLowerCase().includes(f));
      } else if (data.index !== null && data.index !== undefined && data.index < cards.length) {
        targetTrain = cards[data.index];
      } else {
        // Best class wins: look for a train with the 1st choice, then the 2nd, ...
        targetTrain = (wanted.length ? wanted : [null]).map(cls =>
          cards.find(c => blocksOf(c).some(s => bookBtnOf(s) && (!cls || seatClassOf(s) === cls)))
        ).find(Boolean);
      }

      if (!targetTrain) {
        showNotification(`No train has seats in ${wanted.join(' / ') || 'any class'}`, 'error');
        return;
      }

      const name = trainName(targetTrain);
      const seatBlock = pickBlock(targetTrain);
      const bookButton = seatBlock && bookBtnOf(seatBlock);
      if (!bookButton) {
        const have = blocksOf(targetTrain)
          .map(s => `${seatClassOf(s)}: ${s.querySelector('.all-seats')?.textContent.trim() ?? '0'}`).join(', ');
        showNotification(`${name}: no seats in ${wanted.join(' / ')} (${have})`, 'error');
        return;
      }

      // Expand the card first if the button is hidden inside a collapsed section
      if (!isVisible(bookButton)) {
        const toggle = targetTrain.querySelector('.trip-collapse-btn');
        if (toggle) {
          toggle.click();
          await new Promise(r => setTimeout(r, 600));
        }
      }

      console.log('[Railway Assistant] Clicking', bookButton, 'visible:', isVisible(bookButton));
      showNotification(`Booking ${name} - ${seatClassOf(seatBlock)}`);
      clickElement(bookButton);

      await selectSeatsAndContinue(data.seatCount);

    } catch (error) {
      console.error('[Railway Assistant] selectTrainAndBook error:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function waitUntil(fn, timeout = 8000, interval = 150) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(interval);
    }
    return null;
  }

  // Coaches with seats, most seats first. Option text looks like "JA - 18 Seat(s)"
  function coachesWithSeats(select) {
    return Array.from(select.options)
      .map(o => {
        const m = o.textContent.trim().match(/^(.*?)\s*-\s*(\d+)\s*Seat/i);
        return m ? { value: o.value, name: m[1].trim(), seats: parseInt(m[2], 10) } : null;
      })
      .filter(c => c && c.seats > 0)
      .sort((a, b) => b.seats - a.seats);
  }

  const isSeatFree = (btn) =>
    !btn.disabled && !btn.classList.contains('seat-hidden') &&
    !btn.classList.contains('seat-booked') && !btn.classList.contains('seat-progress') &&
    !btn.classList.contains('seat-selected');

  function freeSeats(coachName) {
    return Array.from(document.querySelectorAll('app-seat-layout button.btn-seat'))
      .filter(b => b.title.startsWith(coachName + '-') && isSeatFree(b));
  }

  const allSeats = (coachName) =>
    Array.from(document.querySelectorAll('app-seat-layout button.btn-seat'))
      .filter(b => b.title.startsWith(coachName + '-'));

  const seatNo = (btn) => parseInt(btn.title.slice(btn.title.lastIndexOf('-') + 1), 10) || 0;

  // Lower rank = better. Tiers: 35..15, then 46..70, then other middle seats, terminal seats last.
  // The ranges are defined for an 80-seat coach and scaled to the real coach size
  // (e.g. 100 seats -> 19..44 and 58..87).
  function seatRank(n, size) {
    const s = Math.max(size || 80, 1) / 80;
    const first = [Math.ceil(15 * s), Math.floor(35 * s)];
    const second = [Math.ceil(46 * s), Math.floor(70 * s)];
    const edge = Math.max(1, Math.round(6 * s)); // first/last seats of a coach
    if (n >= first[0] && n <= first[1]) return first[1] - n;          // high -> low
    if (n >= second[0] && n <= second[1]) return 1000 + (n - second[0]); // low -> high
    if (n <= edge || n > size - edge) return 3000 + n;                // terminal, last resort
    return 2000 + n;
  }

  // Pick `want` free seats in one coach: seats 2-3 together in one row (adjacent first),
  // otherwise / as a fallback the best-ranked seats.
  function chooseSeats(coachName, size, want) {
    const rankOf = (b) => seatRank(seatNo(b), size);
    const byRank = (list) => list.slice().sort((x, y) => rankOf(x) - rankOf(y));
    const sum = (list) => list.reduce((t, b) => t + rankOf(b), 0);
    const free = freeSeats(coachName);
    if (want >= 2 && want <= 3) {
      let bestPick = null;
      const consider = (tier, list) => {
        const key = [tier, sum(list)];
        if (!bestPick || key[0] < bestPick.key[0] || (key[0] === bestPick.key[0] && key[1] < bestPick.key[1])) {
          bestPick = { key, list };
        }
      };
      const rows = new Map();
      for (const b of allSeats(coachName)) {
        const row = b.closest('.seat-row');
        if (row) (rows.get(row) || rows.set(row, []).get(row)).push(b);
      }
      for (const seats of rows.values()) {
        // adjacent seats on one side of the aisle
        const groups = new Map();
        for (const b of seats) {
          const g = b.closest('.seat-in-row');
          (groups.get(g) || groups.set(g, []).get(g)).push(b);
        }
        for (const g of groups.values()) {
          for (let i = 0; i + want <= g.length; i++) {
            const win = g.slice(i, i + want);
            if (win.every(isSeatFree)) consider(0, win);
          }
        }
        const rowFree = seats.filter(isSeatFree);
        if (rowFree.length >= want) consider(1, byRank(rowFree).slice(0, want));
      }
      if (bestPick) return bestPick.list.map(b => b.title);
    }
    return byRank(free).slice(0, want).map(b => b.title);
  }

  async function selectSeatsAndContinue(seatCount) {
    const select = await waitUntil(() => {
      const s = document.querySelector('app-seat-layout #select-bogie');
      return s && s.options.length ? s : null;
    }, 15000);
    if (!select) {
      showNotification('Seat layout did not load', 'error');
      return;
    }

    // Site allows max 4 seats per booking
    const wanted = Math.min(Math.max(parseInt(seatCount, 10) || 1, 1), 4);
    const coaches = coachesWithSeats(select);
    if (!coaches.length) {
      showNotification('No coach has available seats', 'error');
      return;
    }

    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    const showCoach = async (c) => {
      setter.call(select, c.value);
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const ok = await waitUntil(() => freeSeats(c.name).length > 0);
      if (ok) await sleep(300);
      return !!ok;
    };

    // Look at every coach: most free seats wins, a bigger coach breaks ties
    let best = null;
    for (const c of coaches) {
      if (!await showCoach(c)) continue;
      const size = Math.max(0, ...allSeats(c.name).map(seatNo));
      const titles = chooseSeats(c.name, size, wanted);
      if (!titles.length) continue;
      if (!best || c.seats > best.coach.seats || (c.seats === best.coach.seats && size > best.size)) {
        best = { coach: c, size, titles };
      }
    }
    if (!best) {
      showNotification('No coach has a free seat', 'error');
      return;
    }

    const coach = best.coach;
    const count = best.titles.length;
    if (!await showCoach(coach)) {
      showNotification(`Coach ${coach.name}: no free seat found`, 'error');
      return;
    }

    let picked = 0;
    const chosen = [];
    const pickList = best.titles
      .map(t => freeSeats(coach.name).find(b => b.title === t))
      .filter(Boolean);
    for (const seat of pickList) {
      if (picked >= count) break;
      seat.scrollIntoView({ behavior: 'auto', block: 'center' });
      await sleep(150);
      seat.click();
      // Site books each seat server-side; wait for it to leave the "free" state
      const ok = await waitUntil(() => !isSeatFree(seat), 5000);
      if (ok) {
        picked++;
        chosen.push(seat.title);
      }
      await sleep(300);
    }

    if (!picked) {
      showNotification(`Coach ${coach.name}: could not select a seat`, 'error');
      return;
    }

    const cont = document.querySelector('app-seat-layout .continue-btn');
    if (!cont) {
      showNotification('CONTINUE PURCHASE button not found', 'error');
      return;
    }
    const autoContinue = await new Promise(resolve => {
      try {
        chrome.storage.local.get('autoContinue', r => resolve(r?.autoContinue === true));
      } catch (e) {
        resolve(false);
      }
    });
    if (!autoContinue) {
      showNotification(`Selected ${chosen.join(', ')} - click CONTINUE PURCHASE yourself`);
      return;
    }
    showNotification(`Selected ${chosen.join(', ')} - continuing`);
    await sleep(300);
    cont.click();
  }

  window.fillPassengerDetails = async function(data) {
    if (!isPassengerPage()) {
      showNotification('Not on passenger details page', 'error');
      return;
    }

    const { passengers } = data;
    if (!passengers || !passengers.length) {
      showNotification('No passenger data provided', 'error');
      return;
    }

    try {
      await new Promise(r => setTimeout(r, 1000));

      // Common passenger form selectors
      const passengerForms = document.querySelectorAll(
        '[class*="passenger"] form, [class*="Passenger"] form, form[id*="passenger"], form[class*="passenger"]'
      );

      let forms = Array.from(passengerForms);
      if (forms.length === 0) {
        // Try finding individual input groups
        forms = [document.body];
      }

      for (let i = 0; i < passengers.length; i++) {
        const p = passengers[i];
        const form = forms[i] || forms[0];

        // Name
        const nameSelectors = [
          'input[name*="name" i]', 'input[id*="name" i]', 'input[placeholder*="name" i]',
          'input[aria-label*="name" i]'
        ];
        for (const sel of nameSelectors) {
          const el = form.querySelector(sel);
          if (el && setValue(el, p.name)) break;
        }

        // Age
        const ageSelectors = [
          'input[name*="age" i]', 'input[id*="age" i]', 'input[type="number"]',
          'select[name*="age" i]'
        ];
        for (const sel of ageSelectors) {
          const el = form.querySelector(sel);
          if (el && setValue(el, p.age)) break;
        }

        // Gender
        const genderSelectors = [
          'select[name*="gender" i]', 'select[name*="sex" i]',
          'input[name*="gender" i][type="radio"]'
        ];
        for (const sel of genderSelectors) {
          const el = form.querySelector(sel);
          if (el) {
            if (el.tagName === 'SELECT') {
              setValue(el, p.gender);
            } else {
              const radio = form.querySelector(`input[name*="gender" i][value="${p.gender}"]`);
              if (radio) clickElement(radio);
            }
            break;
          }
        }

        // Phone
        const phoneSelectors = [
          'input[name*="phone" i]', 'input[name*="mobile" i]', 'input[id*="phone" i]',
          'input[type="tel"]', 'input[placeholder*="phone" i]'
        ];
        for (const sel of phoneSelectors) {
          const el = form.querySelector(sel);
          if (el && setValue(el, p.phone)) break;
        }

        // Email
        if (p.email) {
          const emailSelectors = [
            'input[name*="email" i]', 'input[type="email"]', 'input[id*="email" i]'
          ];
          for (const sel of emailSelectors) {
            const el = form.querySelector(sel);
            if (el && setValue(el, p.email)) break;
          }
        }

        // Seat preference
        if (p.seatPref) {
          const seatSelectors = [
            'select[name*="seat" i]', 'select[name*="berth" i]',
            'input[name*="seat" i][type="radio"]'
          ];
          for (const sel of seatSelectors) {
            const el = form.querySelector(sel);
            if (el) {
              if (el.tagName === 'SELECT') setValue(el, p.seatPref);
              else {
                const radio = form.querySelector(`input[name*="seat" i][value="${p.seatPref}"]`);
                if (radio) clickElement(radio);
              }
              break;
            }
          }
        }

        // Small delay between passengers
        await new Promise(r => setTimeout(r, 300));
      }

      showNotification(`Filled ${passengers.length} passenger(s)`);

    } catch (error) {
      console.error('[Railway Assistant] fillPassengerDetails error:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };

  // Auto-fill on page load
  function init() {
    if (!isSearchPage() && !isPassengerPage()) return;
    // Extension was reloaded/updated: this orphaned script can no longer use chrome.* APIs
    if (!chrome.runtime?.id) {
      urlObserver.disconnect();
      return;
    }

    try {
      chrome.storage.local.get([STORAGE_KEY, PASSENGER_KEY, 'autoFill', 'pendingBook'], (result) => {
        if (chrome.runtime.lastError || !result) return;
        runAutoFill(result);
      });
    } catch (e) {
      console.warn('[Railway Assistant] Extension context lost, refresh the page.', e);
      urlObserver.disconnect();
    }
  }

  function runAutoFill(result) {
    // Search started from the popup: book automatically once results load
    const pending = result.pendingBook;
    if (isSearchPage() && pending && Date.now() - pending.ts < 120000) {
      chrome.storage.local.remove('pendingBook');
      window.selectTrainAndBook(pending.data);
      return;
    }
    if (result.autoFill === false) return;
    if (isSearchPage() && result[STORAGE_KEY]) {
      // Search page: fields already in URL, just wait for results
      console.log('[Railway Assistant] On search page, waiting for results...');
    }
    if (isPassengerPage() && result[PASSENGER_KEY]) {
      setTimeout(() => window.fillPassengerDetails({ passengers: result[PASSENGER_KEY] }), 1000);
    }
  }

  // Handle SPA navigation (declared before init() runs so init can disconnect it)
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(init, 500);
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SELECT_TRAIN' && message.data) {
      window.selectTrainAndBook(message.data);
      sendResponse({ success: true });
    } else if (message.type === 'FILL_PASSENGERS' && message.data) {
      window.fillPassengerDetails(message.data);
      sendResponse({ success: true });
    }
    return true;
  });
})();