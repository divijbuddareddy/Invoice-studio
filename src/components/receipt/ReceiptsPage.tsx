import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Printer, Receipt, Search, Share2 } from 'lucide-react';
import type { DocumentRecord, Payment } from '../../types';
import ShareDialog from '../documents/ShareDialog';
import { PAYMENT_METHOD_LABEL } from '../../services/domain';
import { useDocuments, usePayments } from '../../services/storage/db';
import { formatMoney, toMinor } from '../../utils/money';
import { formatDate } from '../../utils/misc';
import { EmptyState, Loading, PageHeader } from '../ui';
import PaymentDialog from './PaymentDialog';
import { usePdfExport } from '../documents/usePdfExport';

export default function ReceiptsPage() {
  const payments = usePayments();
  const docs = useDocuments();
  const { exportReceipt } = usePdfExport();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [share, setShare] = useState<{ p: Payment; inv: DocumentRecord } | null>(null);

  const rows = useMemo(() => {
    const byId = new Map((docs ?? []).map((d) => [d.id, d]));
    const needle = q.trim().toLowerCase();
    return (payments ?? [])
      .map((p) => ({ p, inv: byId.get(p.documentId) }))
      .filter(({ p, inv }) => !needle || [p.receiptNumber, p.reference, inv?.number ?? '', inv?.client.name ?? ''].some((f) => f.toLowerCase().includes(needle)))
      .sort((a, b) => b.p.date.localeCompare(a.p.date) || b.p.createdAt.localeCompare(a.p.createdAt));
  }, [payments, docs, q]);

  if (!payments || !docs) return <Loading />;

  return (
    <div>
      <PageHeader title="Payment Receipts" subtitle="Record a payment against an invoice and generate a receipt PDF." actions={
        <button className="btn-primary" onClick={() => setOpen(true)}><Receipt size={15} /> Record payment</button>
      } />
      <div className="card mb-4 p-3">
        <label className="label" htmlFor="r-search">Search receipts</label>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input id="r-search" className="input pl-8" placeholder="Receipt no., reference, invoice or client" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Receipt size={40} />} title={q ? 'No matching receipts' : 'No payments recorded yet'} text="Record a payment against a finalised invoice to generate a receipt." />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th>Receipt</th><th>Date</th><th className="hidden sm:table-cell">Invoice</th><th className="hidden md:table-cell">Method</th><th className="text-right">Amount</th><th className="sr-only">Actions</th></tr></thead>
            <tbody>
              {rows.map(({ p, inv }) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.receiptNumber}<div className="text-xs font-normal text-slate-500">{inv?.client.name}</div></td>
                  <td className="whitespace-nowrap">{formatDate(p.date)}</td>
                  <td className="hidden sm:table-cell">{inv ? <Link className="text-brand-700 hover:underline" to={`/d/invoice/${inv.id}`}>{inv.number}</Link> : <span className="text-slate-400">deleted</span>}</td>
                  <td className="hidden md:table-cell">{p.method === 'custom' ? p.customMethod : PAYMENT_METHOD_LABEL[p.method]}{p.reference && <div className="text-xs text-slate-500">{p.reference}</div>}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(toMinor(p.amount, p.currency), p.currency)}</td>
                  <td className="whitespace-nowrap text-right">
                    {inv && (
                      <>
                        <button className="btn-ghost btn-sm" onClick={() => exportReceipt(p, inv, payments, 'download')} aria-label={`Download receipt ${p.receiptNumber}`}><Download size={14} /></button>
                        <button className="btn-ghost btn-sm" onClick={() => exportReceipt(p, inv, payments, 'print')} aria-label={`Print receipt ${p.receiptNumber}`}><Printer size={14} /></button>
                        <button className="btn-ghost btn-sm" onClick={() => setShare({ p, inv })} aria-label={`Share receipt ${p.receiptNumber}`}><Share2 size={14} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaymentDialog open={open} onClose={() => setOpen(false)} />
      {share && <ShareDialog open onClose={() => setShare(null)} doc={share.inv} payments={payments} receipt={share.p} />}
    </div>
  );
}
