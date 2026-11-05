import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Share2 } from 'lucide-react';
import type { DocumentRecord, Payment } from '../../types';
import { DOC_META, documentTitle } from '../../services/domain';
import { docSummary } from '../../features/payments/payments';
import { downloadPdf, type PdfResult } from '../../services/pdf/pdf';
import { canShareFiles, mailtoUrl, shareFile, waPhone, whatsappUrl } from '../../utils/share';
import { formatMoney, toMinor } from '../../utils/money';
import { formatDate } from '../../utils/misc';
import { Modal, TextArea, TextInput, useToast } from '../ui';
import { usePdfExport } from './usePdfExport';

function defaultMessage(doc: DocumentRecord, payments: Payment[], receipt?: Payment): string {
  const { totals } = docSummary(doc, payments);
  const name = doc.client.contactPerson || doc.client.name || 'there';
  const from = doc.companySnapshot.legalName || 'us';
  if (receipt) {
    return `Dear ${name},\n\nThank you for your payment of ${formatMoney(toMinor(receipt.amount, receipt.currency), receipt.currency)} against invoice ${doc.number}. Please find receipt ${receipt.receiptNumber} attached.\n\nRegards,\n${from}`;
  }
  const label = DOC_META[doc.type].label.toLowerCase();
  let line = `Please find ${label} ${doc.number} attached for ${formatMoney(totals.grandTotalMinor, doc.currency)}.`;
  if (doc.type === 'invoice' && totals.balanceMinor > 0) {
    line = `Please find invoice ${doc.number} attached. Amount due: ${formatMoney(totals.balanceMinor, doc.currency)}${doc.dueDate ? `, due by ${formatDate(doc.dueDate)}` : ''}.`;
  }
  if (doc.type === 'quotation' && doc.dueDate) line += ` This quotation is valid until ${formatDate(doc.dueDate)}.`;
  return `Dear ${name},\n\n${line}\n\nRegards,\n${from}`;
}

/**
 * Share a document or receipt without any server:
 *  - system share sheet with the PDF attached (most phones, some desktops)
 *  - your email app via mailto: (PDF is downloaded so you can attach it)
 *  - WhatsApp (wa.me link; nothing is sent until you press send in WhatsApp)
 */
export default function ShareDialog({ open, onClose, doc, payments, receipt }: {
  open: boolean; onClose: () => void; doc: DocumentRecord; payments: Payment[]; receipt?: Payment;
}) {
  const toast = useToast();
  const { prepareDoc, prepareReceipt } = usePdfExport();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const nativeShare = canShareFiles();
  const subject = receipt
    ? `Payment receipt ${receipt.receiptNumber} — ${doc.companySnapshot.legalName}`
    : `${documentTitle(doc).replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase())} ${doc.number} — ${doc.companySnapshot.legalName}`;

  useEffect(() => {
    if (!open) return;
    setEmail(doc.client.email);
    setPhone(doc.client.phone);
    setMessage(defaultMessage(doc, payments, receipt));
  }, [open, doc, payments, receipt]);

  const build = async (): Promise<PdfResult | null> => {
    setBusy(true);
    try {
      return receipt ? await prepareReceipt(receipt, doc, payments) : await prepareDoc(doc, payments);
    } finally {
      setBusy(false);
    }
  };

  const viaSheet = async () => {
    const r = await build();
    if (!r) return;
    const out = await shareFile(r.pdf.output('blob'), r.filename, subject, message);
    if (out === 'shared') { toast('success', 'Shared'); onClose(); }
    else if (out === 'unsupported') toast('info', 'Your browser could not share the file. Use email or WhatsApp instead.');
  };

  const viaEmail = async () => {
    const r = await build();
    if (!r) return;
    downloadPdf(r);
    window.location.href = mailtoUrl(email, subject, `${message}\n\n(Attachment: ${r.filename})`);
    toast('info', `${r.filename} was downloaded — attach it to the email that just opened.`);
  };

  const viaWhatsApp = async () => {
    if (waPhone(phone).length < 8) return toast('error', 'Enter the WhatsApp number with country code, e.g. +91 98765 43210.');
    const r = await build();
    if (!r) return;
    downloadPdf(r);
    window.open(whatsappUrl(phone, message), '_blank', 'noopener');
    toast('info', `${r.filename} was downloaded — attach it in WhatsApp before sending.`);
  };

  return (
    <Modal open={open} title={receipt ? `Share receipt ${receipt.receiptNumber}` : `Share ${doc.number}`} onClose={onClose}>
      <div className="grid gap-3">
        <TextInput label="Recipient email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="WhatsApp number (with country code)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        <TextArea label="Message" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {nativeShare && <button className="btn-primary" disabled={busy} onClick={viaSheet}><Share2 size={15} /> Share PDF…</button>}
          <button className={nativeShare ? 'btn-secondary' : 'btn-primary'} disabled={busy} onClick={viaEmail}><Mail size={15} /> Email</button>
          <button className="btn-secondary" disabled={busy} onClick={viaWhatsApp}><MessageCircle size={15} /> WhatsApp</button>
        </div>
        <p className="text-xs text-slate-500">
          {nativeShare ? '“Share PDF” attaches the file via your device’s share sheet. ' : ''}
          Email opens your own mail app; WhatsApp opens wa.me with the message (the message text passes through WhatsApp's link service). Browsers can't attach files to these links, so the PDF is downloaded for you to attach. Nothing is sent until you press send.
        </p>
      </div>
    </Modal>
  );
}
