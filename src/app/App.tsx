import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { initStorage } from '../services/storage/db';
import { loadUnicodeFont } from '../services/pdf/fonts';
import { ConfirmProvider, ToastProvider } from '../components/ui';

export default function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    initStorage()
      .then(async () => {
        // Preload the bundled Unicode PDF font (Noto Sans and the ₹ symbol); on failure PDFs fall back to built-in fonts.
        await loadUnicodeFont();
        setState('ready');
      })
      .catch((e) => {
        setError((e as Error)?.message ?? 'Unknown error');
        setState('error');
      });
  }, []);

  if (state === 'loading') return <div className="p-10 text-center text-sm text-slate-500">Opening local workspace…</div>;
  if (state === 'error')
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-lg border border-red-200 bg-white p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold text-red-700">Local storage is unavailable</h1>
        <p className="text-slate-700">
          Software Invoice Studio stores everything in your browser using IndexedDB, which could not be opened. Private/incognito
          windows, blocked site data or very old browsers can cause this. Try a normal window in a current version of Chrome, Edge,
          Firefox or Safari.
        </p>
        <p className="mt-3 text-xs text-slate-500">Details: {error}</p>
      </div>
    );

  return (
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>
  );
}
