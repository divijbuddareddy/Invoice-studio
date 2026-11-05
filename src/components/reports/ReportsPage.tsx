import { useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { useDocuments, usePayments, useSettings } from '../../services/storage/db';
import { buildReport, documentsCsv, lineItemsCsv, paymentsCsv, reportDocuments, summaryCsv, type Bucket } from '../../features/reports/reports';
import { csvBlob, type Cell } from '../../utils/csv';
import { formatMoney } from '../../utils/money';
import { downloadBlob, todayStr } from '../../utils/misc';
import { EmptyState, Loading, PageHeader, Section } from '../ui';

function fyStart(today = todayStr()): string {
  // Indian financial year starts 1 April.
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'This month', range: () => [`${todayStr().slice(0, 7)}-01`, todayStr()] },
  {
    label: 'Last month',
    range: () => {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return [todayStr(first), todayStr(last)];
    },
  },
  { label: 'This financial year (Apr–Mar)', range: () => [fyStart(), todayStr()] },
  { label: 'Calendar year', range: () => [`${todayStr().slice(0, 4)}-01-01`, todayStr()] },
  { label: 'All time', range: () => ['', ''] },
];

export default function ReportsPage() {
  const docs = useDocuments();
  const payments = usePayments();
  const settings = useSettings();
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(todayStr());
  const [currencyPick, setCurrency] = useState('');

  const currencies = useMemo(() => [...new Set((docs ?? []).map((d) => d.currency))].sort(), [docs]);
  const currency = currencyPick || (currencies.includes(settings?.defaultCurrency ?? '') ? settings!.defaultCurrency : currencies[0]) || settings?.defaultCurrency || 'INR';
  const filter = { from, to, currency };
  const report = useMemo(() => (docs && payments ? buildReport(docs, payments, { from, to, currency }) : null), [docs, payments, from, to, currency]);

  if (!docs || !payments || !settings || !report) return <Loading />;
  const f = (m: number) => formatMoney(m, currency);
  const range = `${from || 'start'}_to_${to || todayStr()}`;
  const exportCsv = (name: string, rows: Cell[][]) => downloadBlob(csvBlob(rows), `${name}_${currency}_${range}.csv`);
  const inScope = reportDocuments(docs, payments, filter).map((x) => x.d);
  const paymentsInScope = payments.filter((p) => p.currency === currency && (!from || p.date >= from) && (!to || p.date <= to));
  const hasGst = report.invoices.cgstMinor + report.invoices.sgstMinor + report.invoices.igstMinor > 0;

  const cards = [
    ['Invoiced (incl. tax)', f(report.invoices.totalMinor), `${report.invoices.count} invoice(s)`],
    ['Taxable value', f(report.invoices.taxableMinor), 'after discounts'],
    ['Tax charged', f(report.invoices.cgstMinor + report.invoices.sgstMinor + report.invoices.igstMinor + report.invoices.otherTaxMinor), hasGst ? 'CGST + SGST + IGST' : 'all taxes'],
    ['Received in period', f(report.receivedMinor), `${paymentsInScope.length} payment(s)`],
    ['Outstanding', f(report.invoices.outstandingMinor), 'on these invoices'],
    ['Net after notes', f(report.netMinor), `−${f(report.creditNotesMinor)} credit · +${f(report.debitNotesMinor)} debit`],
  ];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Sales and tax summaries from finalised, non-cancelled documents. Export CSV for Excel, Google Sheets or your accountant." />

      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label className="label" htmlFor="rp-preset">Period</label>
          <select id="rp-preset" className="input" value="" onChange={(e) => { const p = PRESETS[Number(e.target.value)]; if (p) { const [a, b] = p.range(); setFrom(a); setTo(b); } }}>
            <option value="">Quick select…</option>
            {PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="rp-from">From</label><input id="rp-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="rp-to">To</label><input id="rp-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor="rp-cur">Currency</label>
          <select id="rp-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {(currencies.length ? currencies : [currency]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {inScope.length === 0 && paymentsInScope.length === 0 ? (
        <div className="card"><EmptyState icon={<BarChart3 size={40} />} title="Nothing to report for this period" text="Finalised documents dated within the selected period and currency appear here. Drafts and cancelled documents are excluded." /></div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value, hint]) => (
              <div key={label} className="card p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-1 truncate text-xl font-semibold tabular-nums text-slate-900">{value}</div>
                <div className="truncate text-xs text-slate-500">{hint}</div>
              </div>
            ))}
          </div>

          <Section title="Export (CSV)">
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => exportCsv('summary', summaryCsv(report))}><FileSpreadsheet size={15} /> Summary report</button>
              <button className="btn-secondary" onClick={() => exportCsv('documents', documentsCsv(inScope, payments))}><Download size={15} /> Documents ({inScope.length})</button>
              <button className="btn-secondary" onClick={() => exportCsv('line_items', lineItemsCsv(inScope, payments))}><Download size={15} /> Line items (HSN/SAC-wise)</button>
              <button className="btn-secondary" onClick={() => exportCsv('payments', paymentsCsv(paymentsInScope, docs))}><Download size={15} /> Payments ({paymentsInScope.length})</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">CSV files open in Excel and Google Sheets. Amounts are plain numbers in {currency}. Files are created in your browser — nothing is uploaded.</p>
          </Section>

          <BucketTable title="Monthly summary (invoices)" first="Month" rows={report.byMonth} f={f} extra={{ head: 'Received', cell: (b) => f((b as Bucket & { receivedMinor: number }).receivedMinor) }} total={{ ...report.invoices, receivedMinor: report.receivedMinor } as Bucket} />
          <BucketTable title={hasGst ? 'GST rate-wise summary (invoices)' : 'Tax rate-wise summary (invoices)'} first="Rate" rows={report.byRate} f={f} taxOnly
            note="Helper for GSTR-1/3B preparation — verify against your books and official requirements before filing." />
          <BucketTable title="By client (invoices)" first="Client" rows={report.byClient} f={f} />
        </div>
      )}
    </div>
  );
}

