const BASE = window.INGRESS_PATH || '';
const POLL_UI_INTERVAL = 10_000;

// --- Tabs ---
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-results').style.display = tab === 'results' ? '' : 'none';
    document.getElementById('tab-settings').style.display = tab === 'settings' ? '' : 'none';
    if (tab === 'settings') loadConfig();
  });
});

// --- Courts tab ---
async function fetchStatus() {
  try {
    const res = await fetch(`${BASE}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch status:', err);
    return null;
  }
}

function renderSlots(slots) {
  const container = document.getElementById('slots-container');

  if (!slots || slots.length === 0) {
    container.innerHTML = '<p class="empty">No available courts found matching your preferences.</p>';
    return;
  }

  const byDate = {};
  for (const slot of slots) {
    if (!byDate[slot.date]) byDate[slot.date] = [];
    byDate[slot.date].push(slot);
  }

  let html = '';
  for (const [date, dateSlots] of Object.entries(byDate).sort()) {
    html += `<h3 style="margin-top:16px;font-size:0.95rem;">${date}</h3>`;
    html += '<table><thead><tr><th>Court</th><th>Time</th><th>Duration</th><th>Provider</th></tr></thead><tbody>';
    for (const s of dateSlots.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
      html += `<tr>
        <td>${esc(s.courtName)}</td>
        <td>${esc(s.startTime)} – ${esc(s.endTime)}</td>
        <td>${s.durationMinutes} min</td>
        <td><span class="provider-tag">${esc(s.provider)}</span></td>
      </tr>`;
    }
    html += '</tbody></table>';
  }

  container.innerHTML = html;
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

async function update() {
  const data = await fetchStatus();
  const statusEl = document.getElementById('status');
  const lastPollEl = document.getElementById('last-poll');

  if (!data) {
    statusEl.textContent = 'Error';
    statusEl.className = 'status error';
    return;
  }

  statusEl.textContent = 'Running';
  statusEl.className = 'status ok';

  renderSlots(data.availableSlots);

  if (data.lastPoll) {
    const d = new Date(data.lastPoll);
    lastPollEl.textContent = `Last poll: ${d.toLocaleTimeString()}`;
  }
}

update();
setInterval(update, POLL_UI_INTERVAL);

// --- Settings tab ---
const form = document.getElementById('config-form');

async function loadConfig() {
  try {
    const res = await fetch(`${BASE}/api/config`);
    const config = await res.json();

    for (const [key, value] of Object.entries(config)) {
      const input = form.elements[key];
      if (!input) continue;
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        input.value = value ?? '';
      }
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveStatus = document.getElementById('save-status');

  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') {
      data[el.name] = el.checked;
    } else if (el.type === 'number') {
      data[el.name] = Number(el.value);
    } else {
      data[el.name] = el.value;
    }
  }

  try {
    const res = await fetch(`${BASE}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      saveStatus.textContent = 'Saved!';
      saveStatus.className = 'save-ok';
    } else {
      saveStatus.textContent = 'Failed to save';
      saveStatus.className = 'save-err';
    }
  } catch (err) {
    saveStatus.textContent = 'Error saving';
    saveStatus.className = 'save-err';
  }

  setTimeout(() => { saveStatus.textContent = ''; }, 3000);
});
