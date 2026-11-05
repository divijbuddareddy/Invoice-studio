import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, CircleDashed, Clock, Ban, Send, ThumbsUp, ThumbsDown, Repeat, FileCheck2, PackageCheck, CircleDot } from 'lucide-react';
import type { DocStatus } from '../types';
import { STATUS_LABEL } from '../services/domain';

// ---- form fields -----------------------------------------------------------------

export function Field({ label, error, hint, children, className = '', htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; wrapClass?: string };
export function TextInput({ label, error, hint, wrapClass, className = '', id, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} className={wrapClass} htmlFor={fid}>
      <input id={fid} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

/** Numeric input that keeps a local string so users can type "1." or clear the field. */
export function NumberInput({ label, value, onChange, min = 0, step = 'any', error, hint, wrapClass, srOnlyLabel, ...rest }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; step?: string; error?: string; hint?: string; wrapClass?: string; srOnlyLabel?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'step'>) {
  const id = useId();
  const [text, setText] = useState(String(value ?? 0));
  useEffect(() => {
    setText((t) => (Number(t) === value ? t : String(value ?? 0)));
  }, [value]);
  const input = (
    <input
      id={id}
      inputMode="decimal"
      type="number"
      min={min}
      step={step}
      className={`input text-right ${error ? 'input-error' : ''}`}
      value={text}
      aria-invalid={!!error}
      aria-label={srOnlyLabel ? label : undefined}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value === '') onChange(0);
        else if (Number.isFinite(n)) onChange(min !== undefined && n < min ? min : n);
      }}
      {...rest}
    />
  );
  if (srOnlyLabel) return <div className={`min-w-0 ${wrapClass ?? ''}`}>{input}</div>;
  return (
    <Field label={label} error={error} hint={hint} className={wrapClass} htmlFor={id}>
      {input}
    </Field>
  );
}

export function TextArea({ label, error, hint, wrapClass, rows = 3, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string; wrapClass?: string }) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={wrapClass} htmlFor={id}>
      <textarea id={id} rows={rows} className={`input ${error ? 'input-error' : ''}`} {...rest} />
    </Field>
  );
}

export function Select({ label, options, error, hint, wrapClass, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; options: { value: string; label: string }[]; error?: string; hint?: string; wrapClass?: string;
}) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} className={wrapClass} htmlFor={id}>
      <select id={id} className={`input ${error ? 'input-error' : ''}`} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm text-slate-700">
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
}

// ---- layout bits --------------------------------------------------------------------

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, children, actions, className = '' }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
}

// Status badges use icon + text so meaning never depends on colour alone.
const STATUS_STYLE: Record<DocStatus, [string, ReactNode]> = {
  draft: ['bg-slate-100 text-slate-700 border-slate-300', <CircleDashed key="i" size={12} />],
  unpaid: ['bg-amber-50 text-amber-800 border-amber-300', <Clock key="i" size={12} />],
  partially_paid: ['bg-sky-50 text-sky-800 border-sky-300', <CircleDot key="i" size={12} />],
  paid: ['bg-emerald-50 text-emerald-800 border-emerald-300', <CheckCircle2 key="i" size={12} />],
  overdue: ['bg-red-50 text-red-800 border-red-300', <AlertTriangle key="i" size={12} />],
  cancelled: ['bg-slate-100 text-slate-500 border-slate-300 line-through', <Ban key="i" size={12} />],
  sent: ['bg-blue-50 text-blue-800 border-blue-300', <Send key="i" size={12} />],
  accepted: ['bg-emerald-50 text-emerald-800 border-emerald-300', <ThumbsUp key="i" size={12} />],
  rejected: ['bg-red-50 text-red-800 border-red-300', <ThumbsDown key="i" size={12} />],
  expired: ['bg-orange-50 text-orange-800 border-orange-300', <Clock key="i" size={12} />],
  converted: ['bg-violet-50 text-violet-800 border-violet-300', <Repeat key="i" size={12} />],
  issued: ['bg-blue-50 text-blue-800 border-blue-300', <FileCheck2 key="i" size={12} />],
  fulfilled: ['bg-emerald-50 text-emerald-800 border-emerald-300', <PackageCheck key="i" size={12} />],
};

export function StatusBadge({ status }: { status: DocStatus }) {
  const [cls, icon] = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {icon}
      {STATUS_LABEL[status]}
    </span>
  );
}

// ---- modal ------------------------------------------------------------------------------

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button data-close className="btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- confirm dialog -------------------------------------------------------------------------

interface ConfirmOptions { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; requireText?: string }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => { setTyped(''); setState({ ...o, resolve }); }), []);
  const close = (v: boolean) => { state?.resolve(v); setState(null); };
  const blocked = !!state?.requireText && typed !== state.requireText;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} title={state?.title ?? ''} onClose={() => close(false)}
        footer={<>
          <button className="btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button className={state?.danger ? 'btn-danger' : 'btn-primary'} disabled={blocked} onClick={() => close(true)}>{state?.confirmLabel ?? 'Confirm'}</button>
        </>}>
        <div className="text-sm text-slate-700">{state?.message}</div>
        {state?.requireText && (
          <TextInput wrapClass="mt-3" label={`Type ${state.requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} />
        )}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// ---- toasts --------------------------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }
const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md ${
              t.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : t.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'}`}>
            {t.kind === 'error' ? <XCircle size={16} className="mt-0.5 shrink-0" /> : t.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{t.text}</span>
            <button className="shrink-0 opacity-60 hover:opacity-100" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Run an async action and surface storage errors as toasts instead of failing silently. */
export function useAction() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast('success', success);
        return r;
      } catch (e) {
        toast('error', (e as Error)?.message || 'Something went wrong.');
        return undefined;
      }
    },
    [toast],
  );
}
