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
      const wantedClass = (data.seatClass || '').trim().toUpperCase();

      let targetTrain = null;
      if (data.filter) {
        const f = data.filter.toLowerCase();
        targetTrain = cards.find(c => c.textContent.toLowerCase().includes(f));
      } else if (data.index !== null && data.index !== undefined && data.index < cards.length) {
        targetTrain = cards[data.index];
      } else {
        // First train that has any bookable seat in the wanted class (or any class)
        targetTrain = cards.find(c => Array.from(c.querySelectorAll('.single-seat-class'))
          .some(s => bookBtnOf(s) && (!wantedClass || seatClassOf(s) === wantedClass)));
      }

      if (!targetTrain) {
        showNotification('No matching train found', 'error');
        return;
      }

      const name = trainName(targetTrain);
      const seatBlocks = Array.from(targetTrain.querySelectorAll('.single-seat-class'));
      let seatBlock = wantedClass ? seatBlocks.find(s => seatClassOf(s) === wantedClass) : null;

      if (wantedClass && !seatBlock) {
        showNotification(`${name}: class ${wantedClass} not offered (has: ${seatBlocks.map(seatClassOf).join(', ')})`, 'error');
        return;
      }
      if (!seatBlock) seatBlock = seatBlocks.find(s => bookBtnOf(s));

      const bookButton = seatBlock && bookBtnOf(seatBlock);
      if (!bookButton) {
        const left = seatBlock?.querySelector('.all-seats')?.textContent.trim() ?? '0';
        showNotification(`${name}: ${wantedClass || 'class'} has no seats available (${left})`, 'error');
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

    } catch (error) {
      console.error('[Railway Assistant] selectTrainAndBook error:', error);
      showNotification('Error: ' + error.message, 'error');
    }
  };

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