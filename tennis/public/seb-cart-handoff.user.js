// ==UserScript==
// @name         Tennis Radar - SEB cart handoff
// @description  Open a Tennis Radar cart using SEB Arena localStorage.
// @version      1.0.0
// @match        https://book.sebarena.lt/*
// @run-at       document-start
// @grant        none
// @inject-into  content
// ==/UserScript==

// Run before SEB reads cartReservationCode into its application state.
(() => {
  const handoff = () => {
  if (location.origin !== 'https://book.sebarena.lt') return;
  const hash = location.hash;
  const queryAt = hash.indexOf('?');
  if (queryAt < 0) return;
  const params = new URLSearchParams(hash.slice(queryAt + 1));
  const code = params.get('tennisRadarCart');
  if (!code || !/^[A-Za-z0-9_-]{1,200}$/.test(code)) return;
  try {
    const previous = localStorage.getItem('cartReservationCode');
    if (previous && previous !== code && previous !== 'false') {
      localStorage.setItem('tennisRadarPreviousCartReservationCode', previous);
    }
    localStorage.setItem('cartReservationCode', code);
    params.delete('tennisRadarCart');
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${location.search}${hash.slice(0, queryAt)}${query ? `?${query}` : ''}`);
    location.reload(); // Also works if Safari injected after SEB initialized its store.
  } catch {
    // Leave the handoff fragment intact if browser storage is unavailable.
    console.warn('Tennis Radar could not save the SEB cart to localStorage.');
  }
  };
  window.addEventListener('hashchange', handoff);
  handoff();
})();
