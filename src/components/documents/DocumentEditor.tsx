import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Download, Eye, FileCheck2, Printer, RotateCcw, Save, AlertTriangle, Info } from 'lucide-react';
import type { DocType, DocumentRecord, DocStatus, PaymentTermsKey, TaxMode, TemplateId } from '../../types';
import {
  DOC_META, INDIAN_STATES, PAYMENT_TERMS, TAX_DISCLAIMER, TAX_MODE_LABEL, TEMPLATES, suggestTaxMode, termsDays,
} from '../../services/domain';
import { calculateTotals } from '../../services/calculations/calc';
import { buildDocumentPdf } from '../../services/pdf/pdf';
import { db, getCompany, useDocuments, usePayments, useSettings } from '../../services/storage/db';
import { createDraft, duplicateDocument, isNumberTaken, saveDocument } from '../../features/documents/actions';
import { sumPayments, paymentsFor } from '../../features/payments/payments';
import { CURRENCIES } from '../../utils/money';
import { addDays } from '../../utils/misc';
import { Checkbox, Loading, NumberInput, Section, Select, StatusBadge, TextArea, TextInput, useAction, useConfirm, EmptyState } from '../ui';
import ClientSection, { snapshotFromClient } from './ClientSection';
import { ChargesEditor, LineItemsEditor } from './LineItemsEditor';
import TotalsSummary from './TotalsSummary';
import PdfPreview from './PdfPreview';
import CustomFieldsEditor from './CustomFieldsEditor';
import { usePdfExport } from './usePdfExport';

const FINAL_STATUS: Record<DocType, DocStatus> = {
  invoice: 'unpaid', quotation: 'sent', proforma: 'issued', 'credit-note': 'issued', 'debit-note': 'issued', 'purchase-order': 'issued',
};

