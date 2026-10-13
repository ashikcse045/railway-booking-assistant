const STATIONS = [
  { code: 'Dhaka', name: 'Dhaka' },
  { code: 'Ishwardi Bypass', name: 'Ishwardi Bypass' },
  { code: 'Abdulpur', name: 'Abdulpur' },
  { code: 'Rajshahi', name: 'Rajshahi' }
]

// Static schedules keyed by "departure|destination". offDay: 0=Sunday ... 6=Saturday, null = runs daily
const SCHEDULES = {
  'Dhaka|Ishwardi Bypass': [
    { name: 'DHUMKETU EXPRESS', number: '769', offDay: 4, dep: '06:00 AM', arr: '10:12 AM' },
    { name: 'BURIMARI EXPRESS', number: '809', offDay: 3, dep: '08:30 AM', arr: '12:30 PM' },
    { name: 'EKOTA EXPRESS', number: '705', offDay: null, dep: '10:15 AM', arr: '02:09 PM' },
    { name: 'SILKCITY EXPRESS', number: '753', offDay: 0, dep: '02:30 PM', arr: '06:48 PM' },
    { name: 'CHILAHATI EXPRESS', number: '805', offDay: 6, dep: '05:00 PM', arr: '08:50 PM' },
    { name: 'PADMA EXPRESS', number: '759', offDay: 2, dep: '10:45 PM', arr: '02:30 AM (Next Day)' }
  ]
};
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STORAGE_KEY = 'railwayBookingPrefs';
const PASSENGER_KEY = 'railwayPassengers';

let currentStep = 'search';
let passengerCount = 1;

const elements = {
  steps: {
    search: document.getElementById('step-search'),
    train: document.getElementById('step-train'),
    passengers: document.getElementById('step-passengers'),
    complete: document.getElementById('step-complete')
  },
  departure: document.getElementById('departure'),
  destination: document.getElementById('destination'),
  journeyDate: document.getElementById('journey-date'),
  seatClass: document.getElementById('seat-class'),
  trainChoiceGroup: document.getElementById('train-choice-group'),
  trainChoice: document.getElementById('train-choice'),
  trainChoiceHint: document.getElementById('train-choice-hint'),
  startSearch: document.getElementById('start-search'),
  trainFilter: document.getElementById('train-filter'),
  trainIndex: document.getElementById('train-index'),
  selectTrain: document.getElementById('select-train'),
  backToSearch: document.getElementById('back-to-search'),
  passengerFields: document.getElementById('passenger-fields'),
  fillPassengers: document.getElementById('fill-passengers'),
  backToTrain: document.getElementById('back-to-train'),
  newBooking: document.getElementById('new-booking'),
  autoFill: document.getElementById('auto-fill'),
  status: document.getElementById('status')
};

function populateStations() {
  STATIONS.forEach(station => {
    const opt1 = document.createElement('option');
    opt1.value = station.code;
    opt1.textContent = station.name;
    elements.departure.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = station.code;
    opt2.textContent = station.name;
    elements.destination.appendChild(opt2);
  });
}