function BucketTable({ title, first, rows, f, extra, total, taxOnly, note }: {
  title: string; first: string; rows: Bucket[]; f: (m: number) => string; total?: Bucket; taxOnly?: boolean; note?: string;
  extra?: { head: string; cell: (b: Bucket) => string };
}) {
  if (rows.length === 0) return null;
  const showOther = rows.some((r) => r.otherTaxMinor);
  const showGst = rows.some((r) => r.cgstMinor || r.sgstMinor || r.igstMinor);
  const Cells = ({ b }: { b: Bucket }) => (
    <>
      {!taxOnly && <td className="text-right">{b.count}</td>}
      <td className="text-right tabular-nums">{f(b.taxableMinor)}</td>
      {showGst && <><td className="text-right tabular-nums">{f(b.cgstMinor)}</td><td className="text-right tabular-nums">{f(b.sgstMinor)}</td><td className="text-right tabular-nums">{f(b.igstMinor)}</td></>}
      {showOther && <td className="text-right tabular-nums">{f(b.otherTaxMinor)}</td>}
      {!taxOnly && <><td className="text-right tabular-nums">{f(b.totalMinor)}</td><td className="text-right tabular-nums">{f(b.paidMinor)}</td><td className="text-right tabular-nums">{f(b.outstandingMinor)}</td></>}
      {extra && <td className="text-right tabular-nums">{extra.cell(b)}</td>}
    </>
  );
  return (
    <Section title={title}>
      <div className="-mx-4 overflow-x-auto">
        <table className="table-basic whitespace-nowrap">
          <thead>
            <tr>
              <th>{first}</th>
              {!taxOnly && <th className="text-right">Invoices</th>}
              <th className="text-right">Taxable</th>
              {showGst && <><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th></>}
              {showOther && <th className="text-right">Other tax</th>}
              {!taxOnly && <><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th></>}
              {extra && <th className="text-right">{extra.head}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => <tr key={b.key}><td className="max-w-[220px] truncate font-medium">{b.label}</td><Cells b={b} /></tr>)}
            {total && rows.length > 1 && <tr className="font-semibold"><td>Total</td><Cells b={total} /></tr>}
          </tbody>
        </table>
      </div>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </Section>
  );
}
