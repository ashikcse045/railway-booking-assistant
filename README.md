# Bangladesh Railway Booking Assistant

A lightweight Chrome extension to help users book Bangladesh Railway tickets through the official website (eticket.railway.gov.bd).

## Features

- **Popup Interface**: Clean, modern form to enter journey preferences
- **Preference Storage**: Saves departure, destination, date, seat class, and passenger count locally
- **Quick Website Access**: One-click button to open the official railway website
- **Form Assistance**: Fills supported booking fields on the railway website
- **User Controlled**: You remain in control of train selection, CAPTCHA, OTP, payment, and final submission
- **Privacy First**: No passwords, OTPs, payment credentials, or cookies stored

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `railway-booking-assistant` folder
6. The extension icon will appear in your toolbar

## Usage

1. Click the extension icon in your toolbar
2. Fill in your journey preferences:
   - Departure station
   - Destination station
   - Journey date
   - Seat class
   - Number of passengers (1-8)
3. Click **Save Preferences** to store them locally
4. Click **Open Website** to navigate to eticket.railway.gov.bd
5. On the booking page, click **Fill Form** to auto-populate supported fields
6. Complete the booking manually (train selection, CAPTCHA, OTP, payment)

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save preferences locally in your browser |
| `activeTab` | Access the current railway website tab |
| `scripting` | Inject form-filling script on the railway website |
| `https://eticket.railway.gov.bd/*` | Only works on the official railway website |

## How It Works

### popup.html / popup.js
- Main interface for entering and saving preferences
- Communicates with content script via Chrome messaging API
- Validates form data before saving

### content.js
- Runs on eticket.railway.gov.bd pages
- Detects supported booking pages (search, passenger, booking)
- Attempts to fill form fields using multiple selector strategies
- Triggers proper input/change events for React/Vue compatibility
- Shows notification when fields are filled

### manifest.json
- Manifest V3 configuration
- Minimal permissions following least-privilege principle
- Content script restricted to railway domain only

## Supported Pages

The extension attempts to fill fields on:
- Train search pages (`/ticket/search`, `/search`)
- Passenger details pages (`/passenger`, `/booking`)
- Other ticket-related pages

## Limitations

- **Selectors are heuristic**: The railway website may change its HTML structure. The extension uses multiple fallback selectors but may not find all fields.
- **No CAPTCHA solving**: You must complete CAPTCHA/anti-bot verification manually
- **No automated booking**: Final submission, payment, and confirmation require manual action
- **Station codes**: The station list is based on common codes; some stations may not be available
- **Date restrictions**: The website may have its own date validation (advance booking limits, etc.)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension not loading | Ensure Developer mode is enabled, try reloading |
| Form not filling | Make sure you're on a supported page, click Fill Form button |
| Preferences not saving | Check Chrome storage quota, try clearing and re-saving |
| Wrong station selected | Station matching is by text/value; select manually if needed |
| Date not filling | Some pages use custom date pickers; manual entry may be needed |

## Development

### Project Structure
```
railway-booking-assistant/
├── manifest.json      # Extension configuration
├── popup.html         # Popup interface
├── popup.css          # Styling
├── popup.js           # Popup logic
├── content.js         # Content script for form filling
├── icons/             # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### Testing Checklist
- [ ] Extension loads in `chrome://extensions`
- [ ] Popup opens without errors
- [ ] Preferences save and persist after Chrome restart
- [ ] Official website opens in normal tab
- [ ] Form filling works on supported pages
- [ ] Missing fields show useful errors
- [ ] No automatic form submission
- [ ] No sensitive data stored

## Privacy

This extension:
- Stores only non-sensitive preferences locally in your browser
- Does not transmit any data to external servers
- Does not access or export cookies
- Does not inject scripts into non-railway websites
- Requires only minimal, necessary permissions

## Disclaimer

This is an unofficial assistant tool. It is not affiliated with Bangladesh Railway or the official eticket.railway.gov.bd website. Use at your own risk. Always verify booking details before payment.

## License

MIT License - Feel free to use and modify for personal purposes.