import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Archive, ArchiveRestore, Copy, Download, FileMinus, FilePlus, Pencil, Printer, Receipt, Repeat, Trash2, ArrowRightLeft, ShieldAlert, Share2,
} from 'lucide-react';
import ShareDialog from './ShareDialog';
import type { Payment } from '../../types';
import type { DocStatus, DocumentRecord, Frequency } from '../../types';
import { DOC_META, FREQUENCY_LABEL, PAYMENT_METHOD_LABEL, STATUS_LABEL, documentTitle } from '../../services/domain';
import { buildDocumentPdf } from '../../services/pdf/pdf';
import { deleteDocument, putRecurrence, useDocument, useDocuments, usePayments, useRecurrences, useSettings } from '../../services/storage/db';
import { convertToInvoice, duplicateDocument, noteFromInvoice, overrideStatus, removePayment, saveDocument, setStatus } from '../../features/documents/actions';
import { docSummary, paymentsFor } from '../../features/payments/payments';
import { formatMoney, toMinor } from '../../utils/money';
import { addressLines, formatDate, nowIso, todayStr, uid } from '../../utils/misc';
import { EmptyState, Loading, Modal, Section, Select, StatusBadge, TextInput, useAction, useConfirm } from '../ui';
import TotalsSummary from './TotalsSummary';
import PdfPreview from './PdfPreview';
import PaymentDialog from '../receipt/PaymentDialog';
import { usePdfExport } from './usePdfExport';

const MANUAL_STATUSES: Record<string, DocStatus[]> = {
  quotation: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
  proforma: ['draft', 'issued', 'paid', 'cancelled'],
  'credit-note': ['draft', 'issued', 'cancelled'],
  'debit-note': ['draft', 'issued', 'cancelled'],
  'purchase-order': ['draft', 'issued', 'fulfilled', 'cancelled'],
};