function toLocalISO(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-10-15" -> "15-Oct-2026" (format the railway site expects in `doj`)
function formatSiteDate(iso) {
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d}-${months[parseInt(m, 10) - 1]}-${y}`;
}

function setMinDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  elements.journeyDate.min = toLocalISO(tomorrow);
  elements.journeyDate.value = toLocalISO(tomorrow);
}

// Rebuild the train dropdown for the selected route + date, hiding trains on their off day
function updateTrainList(preselect = '') {
  const { departure, destination, journeyDate } = getSearchData();
  const schedule = SCHEDULES[`${departure}|${destination}`];
  elements.trainChoice.innerHTML = '<option value="">Any available train</option>';
  if (!schedule || !journeyDate) {
    elements.trainChoiceGroup.classList.add('hidden');
    return;
  }
  const [y, m, d] = journeyDate.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  const running = schedule.filter(t => t.offDay !== weekday);
  running.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name;
    opt.textContent = `${t.name} (${t.number}) — Dep ${t.dep}, Arr ${t.arr}`;
    elements.trainChoice.appendChild(opt);
  });
  if (preselect && running.some(t => t.name === preselect)) {
    elements.trainChoice.value = preselect;
  }
  const off = schedule.filter(t => t.offDay === weekday).map(t => t.name);
  elements.trainChoiceHint.textContent =
    `${DAY_NAMES[weekday]}: ${running.length} train(s) running` +
    (off.length ? `. Off today: ${off.join(', ')}` : '');
  elements.trainChoiceGroup.classList.remove('hidden');
}

function showStatus(message, type = 'info') {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
  elements.status.classList.remove('hidden');
}

function hideStatus() {
  elements.status.classList.add('hidden');
}

function showStep(step) {
  Object.values(elements.steps).forEach(s => s.classList.add('hidden'));
  elements.steps[step].classList.remove('hidden');
  currentStep = step;
  hideStatus();
}

function getSearchData() {
  return {
    departure: elements.departure.value,
    destination: elements.destination.value,
    journeyDate: elements.journeyDate.value,
    seatClass: elements.seatClass.value,
    trainName: elements.trainChoice.value
  };
}

function setSearchData(data) {
  if (data.departure) elements.departure.value = data.departure;
  if (data.destination) elements.destination.value = data.destination;
  // Ignore a saved date that is already in the past
  if (data.journeyDate && data.journeyDate >= elements.journeyDate.min) {
    elements.journeyDate.value = data.journeyDate;
  }
  if (data.seatClass) elements.seatClass.value = data.seatClass;
  updateTrainList(data.trainName);
}

function getTrainSelection() {
  return {
    filter: elements.trainFilter.value.trim() || elements.trainChoice.value,
    index: elements.trainIndex.value ? parseInt(elements.trainIndex.value) : null
  };
}

function generatePassengerFields(count) {
  passengerCount = count;
  elements.passengerFields.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const div = document.createElement('div');
    div.className = 'passenger-block';
    div.innerHTML = `
      <h4>Passenger ${i}</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" required placeholder="Full name">
        </div>
        <div class="form-group">
          <label>Age</label>
          <input type="number" name="age" required min="1" max="120" placeholder="Age">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Gender</label>
          <select name="gender" required>
            <option value="">Select</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>Phone</label>
          <input type="tel" name="phone" required placeholder="01XXXXXXXXX">
        </div>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" name="email" placeholder="optional@example.com">
      </div>
      <div class="form-group">
        <label>Seat Preference</label>
        <select name="seatPref">
          <option value="">Any</option>
          <option value="WINDOW">Window</option>
          <option value="AISLE">Aisle</option>
        </select>
      </div>
    `;
    elements.passengerFields.appendChild(div);
  }
}

function getPassengerData() {
  const passengers = [];
  const blocks = elements.passengerFields.querySelectorAll('.passenger-block');
  blocks.forEach(block => {
    passengers.push({
      name: block.querySelector('[name="name"]').value,
      age: block.querySelector('[name="age"]').value,
      gender: block.querySelector('[name="gender"]').value,
      phone: block.querySelector('[name="phone"]').value,
      email: block.querySelector('[name="email"]').value,
      seatPref: block.querySelector('[name="seatPref"]').value
    });
  });
  return passengers;
}

function setPassengerData(data) {
  if (!data || !data.length) return;
  generatePassengerFields(data.length);
  const blocks = elements.passengerFields.querySelectorAll('.passenger-block');
  data.forEach((p, i) => {
    if (blocks[i]) {
      blocks[i].querySelector('[name="name"]').value = p.name || '';
      blocks[i].querySelector('[name="age"]').value = p.age || '';
      blocks[i].querySelector('[name="gender"]').value = p.gender || '';
      blocks[i].querySelector('[name="phone"]').value = p.phone || '';
      blocks[i].querySelector('[name="email"]').value = p.email || '';
      blocks[i].querySelector('[name="seatPref"]').value = p.seatPref || '';
    }
  });
}

async function loadPreferences() {
  try {
    const [prefs, passengers, settings] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEY),
      chrome.storage.local.get(PASSENGER_KEY),
      chrome.storage.local.get('autoFill')
    ]);
    if (prefs[STORAGE_KEY]) setSearchData(prefs[STORAGE_KEY]);
    if (passengers[PASSENGER_KEY]) setPassengerData(passengers[PASSENGER_KEY]);
    if (settings.autoFill !== undefined) elements.autoFill.checked = settings.autoFill;
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
}

async function saveSearchPrefs() {
  const data = getSearchData();
  if (!data.departure || !data.destination) {
    showStatus('Please select departure and destination', 'error');
    return false;
  }
  if (data.departure === data.destination) {
    showStatus('Departure and destination cannot be the same', 'error');
    return false;
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    return true;
  } catch (error) {
    console.error('Failed to save:', error);
    showStatus('Failed to save preferences', 'error');
    return false;
  }
}

async function savePassengerPrefs(passengers) {
  try {
    await chrome.storage.local.set({ [PASSENGER_KEY]: passengers });
    return true;
  } catch (error) {
    console.error('Failed to save passengers:', error);
    return false;
  }
}

async function executeOnTab(action, data) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url?.includes('eticket.railway.gov.bd')) {
    showStatus('Please open the railway website first', 'error');
    return false;
  }
  try {
    // content.js registers these handlers; the popup's own window doesn't have them
    const type = action === 'selectTrainAndBook' ? 'SELECT_TRAIN' : 'FILL_PASSENGERS';
    await chrome.tabs.sendMessage(tab.id, { type, data });
    return true;
  } catch (error) {
    console.error(`Failed to execute ${action}:`, error);
    showStatus('Failed: refresh the railway page and try again', 'error');
    return false;
  }
}

elements.startSearch.addEventListener('click', async () => {
  if (await saveSearchPrefs()) {
    const data = getSearchData();
    showStatus('Opening search page...', 'info');
    // The popup closes when the new tab opens, so hand the booking off to the page
    await chrome.storage.local.set({
      pendingBook: {
        ts: Date.now(),
        data: { filter: data.trainName, index: null, seatClass: data.seatClass }
      }
    });
    const url = `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(data.departure)}&tocity=${encodeURIComponent(data.destination)}&doj=${formatSiteDate(data.journeyDate)}&class=${encodeURIComponent(data.seatClass)}`;
    chrome.tabs.create({ url }, () => {
      showStatus('Search page opened. Click "Select Train" after results load.', 'success');
      showStep('train');
    });
  }
});

elements.selectTrain.addEventListener('click', async () => {
  const data = { ...getSearchData(), ...getTrainSelection() };
  showStatus('Selecting train...', 'info');
  if (await executeOnTab('selectTrainAndBook', data)) {
    showStatus('Train selected. Proceeding to passenger page...', 'success');
    showStep('passengers');
    generatePassengerFields(4);
  }
});

elements.fillPassengers.addEventListener('click', async () => {
  const passengers = getPassengerData();
  const valid = passengers.every(p => p.name && p.age && p.gender && p.phone);
  if (!valid) {
    showStatus('Please fill all required passenger fields', 'error');
    return;
  }
  await savePassengerPrefs(passengers);
  showStatus('Filling passenger details...', 'info');
  if (await executeOnTab('fillPassengerDetails', { passengers })) {
    showStatus('Passenger details filled!', 'success');
    showStep('complete');
  }
});

elements.backToSearch.addEventListener('click', () => showStep('search'));
elements.backToTrain.addEventListener('click', () => showStep('train'));
elements.newBooking.addEventListener('click', () => {
  showStep('search');
  elements.trainFilter.value = '';
  elements.trainIndex.value = '';
});

elements.autoFill.addEventListener('change', async () => {
  await chrome.storage.local.set({ autoFill: elements.autoFill.checked });
});

[ elements.departure, elements.destination, elements.journeyDate, elements.seatClass ].forEach(el => {
  el.addEventListener('change', () => {
    if (el !== elements.seatClass) updateTrainList();
    saveSearchPrefs();
  });
});
elements.trainChoice.addEventListener('change', () => saveSearchPrefs());

populateStations();
setMinDate();
updateTrainList();
loadPreferences();
generatePassengerFields(1);