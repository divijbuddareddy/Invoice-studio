import { useEffect, useRef, useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import type { PdfResult } from '../../services/pdf/pdf';
import { loadUnicodeFont, unicodeFontReady } from '../../services/pdf/fonts';
import type { Branding } from '../../types';

/**
 * Live preview that renders the *actual* generated PDF, so what you see is exactly what downloads.
 * Rebuilds are debounced while typing.
 */
export default function PdfPreview({ build, deps }: { build: () => PdfResult; deps: unknown[]; branding?: Branding }) {
  const [url, setUrl] = useState('');
  const [fontTick, setFontTick] = useState(0);

  // Load the bundled Unicode font (Noto Sans and the ₹ symbol), then rebuild the preview.
  useEffect(() => {
    if (!unicodeFontReady()) loadUnicodeFont().then((ok) => ok && setFontTick((t) => t + 1));
  }, []);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const urlRef = useRef('');
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const r = buildRef.current();
        const next = URL.createObjectURL(r.pdf.output('blob'));
        const old = urlRef.current;
        urlRef.current = next;
        setUrl(next);
        setError('');
        setWarnings(r.warnings);
        if (old) setTimeout(() => URL.revokeObjectURL(old), 1500);
      } catch (e) {
        setError((e as Error)?.message ?? 'Preview failed');
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, fontTick]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">Live A4 preview of the generated PDF</span>
        {url && (
          <a className="btn-ghost btn-sm" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Open in new tab
          </a>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warnings.join(' ')}
        </div>
      )}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Preview could not be generated: {error}</div>
      ) : url ? (
        <iframe title="Document PDF preview" src={`${url}#view=FitH&toolbar=0`} className="min-h-[70vh] w-full flex-1 rounded-md border border-slate-300 bg-slate-200" />
      ) : (
        <div className="flex min-h-[50vh] items-center justify-center rounded-md border border-dashed border-slate-300 text-sm text-slate-500">Generating preview…</div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">If your browser can't display PDFs inline (common on phones), use “Open in new tab” or Download PDF.</p>
    </div>
  );
}
