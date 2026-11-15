import type { Ui } from '../components/ModeChooser';

/** Whether this browser has already finished or skipped the tour for a mode (kept apart so App can check it without loading the tour). */
const key = (u: Ui) => `tour-seen-${u}`;
export const tourSeen = (u: Ui) => { try { return localStorage.getItem(key(u)) === '1'; } catch { return true; } };
export const markTourSeen = (u: Ui) => { try { localStorage.setItem(key(u), '1'); } catch { /* storage blocked */ } };
