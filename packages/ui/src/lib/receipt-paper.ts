export type ThermalPaper = '58' | '80';

const STORAGE_KEY = 'forno-receipt-paper';

/** Most corner-store thermal printers take 58mm rolls, so that is the default. */
export function resolveThermalPaper(): ThermalPaper {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '80' ? '80' : '58';
  } catch {
    return '58';
  }
}

export function saveThermalPaper(paper: ThermalPaper): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, paper);
  } catch {
    // The choice still applies for this session.
  }
}
