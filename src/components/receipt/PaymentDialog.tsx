import { useEffect, useMemo, useState } from 'react';
import type { DocumentRecord, Payment, PaymentMethod } from '../../types';
import { PAYMENT_METHOD_LABEL } from '../../services/domain';
import { useDocuments, usePayments } from '../../services/storage/db';
import { docSummary, validatePayment } from '../../features/payments/payments';
import { nextReceiptNumber, recordPayment } from '../../features/documents/actions';
import { formatMoney, fromMinor } from '../../utils/money';
import { todayStr } from '../../utils/misc';
import { Modal, NumberInput, Select, TextArea, TextInput, useAction } from '../ui';
import { usePdfExport } from '../documents/usePdfExport';

export default function PaymentDialog({ open, onClose, invoice }: { open: boolean; onClose: () => void; invoice?: DocumentRecord }) {
  const docs = useDocuments();
  const payments = usePayments();
  const run = useAction();
  const { exportReceipt } = usePdfExport();
  const [docId, setDocId] = useState(invoice?.id ?? '');
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('bank');
  const [customMethod, setCustomMethod] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Payment | null>(null);

  const payable = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => d.type === 'invoice' && !d.archived && d.status !== 'draft' && d.status !== 'cancelled')
        .map((d) => ({ d, ...docSummary(d, payments ?? []) }))
        .filter((x) => x.totals.balanceMinor > 0 && x.status !== 'cancelled'),
    [docs, payments],
  );
  const current = payable.find((x) => x.d.id === docId);

  useEffect(() => {
    if (!open) return;
    setDocId(invoice?.id ?? '');
    setDate(todayStr());
    setMethod('bank');
    setCustomMethod('');
    setReference('');
    setNotes('');
    setError('');
    setSaved(null);
    nextReceiptNumber().then(setReceiptNumber);
  }, [open, invoice?.id]);

  useEffect(() => {
    if (current) setAmount(fromMinor(current.totals.balanceMinor, current.d.currency));
    // only when the selected invoice changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, open]);

  const submit = async () => {
    if (!current) return setError('Select an invoice with an outstanding balance.');
    const err = validatePayment(amount, current.totals.balanceMinor, current.d.currency);
    if (err) return setError(err);
    if (!receiptNumber.trim()) return setError('Enter a receipt number.');
    if (method === 'custom' && !customMethod.trim()) return setError('Describe the custom payment method.');
    const p = await run(
      () => recordPayment({ documentId: current.d.id, receiptNumber: receiptNumber.trim(), date, amount, currency: current.d.currency, method, customMethod, reference, notes }, current.d),
      'Payment recorded',
    );
    if (p) setSaved(p);
  };

  if (saved) {
    const inv = (docs ?? []).find((d) => d.id === saved.documentId);
    return (
      <Modal open={open} title="Payment recorded" onClose={onClose}
        footer={<>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {inv && <button className="btn-primary" onClick={() => exportReceipt(saved, inv, [...(payments ?? []).filter((p) => p.id !== saved.id), saved], 'download')}>Download receipt PDF</button>}
        </>}>
        <p className="text-sm text-slate-700">Receipt <strong>{saved.receiptNumber}</strong> for {saved.currency} {saved.amount} was recorded against {inv?.number}. The invoice status updates automatically.</p>
        <p className="mt-2 text-xs text-slate-500">Payment records are entered by you and are not verified with any bank.</p>
      </Modal>
    );
  }

  return (
    <Modal open={open} title="Record payment" onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={!current}>Record payment</button>
      </>}>
      {payable.length === 0 && !invoice ? (
        <p className="text-sm text-slate-600">There are no finalised invoices with an outstanding balance. Finalise an invoice first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select wrapClass="sm:col-span-2" label="Invoice" value={docId} onChange={(e) => setDocId(e.target.value)} disabled={!!invoice}
            options={[{ value: '', label: '— Select invoice —' }, ...payable.map((x) => ({ value: x.d.id, label: `${x.d.number} · ${x.d.client.name} · balance ${formatMoney(x.totals.balanceMinor, x.d.currency)}` }))]} />
          {current && (
            <p className="text-xs text-slate-600 sm:col-span-2">
              Total {formatMoney(current.totals.grandTotalMinor, current.d.currency)} · Paid {formatMoney(current.totals.paidMinor, current.d.currency)} · <strong>Outstanding {formatMoney(current.totals.balanceMinor, current.d.currency)}</strong>
            </p>
          )}
          <TextInput label="Payment date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <NumberInput label={`Amount${current ? ` (${current.d.currency})` : ''}`} value={amount} onChange={setAmount} />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          {method === 'custom' ? <TextInput label="Custom method" value={customMethod} onChange={(e) => setCustomMethod(e.target.value)} maxLength={100} /> : <div className="hidden sm:block" />}
          <TextInput label="Transaction / reference no." value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
          <TextInput label="Receipt number" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} maxLength={100} />
          <TextArea wrapClass="sm:col-span-2" label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{error}</p>}
          <p className="text-xs text-slate-500 sm:col-span-2">Do not store card numbers or passwords here. Payments are user-entered and not bank-verified.</p>
        </div>
      )}
    </Modal>
  );
}
