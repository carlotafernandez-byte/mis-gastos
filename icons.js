/* Iconos de línea fina (SVG propio, sin emojis ni librerías externas). */
const ICON_PATHS = {
  // categorías
  cart: '<circle cx="9" cy="20" r="1.2"/><circle cx="18" cy="20" r="1.2"/><path d="M2 3h3l2.6 12.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 7H6"/>',
  shirt: '<path d="M8 3 3 6l2 4 3-1v12h8V9l3 1 2-4-5-3c-.5 1.7-2 3-4 3S8.5 4.7 8 3z"/>',
  gem: '<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M9 3 7.5 9 12 21l4.5-12L15 3"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15v4M17 17h4"/>',
  utensils: '<path d="M5 3v7a2 2 0 0 0 4 0V3M7 12v9M17 21V3c-2 1-3 3.5-3 7v3h3"/>',
  cup: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5v3M12 2.5v3"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="1.5 2"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  tram: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4M9 14h.01M15 14h.01"/>',
  play: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M10.5 8.5v5l4-2.5z"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M10 20v-5h4v5"/>',
  pulse: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  income: '<path d="M12 3v11M7.5 9.5 12 14l4.5-4.5"/><path d="M4 16v4h16v-4"/>',
  // interfaz
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  trend: '<path d="m3 17 5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
  bars: '<path d="M3 21h18M6 17v-5M11 17V7M16 17v-8M21 17V4" />',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bank: '<path d="m3 10 9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
};
function Icon(name, cls = '') {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.tag}</svg>`;
}
