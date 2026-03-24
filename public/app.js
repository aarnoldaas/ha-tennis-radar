const BASE = window.INGRESS_PATH || '';
const POLL_UI_INTERVAL = 10_000; // Refresh UI every 10s

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

  // Group by date
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

// Initial fetch + periodic refresh
update();
setInterval(update, POLL_UI_INTERVAL);