export default function DocumentEditor({ type, id }: { type: DocType; id?: string }) {
  const meta = DOC_META[type];
  const navigate = useNavigate();
  const location = useLocation();
  const run = useAction();
  const confirm = useConfirm();
  const settings = useSettings();
  const payments = usePayments();
  const allDocs = useDocuments();
  const { exportDoc } = usePdfExport();

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [savedJson, setSavedJson] = useState<string | null>(null); // null = never saved
  const [notFound, setNotFound] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'form' | 'preview'>('form');
  const [busy, setBusy] = useState(false);

  // Load existing document or create a new draft.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id) {
        const d = await db.documents.get(id);
        if (cancelled) return;
        if (!d || d.type !== type) return setNotFound(true);
        setDoc(d);
        setSavedJson(JSON.stringify(d));
      } else {
        const d = await createDraft(type);
        const clientId = (location.state as { clientId?: string } | null)?.clientId;
        const client = clientId ? await db.clients.get(clientId) : undefined;
        if (client) d.client = snapshotFromClient(client);
        if (!cancelled) setDoc(d);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  const dirty = !!doc && (savedJson === null ? true : JSON.stringify(doc) !== savedJson);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !busy && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirm({ title: 'Discard unsaved changes?', message: 'You have unsaved changes on this document. Leaving now will discard them.', confirmLabel: 'Discard changes', danger: true })
      .then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const docPayments = useMemo(() => (doc ? paymentsFor(doc.id, payments ?? []) : []), [doc, payments]);
  const totals = useMemo(
    () => (doc ? calculateTotals({ ...doc, paymentsTotal: sumPayments(docPayments) }) : null),
    [doc, docPayments],
  );

  const patch = useCallback((p: Partial<DocumentRecord>) => setDoc((d) => (d ? { ...d, ...p } : d)), []);

  if (notFound) return <EmptyState title="Document not found" text="It may have been deleted, or the link is incorrect." action={<Link className="btn-primary" to={`/d/${type}`}>Back to {meta.plural}</Link>} />;
  if (!doc || !settings || !totals) return <Loading />;

  const isNew = savedJson === null;
  const isFinal = doc.status !== 'draft';
  const invoices = (allDocs ?? []).filter((d) => d.type === 'invoice' && d.status !== 'draft' && !d.archived);
  const suggestion = suggestTaxMode(doc.supplierState, doc.placeOfSupply);
  const gst = doc.taxMode === 'intra' || doc.taxMode === 'inter';
  const hasDue = !!meta.dueLabel;
  const hasTerms = type === 'invoice' || type === 'proforma' || type === 'debit-note';

  const validate = async (finalising: boolean): Promise<boolean> => {
    const e: Record<string, string> = {};
    if (!doc.number.trim()) e.number = 'Enter a document number.';
    else if (await isNumberTaken(doc)) e.number = `Another ${meta.label.toLowerCase()} already uses ${doc.number}. Choose a different number.`;
    if (!doc.issueDate) e.issueDate = 'Choose the document date.';
    if (doc.dueDate && doc.issueDate && doc.dueDate < doc.issueDate) e.dueDate = `${meta.dueLabel} cannot be before the document date.`;
    if (finalising) {
      if (!doc.client.name.trim()) e.clientName = `Enter the ${meta.partyLabel.toLowerCase()} name.`;
      const valid = doc.items.filter((i) => i.description.trim() && i.quantity > 0);
      if (valid.length === 0) e.items = 'Add at least one line item with a description and a quantity greater than zero.';
      else if (valid.length !== doc.items.length) e.items = 'Every line item needs a description and a quantity greater than zero (remove empty rows).';
      if ((type === 'credit-note' || type === 'debit-note') && !doc.referenceNumber.trim()) e.reference = 'Select or enter the original invoice this note adjusts.';
    }
    setErrors(e);
    if (Object.keys(e).length) {
      setTab('form');
      setTimeout(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
    return Object.keys(e).length === 0;
  };

  const save = async (finalise: boolean) => {
    if (!(await validate(finalise || isFinal))) return;
    if (isFinal && !isNew) {
      const ok = await confirm({
        title: 'Change a finalised document?',
        message: `${doc.number} has already been issued. Saving will change the stored record (a note is added to its history). To keep the original unchanged, cancel and use "Duplicate" to create a revised copy instead.`,
        confirmLabel: 'Save changes to this record',
      });
      if (!ok) return;
    }
    setBusy(true);
    const next: DocumentRecord = finalise ? { ...doc, status: FINAL_STATUS[type] } : doc;
    const msg = isNew ? undefined : finalise ? `Finalised (${next.status})` : isFinal ? 'Finalised document edited' : 'Draft updated';
    const saved = await run(() => saveDocument(next, msg), finalise ? `${meta.label} ${next.number} finalised` : 'Saved');
    setBusy(false);
    if (!saved) return;
    setDoc(saved);
    setSavedJson(JSON.stringify(saved));
    if (finalise || isNew) {
      setTimeout(() => navigate(finalise ? `/d/${type}/${saved.id}` : `/d/${type}/${saved.id}/edit`, { replace: true }), 0);
    }
  };

  const reset = async () => {
    const ok = await confirm({ title: 'Reset form?', message: isNew ? 'Clear everything you have entered and start a blank document?' : 'Discard all unsaved edits and restore the last saved version?', confirmLabel: 'Reset', danger: true });
    if (!ok) return;
    if (savedJson) setDoc(JSON.parse(savedJson));
    else setDoc(await createDraft(type));
    setErrors({});
  };

  const duplicate = async () => {
    if (dirty && !(await confirm({ title: 'Unsaved changes', message: 'The copy is created from the last saved version. Unsaved edits on this page will be discarded.', confirmLabel: 'Continue' }))) return;
    const src = savedJson ? (JSON.parse(savedJson) as DocumentRecord) : doc;
    const copy = await run(async () => saveDocument(await duplicateDocument(src)), 'Copy created as a new draft');
    if (copy) {
      setSavedJson(JSON.stringify(doc)); // allow navigation without blocker
      setTimeout(() => navigate(`/d/${type}/${copy.id}/edit`), 0);
    }
  };

  const refreshCompany = async () => {
    patch({ companySnapshot: await getCompany() });
  };

  const setTerms = (key: PaymentTermsKey, custom = doc.customTermsDays) =>
    patch({ paymentTerms: key, customTermsDays: custom, dueDate: addDays(doc.issueDate, termsDays(key, custom)) });

  const actions = (
    <div className="flex flex-wrap gap-2">
      <button className="btn-secondary" onClick={() => save(false)} disabled={busy}><Save size={15} /> {isFinal ? 'Save changes' : 'Save draft'}</button>
      {!isFinal && <button className="btn-primary" onClick={() => save(true)} disabled={busy}><FileCheck2 size={15} /> Save &amp; finalise</button>}
      <button className="btn-secondary lg:hidden" onClick={() => setTab(tab === 'form' ? 'preview' : 'form')}><Eye size={15} /> {tab === 'form' ? 'Preview' : 'Edit form'}</button>
      <button className="btn-secondary" onClick={() => exportDoc(doc, payments ?? [], 'download')}><Download size={15} /> Download PDF</button>
      <button className="btn-secondary" onClick={() => exportDoc(doc, payments ?? [], 'print')}><Printer size={15} /> Print</button>
      <button className="btn-ghost" onClick={duplicate} disabled={isNew} title={isNew ? 'Save the document first to duplicate it' : undefined}><Copy size={15} /> Duplicate</button>
      <button className="btn-ghost" onClick={reset}><RotateCcw size={15} /> Reset</button>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Link to={isNew ? `/d/${type}` : `/d/${type}/${doc.id}`} className="btn-ghost btn-sm"><ArrowLeft size={14} /> Back</Link>
          <h1 className="text-xl font-semibold text-slate-900">{isNew ? `New ${meta.label}` : `Edit ${meta.label} ${doc.number}`}</h1>
          <StatusBadge status={doc.status} />
          {dirty && <span className="text-xs font-medium text-amber-700">● Unsaved changes</span>}
        </div>
        {actions}
        {isFinal && !isNew && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            You are editing a finalised document. Saving changes this stored record (the edit is logged). Use Duplicate to create a revised copy instead.
          </div>
        )}
      </div>

      {/* Mobile tabs */}
      <div className="mb-3 grid grid-cols-2 rounded-md border border-slate-200 bg-white p-1 text-sm lg:hidden" role="tablist">
        <button role="tab" aria-selected={tab === 'form'} className={`rounded px-3 py-1.5 ${tab === 'form' ? 'bg-brand-800 text-white' : 'text-slate-600'}`} onClick={() => setTab('form')}>Form</button>
        <button role="tab" aria-selected={tab === 'preview'} className={`rounded px-3 py-1.5 ${tab === 'preview' ? 'bg-brand-800 text-white' : 'text-slate-600'}`} onClick={() => setTab('preview')}>Preview</button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={`min-w-0 space-y-4 ${tab === 'form' ? '' : 'hidden lg:block'}`}>
          <Section title="Document details">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label={`${meta.label} number *`} value={doc.number} onChange={(e) => patch({ number: e.target.value })} error={errors.number} maxLength={100} />
              <TextInput label="Date *" type="date" value={doc.issueDate} error={errors.issueDate}
                onChange={(e) => patch({ issueDate: e.target.value, ...(hasTerms && e.target.value ? { dueDate: addDays(e.target.value, termsDays(doc.paymentTerms, doc.customTermsDays)) } : {}) })} />
              {hasTerms && (
                <Select label="Payment terms" value={doc.paymentTerms} onChange={(e) => setTerms(e.target.value as PaymentTermsKey)} options={PAYMENT_TERMS.map((t) => ({ value: t.key, label: t.label }))} />
              )}
              {hasTerms && doc.paymentTerms === 'custom' && (
                <NumberInput label="Custom terms (days)" value={doc.customTermsDays} step="1" onChange={(n) => setTerms('custom', Math.floor(n))} />
              )}
              {hasDue && <TextInput label={meta.dueLabel} type="date" value={doc.dueDate} onChange={(e) => patch({ dueDate: e.target.value })} error={errors.dueDate} />}
              <Select label="Currency" value={doc.currency} onChange={(e) => patch({ currency: e.target.value })} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                hint={doc.currency !== 'INR' ? 'Amounts are entered in this currency. No live conversion is performed.' : undefined} />
              <Select label="PDF template" value={doc.template} onChange={(e) => patch({ template: e.target.value as TemplateId })} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))} />
              <TextInput label="Project name" value={doc.projectName} onChange={(e) => patch({ projectName: e.target.value })} maxLength={300} />
              <TextInput label="Project code / ID" value={doc.projectCode} onChange={(e) => patch({ projectCode: e.target.value })} maxLength={100} />
              <TextInput label={type === 'purchase-order' ? 'Reference / requisition no.' : 'Client PO reference'} value={doc.poReference} onChange={(e) => patch({ poReference: e.target.value })} maxLength={100} />
              {type !== 'purchase-order' && (
                <>
                  <TextInput label="Service period from" type="date" value={doc.servicePeriodFrom} onChange={(e) => patch({ servicePeriodFrom: e.target.value })} />
                  <TextInput label="Service period to" type="date" value={doc.servicePeriodTo} onChange={(e) => patch({ servicePeriodTo: e.target.value })} />
                </>
              )}
            </div>
            {(type === 'credit-note' || type === 'debit-note') && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Original invoice *"
                  value={doc.referenceId}
                  error={errors.reference}
                  onChange={(e) => {
                    const inv = invoices.find((i) => i.id === e.target.value);
                    if (inv) patch({ referenceId: inv.id, referenceNumber: inv.number, client: inv.client, currency: inv.currency, taxMode: inv.taxMode, taxLabel: inv.taxLabel, placeOfSupply: inv.placeOfSupply, supplierState: inv.supplierState });
                    else patch({ referenceId: '', referenceNumber: '' });
                  }}
                  options={[{ value: '', label: '— Select a saved invoice —' }, ...invoices.map((i) => ({ value: i.id, label: `${i.number} · ${i.client.name}` }))]}
                />
                <TextInput label="…or enter invoice number" value={doc.referenceNumber} onChange={(e) => patch({ referenceNumber: e.target.value, referenceId: '' })} maxLength={100} />
                <TextArea wrapClass="sm:col-span-2" label={type === 'credit-note' ? 'Reason for credit (refund, discount, returned scope…)' : 'Reason for additional charge'} rows={2} value={doc.reason} onChange={(e) => patch({ reason: e.target.value })} />
              </div>
            )}
            {!isNew && (
              <button type="button" className="btn-ghost btn-sm mt-3" onClick={refreshCompany}><Info size={14} /> Refresh company details from current profile</button>
            )}
          </Section>

          <Section title="Additional fields">
            <CustomFieldsEditor value={doc.customFields ?? []} onChange={(customFields) => patch({ customFields })} defs={settings.customFields} type={type} />
          </Section>

          <Section title={meta.partyLabel}>
            <ClientSection value={doc.client} onChange={(c) => patch({ client: c })} partyLabel={meta.partyLabel} errors={errors} />
          </Section>

          {type === 'purchase-order' && (
            <Section title="Delivery">
              <div className="grid grid-cols-1 gap-3">
                <TextArea label="Deliver to (address)" rows={3} value={doc.deliveryAddress} onChange={(e) => patch({ deliveryAddress: e.target.value })} />
                <TextArea label="Delivery terms / method" rows={2} value={doc.deliveryTerms} onChange={(e) => patch({ deliveryTerms: e.target.value })} />
              </div>
            </Section>
          )}

          <Section title="Tax">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select wrapClass="sm:col-span-2" label="Tax presentation" value={doc.taxMode} onChange={(e) => patch({ taxMode: e.target.value as TaxMode })}
                options={Object.entries(TAX_MODE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
              {doc.taxMode === 'other' && <TextInput label="Tax name" value={doc.taxLabel} onChange={(e) => patch({ taxLabel: e.target.value })} maxLength={30} placeholder="VAT, Sales tax…" />}
              {(gst || doc.currency === 'INR') && (
                <>
                  <Select label="Supplier state" value={doc.supplierState} onChange={(e) => patch({ supplierState: e.target.value })}
                    options={[{ value: '', label: '— Select —' }, ...INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))]} />
                  <Select label="Place of supply" value={doc.placeOfSupply} onChange={(e) => patch({ placeOfSupply: e.target.value })}
                    options={[{ value: '', label: '— Select —' }, ...INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))]} />
                </>
              )}
              {gst && <Checkbox label="Reverse charge applies" checked={doc.reverseCharge} onChange={(v) => patch({ reverseCharge: v })} />}
            </div>
            {suggestion && suggestion !== doc.taxMode && (gst || doc.taxMode === 'none') && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                Supplier state and place of supply {suggestion === 'intra' ? 'match' : 'differ'}, which usually indicates {TAX_MODE_LABEL[suggestion]}.
                <button type="button" className="btn-secondary btn-sm" onClick={() => patch({ taxMode: suggestion })}>Use {suggestion === 'intra' ? 'CGST + SGST' : 'IGST'}</button>
              </div>
            )}
            <p className="mt-3 text-xs text-slate-500">{TAX_DISCLAIMER}</p>
          </Section>

          <Section title="Line items">
            <LineItemsEditor items={doc.items} onChange={(items) => patch({ items })} totals={totals} currency={doc.currency} taxMode={doc.taxMode} defaultTaxRate={settings.defaultTaxRate} error={errors.items} />
          </Section>

          <Section title="Discounts, charges & payments">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <label className="label" htmlFor="inv-disc">Invoice-level discount (before tax)</label>
                <div className="flex gap-1">
                  <NumberInput label="Invoice discount" srOnlyLabel id="inv-disc" value={doc.invoiceDiscountValue} onChange={(n) => patch({ invoiceDiscountValue: n })} wrapClass="flex-1" />
                  <select className="input w-20" aria-label="Invoice discount type" value={doc.invoiceDiscountType} onChange={(e) => patch({ invoiceDiscountType: e.target.value as DocumentRecord['invoiceDiscountType'] })}>
                    <option value="percent">%</option>
                    <option value="fixed">{doc.currency}</option>
                  </select>
                </div>
              </div>
              {(type === 'invoice' || type === 'proforma') && (
                <NumberInput label={`Advance already received (${doc.currency})`} value={doc.advancePaid} onChange={(n) => patch({ advancePaid: n })}
                  hint="For payments received before this invoice. Record later payments from the invoice page." />
              )}
            </div>
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Additional charges</p>
              <ChargesEditor charges={doc.charges} onChange={(charges) => patch({ charges })} currency={doc.currency} taxMode={doc.taxMode} />
            </div>
            <div className="mt-4">
              <Checkbox label="Round grand total to whole currency units" hint="Shows a rounding adjustment line." checked={doc.roundOff} onChange={(v) => patch({ roundOff: v })} />
            </div>
          </Section>

          <Section title="Totals">
            <TotalsSummary totals={totals} showPaid={type === 'invoice' || type === 'proforma'}
              discountLabel={doc.invoiceDiscountType === 'percent' && doc.invoiceDiscountValue ? ` (${doc.invoiceDiscountValue}%)` : ''} />
          </Section>

          <Section title="Notes & terms">
            <div className="grid grid-cols-1 gap-3">
              <TextArea label="Notes" rows={2} value={doc.notes} onChange={(e) => patch({ notes: e.target.value })} />
              <TextArea label={type === 'quotation' ? 'Scope & terms' : 'Terms & conditions'} rows={3} value={doc.terms} onChange={(e) => patch({ terms: e.target.value })} />
              <TextInput label="Footer text" value={doc.footer} onChange={(e) => patch({ footer: e.target.value })} maxLength={300} hint="Printed at the bottom of every page." />
            </div>
          </Section>
          <div className="pb-6 lg:hidden">{actions}</div>
        </div>

        <div className={`min-w-0 ${tab === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="card sticky top-4 p-3 lg:h-[calc(100vh-2rem)]">
            <PdfPreview build={() => buildDocumentPdf(doc, payments ?? [], settings.branding)} deps={[doc, settings.branding, payments]} branding={settings.branding} />
          </div>
        </div>
      </div>
    </div>
  );
}

