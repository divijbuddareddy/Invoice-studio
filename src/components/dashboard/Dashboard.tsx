import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, FileText, Receipt, UserPlus, Wallet, AlertTriangle, CheckCircle2, Files, Database } from 'lucide-react';
import { DOC_META, STATUS_LABEL } from '../../services/domain';
import { useClients, useDocuments, usePayments, useServices, useSettings } from '../../services/storage/db';
import { docSummary } from '../../features/payments/payments';
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/misc';
import { EmptyState, Loading, PageHeader, StatusBadge } from '../ui';
import PaymentDialog from '../receipt/PaymentDialog';
import type { DocStatus } from '../../types';

export default function Dashboard() {
  const docs = useDocuments();
  const payments = usePayments();
  const clients = useClients();
  const services = useServices();
  const settings = useSettings();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [payOpen, setPayOpen] = useState(false);

  const data = useMemo(() => {
    if (!docs) return null;
    const rows = docs
      .filter((d) => !d.archived)
      .filter((d) => (!from || d.issueDate >= from) && (!to || d.issueDate <= to))
      .map((d) => ({ d, ...docSummary(d, payments ?? []) }))
      .filter((r) => !status || r.status === status);
    // Money metrics are per currency — never summed across currencies.
    const byCurrency = new Map<string, { value: number; paid: number; outstanding: number; overdue: number; count: number }>();
    for (const r of rows) {
      if (r.d.type !== 'invoice' || r.status === 'draft' || r.status === 'cancelled') continue;
      const m = byCurrency.get(r.d.currency) ?? { value: 0, paid: 0, outstanding: 0, overdue: 0, count: 0 };
      m.value += r.totals.grandTotalMinor;
      m.paid += Math.min(r.totals.paidMinor, r.totals.grandTotalMinor);
      m.outstanding += Math.max(0, r.totals.balanceMinor);
      if (r.status === 'overdue') m.overdue += Math.max(0, r.totals.balanceMinor);
      m.count++;
      byCurrency.set(r.d.currency, m);
    }
    const recent = [...rows].sort((a, b) => b.d.updatedAt.localeCompare(a.d.updatedAt)).slice(0, 8);
    return { rows, byCurrency: [...byCurrency.entries()].sort((a, b) => b[1].value - a[1].value), recent };
  }, [docs, payments, status, from, to]);

  if (!data || !settings) return <Loading />;
  const empty = (docs?.length ?? 0) === 0;
  const primary = data.byCurrency[0];
  const cur = primary?.[0] ?? settings.defaultCurrency;
  const m = primary?.[1] ?? { value: 0, paid: 0, outstanding: 0, overdue: 0, count: 0 };

  const cards = [
    { label: 'Total documents', value: String(data.rows.length), icon: Files, tone: 'text-slate-700' },
    { label: 'Invoice value', value: formatMoney(m.value, cur), icon: FileText, tone: 'text-brand-800' },
    { label: 'Paid amount', value: formatMoney(m.paid, cur), icon: CheckCircle2, tone: 'text-emerald-700' },
    { label: 'Outstanding balance', value: formatMoney(m.outstanding, cur), icon: Wallet, tone: 'text-amber-700' },
    { label: 'Overdue amount', value: formatMoney(m.overdue, cur), icon: AlertTriangle, tone: 'text-red-700' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Calculated from records saved in this browser." actions={
        <>
          <Link className="btn-primary" to="/d/invoice/new"><FilePlus2 size={15} /> Create Invoice</Link>
          <Link className="btn-secondary" to="/d/quotation/new"><FileText size={15} /> Create Quotation</Link>
          <button className="btn-secondary" onClick={() => setPayOpen(true)}><Receipt size={15} /> Record Payment</button>
          <Link className="btn-secondary" to="/clients?new=1"><UserPlus size={15} /> Add Client</Link>
        </>
      } />

      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="d-status">Status</label>
          <select id="d-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="d-from">From date</label><input id="d-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="d-to">To date</label><input id="d-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">{label}<Icon size={16} className={tone} /></div>
            <div className={`mt-2 truncate text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>
      <p className="mb-5 text-xs text-slate-500">
        Money totals cover finalised, non-cancelled invoices in {cur}.
        {data.byCurrency.length > 1 && ' Other currencies: ' + data.byCurrency.slice(1).map(([c, v]) => `${c} — value ${formatMoney(v.value, c)}, outstanding ${formatMoney(v.outstanding, c)}`).join('; ') + '.'}
      </p>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Recent documents</h2>
            <Link to="/history" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>
          </div>
          {empty ? (
            <EmptyState icon={<FileText size={40} />} title="No documents yet" text="Set up your company profile, then create your first invoice or quotation. Nothing is pre-filled with sample data."
              action={<Link className="btn-primary" to="/d/invoice/new">Create your first invoice</Link>} />
          ) : data.recent.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No documents match the selected filters.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map(({ d, totals, status: s }) => (
                <li key={d.id}>
                  <Link to={`/d/${d.type}/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{d.number} <span className="font-normal text-slate-500">· {DOC_META[d.type].label}</span></div>
                      <div className="truncate text-xs text-slate-500">{d.client.name || '—'} · {formatDate(d.issueDate)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                      <span className="text-sm font-medium tabular-nums">{formatMoney(totals.grandTotalMinor, d.currency)}</span>
                      <StatusBadge status={s} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Database size={15} /> Local data</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Documents</dt><dd className="text-right">{docs?.length ?? 0}</dd>
            <dt className="text-slate-500">Payments</dt><dd className="text-right">{payments?.length ?? 0}</dd>
            <dt className="text-slate-500">Clients</dt><dd className="text-right">{clients?.length ?? 0}</dd>
            <dt className="text-slate-500">Services</dt><dd className="text-right">{services?.length ?? 0}</dd>
            <dt className="text-slate-500">Last backup</dt><dd className="text-right">{settings.lastBackupAt ? formatDate(settings.lastBackupAt.slice(0, 10)) : 'Never'}</dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Data is stored only in this browser on this device and is not synced. Clearing site data or using private browsing can remove it.
          </p>
          <Link to="/settings?tab=backup" className="btn-secondary btn-sm mt-3">Back up data</Link>
        </section>
      </div>
      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} />
    </div>
  );
}
