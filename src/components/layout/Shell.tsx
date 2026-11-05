import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, FileText, FileClock, FileMinus, FilePlus, Receipt, ShoppingCart, Users, Boxes, History, Repeat,
  Settings, Menu, X, CalendarClock, BarChart3, Sun, Moon, Monitor,
} from 'lucide-react';
import { getThemePref, setThemePref, type ThemePref } from '../../services/theme';

function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(getThemePref());
  const opts: { v: ThemePref; label: string; icon: typeof Sun }[] = [
    { v: 'light', label: 'Light', icon: Sun },
    { v: 'dark', label: 'Dark', icon: Moon },
    { v: 'system', label: 'System', icon: Monitor },
  ];
  return (
    <div className="mx-3 mb-3 grid grid-cols-3 gap-1 rounded-md bg-white/5 p-1" role="radiogroup" aria-label="Colour theme">
      {opts.map(({ v, label, icon: Icon }) => (
        <button key={v} role="radio" aria-checked={pref === v} title={`${label} theme`}
          onClick={() => { setThemePref(v); setPref(v); }}
          className={`flex items-center justify-center gap-1 rounded px-1 py-1 text-[11px] ${pref === v ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}>
          <Icon size={12} aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
import { findDueRecurrences, generateDueDrafts, type DueItem } from '../../features/documents/actions';
import { useAction, Modal } from '../ui';
import { useCompany } from '../../services/storage/db';
import { formatDate } from '../../utils/misc';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/d/invoice/new', label: 'Create Invoice', icon: FilePlus2 },
  { to: '/d/quotation', label: 'Quotations', icon: FileText },
  { to: '/d/proforma', label: 'Proforma Invoices', icon: FileClock },
  { to: '/d/credit-note', label: 'Credit Notes', icon: FileMinus },
  { to: '/d/debit-note', label: 'Debit Notes', icon: FilePlus },
  { to: '/receipts', label: 'Payment Receipts', icon: Receipt },
  { to: '/d/purchase-order', label: 'Purchase Orders', icon: ShoppingCart },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/services', label: 'Services Catalogue', icon: Boxes },
  { to: '/history', label: 'Invoice History', icon: History },
  { to: '/recurring', label: 'Recurring Invoices', icon: Repeat },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Company Settings', icon: Settings },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Main navigation">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-brand-800 font-medium text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`
          }
        >
          <Icon size={16} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2 px-4 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-500 text-sm font-bold text-white">SI</span>
      <span className="text-sm font-semibold leading-tight text-white">Software Invoice<br />Studio</span>
    </Link>
  );
}

export default function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [due, setDue] = useState<DueItem[]>([]);
  const [showDue, setShowDue] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = useAction();
  const location = useLocation();
  const company = useCompany();

  // Recurring check on app open (static hosting cannot run background jobs).
  useEffect(() => {
    findDueRecurrences().then((items) => {
      setDue(items);
      if (items.length) setShowDue(true);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const totalPeriods = due.reduce((a, d) => a + d.periods.length, 0);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 bg-brand-900 lg:fixed lg:inset-y-0 lg:flex lg:flex-col">
        <Brand />
        <div className="flex-1 overflow-y-auto pb-4"><NavItems /></div>
        <ThemeToggle />
        <p className="px-4 pb-4 text-[11px] leading-snug text-slate-400">Data is stored only in this browser. Back up regularly from Settings.</p>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-3 lg:hidden">
        <Brand />
        <button className="rounded-md p-2 text-white hover:bg-white/10" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu"><Menu size={22} /></button>
      </header>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto bg-brand-900 pb-4">
            <div className="flex items-center justify-between pr-2">
              <Brand />
              <button className="rounded-md p-2 text-white hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close navigation menu"><X size={20} /></button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
            <div className="mt-4"><ThemeToggle /></div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:ml-60">
        {company && !company.legalName && location.pathname !== '/settings' && (
          <div className="no-print border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Set up your company profile and logo first — they are printed on every document. <Link className="font-medium underline" to="/settings">Open Company Settings</Link>
          </div>
        )}
        {totalPeriods > 0 && !showDue && (
          <div className="no-print border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
            {totalPeriods} recurring invoice draft{totalPeriods > 1 ? 's are' : ' is'} due.{' '}
            <button className="font-medium underline" onClick={() => setShowDue(true)}>Review</button>
          </div>
        )}
        <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
          <Outlet />
        </div>
      </main>

      <Modal
        open={showDue}
        title="Recurring invoices due"
        onClose={() => setShowDue(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setShowDue(false)}>Not now</button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const n = await run(() => generateDueDrafts(due));
                setBusy(false);
                if (n !== undefined) {
                  setDue([]);
                  setShowDue(false);
                  await run(async () => undefined, `${n} draft invoice${n === 1 ? '' : 's'} created. Review them in Invoice History before sending.`);
                }
              }}
            >
              {busy ? 'Generating…' : `Generate ${totalPeriods} draft${totalPeriods === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          These schedules have periods due. Drafts are created for you to review and edit — nothing is sent or charged automatically.
        </p>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
          {due.map((d) => (
            <li key={d.rule.id} className="flex items-start gap-2 px-3 py-2">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-slate-400" />
              <div>
                <div className="font-medium">{d.source.client.name || 'No client'} — based on {d.source.number}</div>
                <div className="text-xs text-slate-500">Periods: {d.periods.map(formatDate).join(', ')}</div>
              </div>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
