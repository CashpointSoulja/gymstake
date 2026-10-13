export type IconName = 'home' | 'pin' | 'trophy' | 'settings' | 'arrowRight' | 'arrowLeft' | 'arrowUpRight' | 'check' | 'plus' | 'minus' | 'wallet' | 'flame' | 'clock' | 'dumbbell' | 'bolt' | 'close' | 'search' | 'chevronRight' | 'chevronDown' | 'info' | 'target' | 'calendar' | 'pause' | 'play' | 'refresh' | 'shield' | 'globe' | 'heart' | 'external';

const paths: Record<IconName, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM12 13v5M8 21h8M9 18h6"/><path d="M8 5H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4"/>',
  settings: '<path d="m9 3-.7 2.5-2.2 1.3-2.5-.7-2 3.5 1.8 1.8v2.6l-1.8 1.8 2 3.5 2.5-.7 2.2 1.3L9 22h4l.7-2.5 2.2-1.3 2.5.7 2-3.5-1.8-1.8V11l1.8-1.8-2-3.5-2.5.7-2.2-1.3L13 3Z" transform="translate(1 -.5) scale(.95)"/><circle cx="12" cy="12" r="3"/>',
  arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  arrowLeft: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  arrowUpRight: '<path d="M6 18 18 6M6 6h12v12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v11H5a3 3 0 0 1-3-3V6"/><path d="M20 11h-5v5h5"/><circle cx="16.5" cy="13.5" r=".5"/>',
  flame: '<path d="M12 2c2 5-3 6-2 10 2-1 3-3 3-5 5 4 7 7 5 11a7 7 0 0 1-12-1C3 11 9 8 12 2Z"/><path d="M12 13c-3 3-3 6 0 8 4-2 4-5 0-8Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dumbbell: '<path d="m3 7 4-4 3 3-4 4-3-3Zm11 11 4-4 3 3-4 4-3-3ZM7 17l10-10M2 10l8-8M14 22l8-8M5 14l5 5M14 5l5 5"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3M7 17h3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m7 4 14 8-14 8V4Z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M18 18a8 8 0 0 1-14-6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>',
};

export function icon(name: IconName, size = 20): string {
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
