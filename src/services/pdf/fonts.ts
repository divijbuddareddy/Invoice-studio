// Locally bundled Unicode PDF font (Noto Sans, SIL OFL 1.1 — see public/fonts/OFL.txt).
// Loaded on demand from this site (never a remote font service) and cached in memory.

import type { jsPDF } from 'jspdf';

export const UNICODE_FONT = 'NotoSans';
const FILES = {
  normal: 'NotoSans-Regular.ttf',
  bold: 'NotoSans-Bold.ttf',
  italic: 'NotoSans-Italic.ttf',
} as const;
type Style = keyof typeof FILES;

let data: Record<Style, string> | null = null;
let loading: Promise<boolean> | null = null;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export const unicodeFontReady = () => data !== null;

/** For tests / non-browser environments: provide base64 TTF data directly. */
export function setUnicodeFontData(d: Record<Style, string> | null) {
  data = d;
}

/** Fetch the bundled fonts (relative to the app, so it works under any GitHub Pages path). */
export function loadUnicodeFont(): Promise<boolean> {
  if (data) return Promise.resolve(true);
  if (!loading) {
    loading = (async () => {
      try {
        const base = new URL('fonts/', document.baseURI);
        const entries = await Promise.all(
          (Object.keys(FILES) as Style[]).map(async (s) => {
            const res = await fetch(new URL(FILES[s], base));
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return [s, toBase64(await res.arrayBuffer())] as const;
          }),
        );
        data = Object.fromEntries(entries) as Record<Style, string>;
        return true;
      } catch {
        loading = null;
        return false;
      }
    })();
  }
  return loading;
}

/** Register the Unicode font on a jsPDF instance. Returns false if the font isn't loaded. */
export function registerUnicodeFont(pdf: jsPDF): boolean {
  if (!data) return false;
  for (const s of Object.keys(FILES) as Style[]) {
    pdf.addFileToVFS(FILES[s], data[s]);
    pdf.addFont(FILES[s], UNICODE_FONT, s);
  }
  // jsPDF needs a 'bolditalic' entry for completeness; map it to bold.
  pdf.addFont(FILES.bold, UNICODE_FONT, 'bolditalic');
  return true;
}
