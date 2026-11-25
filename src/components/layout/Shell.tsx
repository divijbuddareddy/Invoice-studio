import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus2, FileText, FileClock, FileMinus, FilePlus, Receipt, ShoppingCart, Users, Boxes, History, Repeat,
  Settings, Menu, X, CalendarClock, BarChart3, Sun, Moon, Monitor, Bell,
} from 'lucide-react';
import { getThemePref, setThemePref, type ThemePref } from '../../services/theme';
import { BILLING_FREQUENCY_LABEL } from '../../services/domain';
import { buildInvoiceNotifications } from '../../features/notifications/notifications';

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
import { markAllNotificationsRead, markNotificationRead, useCompany, useDocuments, useSettings } from '../../services/storage/db';
import { formatDate, todayStr } from '../../utils/misc';

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

function BellButton({ unreadCount, open, onClick }: { unreadCount: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
      className="relative rounded-md p-2 text-slate-200 hover:bg-white/10 hover:text-white"
    >
      <Bell size={18} aria-hidden />
      {unreadCount > 0 && (
        <span
          data-testid="notification-count"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [due, setDue] = useState<DueItem[]>([]);
  const [showDue, setShowDue] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [today, setToday] = useState(() => todayStr());
  const [busy, setBusy] = useState(false);
  const run = useAction();
  const location = useLocation();
  const navigate = useNavigate();
  const company = useCompany();
  const docs = useDocuments();
  const settings = useSettings();

  // Recurring check on app open (static hosting cannot run background jobs).
  useEffect(() => {
    findDueRecurrences().then((items) => {
      setDue(items);
      if (items.length) setShowDue(true);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setToday(todayStr()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    setToday(todayStr());
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNotifOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [notifOpen]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const notifications = useMemo(
    () => buildInvoiceNotifications(docs ?? [], settings?.readNotificationIds ?? [], today),
    [docs, settings?.readNotificationIds, today],
  );
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const totalPeriods = due.reduce((a, d) => a + d.periods.length, 0);

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-60 shrink-0 bg-brand-900 lg:fixed lg:inset-y-0 lg:flex lg:flex-col">
        <div className="flex items-center justify-between pr-3">
          <Brand />
          <BellButton unreadCount={unreadCount} open={notifOpen} onClick={() => setNotifOpen((v) => !v)} />
        </div>
        <div className="flex-1 overflow-y-auto pb-4"><NavItems /></div>
        <ThemeToggle />
        <p className="px-4 pb-4 text-[11px] leading-snug text-slate-400">Data is stored only in this browser. Back up regularly from Settings.</p>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-3 lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <BellButton unreadCount={unreadCount} open={notifOpen} onClick={() => setNotifOpen((v) => !v)} />
          <button className="rounded-md p-2 text-white hover:bg-white/10" onClick={() => setMobileOpen(true)} aria-label="Open navigation menu"><Menu size={22} /></button>
        </div>
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

      {notifOpen && (
        <>
          <div className="no-print fixed inset-0 z-40" onClick={() => setNotifOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-label="Notifications"
            className="no-print card fixed right-3 top-14 z-50 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden shadow-xl lg:left-64 lg:right-auto lg:top-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {unreadCount} unread
                </span>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => markAllNotificationsRead(notifications.filter((n) => !n.read).map((n) => n.id))}
                  >
                    Mark all read
                  </button>
                )}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setNotifOpen(false)} aria-label="Close notifications">
                  <X size={15} />
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No upcoming recurring invoice reminders.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!n.read) await markNotificationRead(n.id);
                          setNotifOpen(false);
                          navigate(`/d/invoice/${n.documentId}`);
                        }}
                        className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 ${n.read ? 'opacity-60' : ''}`}
                      >
                        <span
                          aria-hidden
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-slate-300' : 'bg-brand-600'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">
                              {n.invoiceNumber} · {n.clientName}
                            </span>
                            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              {n.daysUntilDue === 0 ? 'Due today' : n.daysUntilDue === 1 ? 'In 1 day' : `In ${n.daysUntilDue} days`}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span>{BILLING_FREQUENCY_LABEL[n.frequency]} · {formatDate(n.dueDate)}</span>
                            {n.read && <span>Read</span>}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