export default function DocumentView({ id }: { id: string }) {
  const doc = useDocument(id);
  const payments = usePayments();
  const allDocs = useDocuments();
  const recurrences = useRecurrences();
  const settings = useSettings();
  const navigate = useNavigate();
  const run = useAction();
  const confirm = useConfirm();
  const { exportDoc, exportReceipt } = usePdfExport();
  const [payOpen, setPayOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [recurOpen, setRecurOpen] = useState(false);
  const [share, setShare] = useState<{ receipt?: Payment } | null>(null);

  const docPayments = useMemo(() => (doc ? paymentsFor(doc.id, payments ?? []) : []), [doc, payments]);
  const summary = useMemo(() => (doc ? docSummary(doc, payments ?? []) : null), [doc, payments]);

  if (doc === undefined && allDocs === undefined) return <Loading />;
  if (!doc) return <EmptyState title="Document not found" text="It may have been deleted." action={<Link to="/history" className="btn-primary">Open history</Link>} />;
  if (!summary || !settings) return <Loading />;

  const meta = DOC_META[doc.type];
  const { totals, status } = summary;
  const linked = (allDocs ?? []).filter((d) => d.referenceId === doc.id || d.id === doc.referenceId || d.id === doc.convertedToId);
  const rule = (recurrences ?? []).find((r) => r.sourceDocumentId === doc.id);

  const edit = async () => {
    if (doc.status === 'draft') return navigate(`/d/${doc.type}/${doc.id}/edit`);
    const revised = await confirm({
      title: 'Edit a finalised document',
      message: (
        <>
          <p><strong>{doc.number}</strong> is finalised. Choose how to proceed:</p>
          <ul className="mt-2 list-disc pl-5 text-slate-600">
            <li><strong>Create revised copy</strong> (recommended) — keeps the original unchanged and opens a new draft.</li>
            <li>Cancel, then use <em>Edit this record</em> below if you really need to change the stored document.</li>
          </ul>
        </>
      ),
      confirmLabel: 'Create revised copy',
    });
    if (revised) {
      const copy = await run(async () => saveDocument(await duplicateDocument(doc)), 'Revised copy created as a draft');
      if (copy) navigate(`/d/${doc.type}/${copy.id}/edit`);
    }
  };

  const remove = async () => {
    const extra = docPayments.length ? ` Its ${docPayments.length} recorded payment(s) and receipts will also be deleted.` : '';
    const linkNote = linked.length ? ' Other documents reference it; consider archiving instead to preserve history.' : '';
    const ok = await confirm({ title: `Delete ${meta.label.toLowerCase()} ${doc.number}?`, message: `This permanently removes the record from this browser.${extra}${linkNote}`, confirmLabel: 'Delete permanently', danger: true });
    if (!ok) return;
    const r = await run(() => deleteDocument(doc.id), 'Document deleted');
    if (r !== undefined) navigate(`/d/${doc.type}`);
  };

  const changeStatus = async (s: DocStatus) => {
    if (s === 'cancelled' && !(await confirm({ title: 'Cancel / void this document?', message: 'The document stays in your history marked Cancelled/Void.', confirmLabel: 'Mark as cancelled', danger: true }))) return;
    await run(() => setStatus(doc, s), `Marked as ${STATUS_LABEL[s]}`);
  };

  const convert = async () => {
    const inv = await run(() => convertToInvoice(doc), 'Invoice draft created');
    if (inv) navigate(`/d/invoice/${inv.id}/edit`);
  };

  const makeNote = async (t: 'credit-note' | 'debit-note') => {
    const note = await run(async () => saveDocument(await noteFromInvoice(doc, t)), `${DOC_META[t].label} draft created`);
    if (note) navigate(`/d/${t}/${note.id}/edit`);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link to={`/d/${doc.type}`} className="btn-ghost btn-sm"><ArrowLeft size={14} /> {meta.plural}</Link>
        <h1 className="text-xl font-semibold text-slate-900">{documentTitle(doc)} {doc.number}</h1>
        <StatusBadge status={status} />
        {doc.archived && <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Archived</span>}
        {doc.statusOverride && <span className="text-xs text-amber-700">(manual status)</span>}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => exportDoc(doc, payments ?? [], 'download')}><Download size={15} /> Download PDF</button>
        <button className="btn-secondary" onClick={() => exportDoc(doc, payments ?? [], 'print')}><Printer size={15} /> Print</button>
        <button className="btn-secondary" onClick={() => setShare({})}><Share2 size={15} /> Share</button>
        <button className="btn-secondary" onClick={edit}><Pencil size={15} /> {doc.status === 'draft' ? 'Edit draft' : 'Revise'}</button>
        {doc.status !== 'draft' && <Link className="btn-ghost" to={`/d/${doc.type}/${doc.id}/edit`}><Pencil size={15} /> Edit this record</Link>}
        <button className="btn-secondary" onClick={async () => {
          const copy = await run(async () => saveDocument(await duplicateDocument(doc)), 'Duplicate created');
          if (copy) navigate(`/d/${doc.type}/${copy.id}/edit`);
        }}><Copy size={15} /> Duplicate</button>
        {doc.type === 'invoice' && doc.status !== 'draft' && status !== 'cancelled' && totals.balanceMinor > 0 && (
          <button className="btn-secondary" onClick={() => setPayOpen(true)}><Receipt size={15} /> Record payment</button>
        )}
        {(doc.type === 'quotation' || doc.type === 'proforma') && !doc.convertedToId && (
          <button className="btn-secondary" onClick={convert}><ArrowRightLeft size={15} /> Convert to invoice</button>
        )}
        {doc.type === 'invoice' && doc.status !== 'draft' && (
          <>
            <button className="btn-secondary" onClick={() => makeNote('credit-note')}><FileMinus size={15} /> Credit note</button>
            <button className="btn-secondary" onClick={() => makeNote('debit-note')}><FilePlus size={15} /> Debit note</button>
            <button className="btn-secondary" onClick={() => setRecurOpen(true)}><Repeat size={15} /> {rule ? 'Edit recurrence' : 'Make recurring'}</button>
          </>
        )}
        <button className="btn-ghost" onClick={() => run(() => saveDocument({ ...doc, archived: !doc.archived }, doc.archived ? 'Unarchived' : 'Archived'), doc.archived ? 'Restored from archive' : 'Archived')}>
          {doc.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} {doc.archived ? 'Unarchive' : 'Archive'}
        </button>
        <button className="btn-ghost text-red-600" onClick={remove}><Trash2 size={15} /> Delete</button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Section title="Summary">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">{meta.partyLabel}</dt><dd className="font-medium">{doc.client.name || '—'}</dd>
              <dt className="text-slate-500">Date</dt><dd>{formatDate(doc.issueDate)}</dd>
              {meta.dueLabel && <><dt className="text-slate-500">{meta.dueLabel}</dt><dd>{formatDate(doc.dueDate) || '—'}</dd></>}
              <dt className="text-slate-500">Currency</dt><dd>{doc.currency}</dd>
              {doc.projectName && <><dt className="text-slate-500">Project</dt><dd>{doc.projectName}</dd></>}
              {doc.referenceNumber && <><dt className="text-slate-500">{doc.type === 'invoice' ? 'Converted from' : 'Original invoice'}</dt><dd>{doc.referenceNumber}</dd></>}
              <dt className="text-slate-500">Address</dt><dd className="text-slate-600">{addressLines(doc.client.billingAddress).join(', ') || '—'}</dd>
            </dl>
          </Section>

          <Section title="Totals"><TotalsSummary totals={totals} showPaid={doc.type === 'invoice' || doc.type === 'proforma'} /></Section>

          <Section title="Status" actions={
            doc.type === 'invoice' && doc.status !== 'draft' ? <button className="btn-ghost btn-sm" onClick={() => setOverrideOpen(true)}><ShieldAlert size={14} /> Manual override</button> : null
          }>
            {doc.type === 'invoice' ? (
              <div className="space-y-2 text-sm text-slate-600">
                <p>Invoice status is calculated from recorded payments and the due date.</p>
                {doc.status === 'draft' && <p>This invoice is a draft. Open it and choose <em>Save &amp; finalise</em> to issue it.</p>}
                {doc.status !== 'draft' && doc.status !== 'cancelled' && <button className="btn-secondary btn-sm" onClick={() => changeStatus('cancelled')}>Mark as cancelled / void</button>}
                {doc.status === 'cancelled' && <button className="btn-secondary btn-sm" onClick={() => changeStatus('unpaid')}>Reinstate invoice</button>}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {MANUAL_STATUSES[doc.type].filter((s) => s !== doc.status).map((s) => (
                  <button key={s} className="btn-secondary btn-sm" onClick={() => changeStatus(s)}>Mark {STATUS_LABEL[s]}</button>
                ))}
              </div>
            )}
          </Section>

          {doc.type === 'invoice' && (
            <Section title={`Payments (${docPayments.length})`}>
              {docPayments.length === 0 ? (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-basic">
                    <thead><tr><th>Receipt</th><th>Date</th><th>Method</th><th className="text-right">Amount</th><th /></tr></thead>
                    <tbody>
                      {docPayments.map((p) => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.receiptNumber}<div className="text-xs text-slate-500">{p.reference}</div></td>
                          <td>{formatDate(p.date)}</td>
                          <td>{p.method === 'custom' ? p.customMethod : PAYMENT_METHOD_LABEL[p.method]}</td>
                          <td className="text-right tabular-nums">{formatMoney(toMinor(p.amount, p.currency), p.currency)}</td>
                          <td className="whitespace-nowrap text-right">
                            <button className="btn-ghost btn-sm" onClick={() => exportReceipt(p, doc, payments ?? [], 'download')} aria-label={`Download receipt ${p.receiptNumber}`}><Download size={14} /></button>
                            <button className="btn-ghost btn-sm" onClick={() => setShare({ receipt: p })} aria-label={`Share receipt ${p.receiptNumber}`}><Share2 size={14} /></button>
                            <button className="btn-ghost btn-sm text-red-600" aria-label={`Delete payment ${p.receiptNumber}`} onClick={async () => {
                              if (await confirm({ title: 'Delete payment?', message: `Remove payment ${p.receiptNumber}? The invoice balance will be recalculated.`, confirmLabel: 'Delete', danger: true }))
                                run(() => removePayment(p), 'Payment deleted');
                            }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

          {linked.length > 0 && (
            <Section title="Linked documents">
              <ul className="space-y-1 text-sm">
                {linked.map((l) => (
                  <li key={l.id}><Link className="text-brand-700 underline" to={`/d/${l.type}/${l.id}`}>{DOC_META[l.type].label} {l.number}</Link> <span className="text-slate-500">· {l.client.name}</span></li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="History">
            <ul className="space-y-1 text-xs text-slate-600">
              {[...doc.audit].reverse().map((a, i) => (
                <li key={i}><span className="text-slate-400">{new Date(a.at).toLocaleString()}</span> — {a.message}</li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="min-w-0">
          <div className="card sticky top-4 p-3 xl:h-[calc(100vh-2rem)]">
            <PdfPreview build={() => buildDocumentPdf(doc, payments ?? [], settings.branding)} deps={[doc, payments, settings.branding]} branding={settings.branding} />
          </div>
        </div>
      </div>

      <PaymentDialog open={payOpen} onClose={() => setPayOpen(false)} invoice={doc} />
      <OverrideDialog open={overrideOpen} onClose={() => setOverrideOpen(false)} doc={doc} />
      <RecurrenceDialog open={recurOpen} onClose={() => setRecurOpen(false)} doc={doc} />
      <ShareDialog open={!!share} onClose={() => setShare(null)} doc={doc} payments={payments ?? []} receipt={share?.receipt} />
    </div>
  );
}

function OverrideDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: DocumentRecord }) {
  const [status, setStatusVal] = useState<string>(doc.statusOverride ?? '');
  const [reason, setReason] = useState('');
  const run = useAction();
  const options: DocStatus[] = ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'];
  return (
    <Modal open={open} title="Manual status override" onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" disabled={!!status && !reason.trim()} onClick={async () => {
        await run(() => overrideStatus(doc, (status || null) as DocStatus | null, reason.trim()), status ? 'Status overridden' : 'Automatic status restored');
        onClose();
      }}>Apply</button>
    </>}>
      <p className="mb-3 text-sm text-slate-600">Overrides replace the status calculated from payments and the due date. A note is added to the document history.</p>
      <div className="grid gap-3">
        <Select label="Status" value={status} onChange={(e) => setStatusVal(e.target.value)} options={[{ value: '', label: 'Automatic (recommended)' }, ...options.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        {status && <TextInput label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Settled offline, written off" />}
      </div>
    </Modal>
  );
}

function RecurrenceDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: DocumentRecord }) {
  const recurrences = useRecurrences();
  const existing = (recurrences ?? []).find((r) => r.sourceDocumentId === doc.id);
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayStr());
  const [nextDate, setNextDate] = useState(existing?.nextDate ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [error, setError] = useState('');
  const run = useAction();
  const navigate = useNavigate();
  return (
    <Modal open={open} title="Recurring invoice" onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={async () => {
        const next = nextDate || startDate;
        if (!startDate) return setError('Choose a start date.');
        if (endDate && endDate < next) return setError('End date must be on or after the next invoice date.');
        const t = nowIso();
        await run(() => putRecurrence({
          id: existing?.id ?? uid(), sourceDocumentId: doc.id, frequency, startDate, endDate, nextDate: next,
          lastGeneratedPeriod: existing?.lastGeneratedPeriod ?? '', active: true, createdAt: existing?.createdAt ?? t, updatedAt: t,
        }), 'Recurring schedule saved');
        onClose();
        navigate('/recurring');
      }}>Save schedule</button>
    </>}>
      <p className="mb-3 text-sm text-slate-600">
        New draft invoices based on <strong>{doc.number}</strong> are offered when you open the app on or after each due date. Nothing is sent or charged automatically.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} options={Object.entries(FREQUENCY_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        <TextInput label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <TextInput label="Next invoice date" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} hint="Defaults to the start date." />
        <TextInput label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    </Modal>
  );
}
