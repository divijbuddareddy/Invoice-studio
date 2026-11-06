import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Palette, Hash, DatabaseBackup, Upload, Trash2, Download, Eye, ImagePlus, ShieldCheck, ListPlus, Plus } from 'lucide-react';
import type { AppSettings, CompanyProfile, CustomFieldDef, NumberingKey, PdfFont, LogoAlign, StoredImage, TaxMode, TemplateId, PaymentTermsKey } from '../../types';
import { DOC_TYPES } from '../../types';
import { loadUnicodeFont } from '../../services/pdf/fonts';
import { getThemePref, setThemePref, type ThemePref } from '../../services/theme';
import { uid } from '../../utils/misc';
import {
  DOC_META, PAYMENT_TERMS, TAX_MODE_LABEL, TEMPLATES, defaultSettings, emptyLine, formatNumbering, newDocument, emptyCompany,
} from '../../services/domain';
import { clearAllData, saveCompany, saveSettings, useCompany, useSettings } from '../../services/storage/db';
import { exportBackup, restoreBackup, type RestoreMode } from '../../services/backup/backup';
import { backupCounts, parseBackup, type BackupFile } from '../../services/backup/schema';
import { buildDocumentPdf, pdfBlobUrl } from '../../services/pdf/pdf';
import { processImageUpload } from '../../utils/image';
import { CURRENCIES } from '../../utils/money';
import { checkOptional, formatDate, isEmail, isGstin, isHexColor, isPan, isPhone, isUpi, isUrl } from '../../utils/misc';
import { Checkbox, Loading, Modal, NumberInput, PageHeader, Section, Select, TextArea, TextInput, useAction, useConfirm, useToast } from '../ui';
import AddressFields from '../forms/AddressFields';

const TABS = [
  { id: 'company', label: 'Company profile', icon: Building2 },
  { id: 'branding', label: 'Branding & templates', icon: Palette },
  { id: 'numbering', label: 'Numbering & defaults', icon: Hash },
  { id: 'fields', label: 'Custom fields', icon: ListPlus },
  { id: 'backup', label: 'Backup & data', icon: DatabaseBackup },
] as const;

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as (typeof TABS)[number]['id']) || 'company';
  return (
    <div>
      <PageHeader title="Company Settings" subtitle="Your business profile, branding, numbering and data. Stored only in this browser." />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-md border border-slate-200 bg-white p-1" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setParams({ tab: id }, { replace: true })}
            className={`flex shrink-0 items-center gap-1.5 rounded px-3 py-1.5 text-sm ${tab === id ? 'bg-brand-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'company' && <CompanyTab />}
      {tab === 'branding' && <BrandingTab />}
      {tab === 'numbering' && <NumberingTab />}
      {tab === 'fields' && <CustomFieldsTab />}
      {tab === 'backup' && <BackupTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------------

function ImageField({ label, value, onChange, hint }: { label: string; value?: StoredImage | null; onChange: (v: StoredImage | null) => void; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-white">
          {value ? <img src={value.dataUrl} alt={`${label} preview`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-400">None</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setBusy(true);
            setError('');
            try {
              onChange(await processImageUpload(f));
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }} />
          <button type="button" className="btn-secondary btn-sm" onClick={() => ref.current?.click()} disabled={busy}><ImagePlus size={14} /> {busy ? 'Processing…' : value ? 'Replace' : 'Upload'}</button>
          {value && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange(null)}><Trash2 size={14} /> Remove</button>}
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function CompanyTab() {
  const stored = useCompany();
  const [c, setC] = useState<CompanyProfile | null>(null);
  const run = useAction();
  useEffect(() => {
    if (stored && !c) setC(stored);
  }, [stored, c]);
  if (!c || !stored) return <Loading />;
  const dirty = JSON.stringify(c) !== JSON.stringify(stored);
  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) => setC({ ...c, [k]: v });
  const setBank = (k: keyof CompanyProfile['bank'], v: string) => setC({ ...c, bank: { ...c.bank, [k]: v } });
  const errors = {
    legalName: !c.legalName.trim() ? 'Enter your company or legal name.' : '',
    email: checkOptional(c.email, isEmail, 'Enter a valid email like billing@company.com'),
    phone: checkOptional(c.phone, isPhone, 'Use digits, spaces, +, - or brackets.'),
    website: checkOptional(c.website, isUrl, 'Enter a website like www.company.com'),
    gstin: checkOptional(c.gstin, isGstin, '15 characters, e.g. 27AAPFU0939F1ZV. Structure check only — not verified with the GST portal.'),
    pan: checkOptional(c.pan, isPan, 'PAN should look like AAAAA9999A'),
    upi: checkOptional(c.upiId, isUpi, 'UPI ID should look like name@bank'),
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const save = () => run(() => saveCompany({ ...c, legalName: c.legalName.trim(), gstin: c.gstin.toUpperCase(), pan: c.pan.toUpperCase() }), 'Company profile saved');

  return (
    <div className="space-y-4 pb-20">
      <Section title="Business identity">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ImageField label="Logo (required for final export)" value={c.logo} onChange={(v) => set('logo', v)} hint="PNG, JPEG or SVG up to 2 MB. SVGs are converted to PNG for safe embedding." />
          <div className="grid grid-cols-1 gap-3">
            <TextInput label="Company / legal name *" value={c.legalName} onChange={(e) => set('legalName', e.target.value)} error={errors.legalName} maxLength={300} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TextInput label="GSTIN" value={c.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={errors.gstin} maxLength={15} />
              <TextInput label="PAN" value={c.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} error={errors.pan} maxLength={10} />
              <TextInput label="CIN" value={c.cin} onChange={(e) => set('cin', e.target.value.toUpperCase())} maxLength={30} />
            </div>
          </div>
        </div>
      </Section>
      <Section title="Registered address & contact">
        <AddressFields value={c.address} onChange={(a) => set('address', a)} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput label="Email" type="email" value={c.email} onChange={(e) => set('email', e.target.value)} error={errors.email} maxLength={200} />
          <TextInput label="Phone" value={c.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} maxLength={50} />
          <TextInput label="Website" value={c.website} onChange={(e) => set('website', e.target.value)} error={errors.website} maxLength={200} />
        </div>
      </Section>
      <Section title="Bank & payment details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextInput label="Account holder" value={c.bank.accountHolder} onChange={(e) => setBank('accountHolder', e.target.value)} maxLength={200} />
          <TextInput label="Bank name" value={c.bank.bankName} onChange={(e) => setBank('bankName', e.target.value)} maxLength={200} />
          <TextInput label="Account number" value={c.bank.accountNumber} onChange={(e) => setBank('accountNumber', e.target.value)} maxLength={50} />
          <TextInput label="IFSC" value={c.bank.ifsc} onChange={(e) => setBank('ifsc', e.target.value)} maxLength={20} />
          <TextInput label="Branch" value={c.bank.branch} onChange={(e) => setBank('branch', e.target.value)} maxLength={200} />
          <TextInput label="SWIFT / BIC (optional)" value={c.bank.swift} onChange={(e) => setBank('swift', e.target.value.toUpperCase())} maxLength={11} />
          <TextInput label="UPI ID" value={c.upiId} onChange={(e) => set('upiId', e.target.value.trim())} error={errors.upi} maxLength={200} />
          <div className="flex items-end sm:col-span-2"><Checkbox label="Print UPI QR code on INR invoices" hint="Generated locally; encodes your UPI ID and the balance due." checked={c.showUpiQr} onChange={(v) => set('showUpiQr', v)} /></div>
        </div>
      </Section>
      <Section title="Signatory">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput label="Signatory name" value={c.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} maxLength={200} />
            <TextInput label="Designation" value={c.signatoryDesignation} onChange={(e) => set('signatoryDesignation', e.target.value)} maxLength={200} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ImageField label="Signature image" value={c.signature} onChange={(v) => set('signature', v)} hint="Optional. Transparent PNG works best." />
            <ImageField label="Company stamp" value={c.stamp} onChange={(v) => set('stamp', v)} hint="Optional." />
          </div>
        </div>
      </Section>
      <Section title="Document defaults">
        <div className="grid grid-cols-1 gap-3">
          <Select label="Default payment terms" value={c.defaultPaymentTerms} onChange={(e) => set('defaultPaymentTerms', e.target.value as PaymentTermsKey)} options={PAYMENT_TERMS.filter((t) => t.key !== 'custom').map((t) => ({ value: t.key, label: t.label }))} />
          <TextArea label="Default notes" rows={2} value={c.defaultNotes} onChange={(e) => set('defaultNotes', e.target.value)} />
          <TextArea label="Default terms & conditions" rows={3} value={c.defaultTerms} onChange={(e) => set('defaultTerms', e.target.value)} />
          <TextInput label="Default footer text" value={c.defaultFooter} onChange={(e) => set('defaultFooter', e.target.value)} maxLength={300} />
          <TextArea label="Invoice declaration" rows={2} value={c.declaration} onChange={(e) => set('declaration', e.target.value)} placeholder="e.g. We declare that this invoice shows the actual price of the services described and that all particulars are true and correct." />
        </div>
        <p className="mt-2 text-xs text-slate-500">New documents copy these details. Saved documents keep the company details they were created with.</p>
      </Section>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-[1600px] items-center justify-end gap-3">
          {hasErrors && <span className="text-xs text-red-600">Fix the highlighted fields to save.</span>}
          {dirty && !hasErrors && <span className="text-xs text-amber-700">● Unsaved changes</span>}
          <button className="btn-secondary" disabled={!dirty} onClick={() => setC(stored)}>Discard</button>
          <button className="btn-primary" disabled={!dirty || hasErrors} onClick={save}>Save profile</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------

function sampleDoc(company: CompanyProfile, settings: AppSettings, template: TemplateId) {
  const d = newDocument('invoice', settings, company.legalName ? company : { ...emptyCompany(), legalName: 'Your Company Name' });
  d.number = 'SAMPLE-001';
  d.status = 'unpaid';
  d.template = template;
  d.client.name = 'Sample Client Pvt Ltd';
  d.client.billingAddress = { line1: '12 Example Road', line2: '', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' };
  d.projectName = 'Sample project (template preview)';
  d.items = [
    emptyLine(18, { description: 'Backend API development\nAuthentication, billing and reporting endpoints', quantity: 40, unit: 'hour', rate: 1800, serviceCode: '998314' }),
    emptyLine(18, { description: 'UI/UX design — milestone 1', quantity: 1, unit: 'milestone', rate: 60000, serviceCode: '998391' }),
    emptyLine(18, { description: 'Cloud hosting (monthly)', quantity: 1, unit: 'month', rate: 8000, serviceCode: '998315' }),
  ];
  return d;
}

function BrandingTab() {
  const settings = useSettings();
  const company = useCompany();
  const run = useAction();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  if (!settings || !company) return <Loading />;
  const b = settings.branding;
  const save = (next: AppSettings) => run(() => saveSettings(next));
  const setB = (patch: Partial<AppSettings['branding']>) => save({ ...settings, branding: { ...b, ...patch } });
  const setFont = async (font: PdfFont) => {
    if (font === 'noto' && !(await loadUnicodeFont())) {
      toast('error', 'The Unicode font could not be loaded from this site. Check your connection and try again.');
      return;
    }
    setB({ font });
  };
  const preview = async (t: TemplateId) => {
    const win = window.open('', '_blank'); // open synchronously to avoid popup blockers
    if (b.font === 'noto') await loadUnicodeFont();
    const url = pdfBlobUrl(buildDocumentPdf(sampleDoc(company, settings, t), [], b, t));
    if (win) win.location.href = url;
    else window.open(url, '_blank', 'noopener');
  };
  return (
    <div className="space-y-4">
      <Section title="PDF templates">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {TEMPLATES.map((t) => (
            <div key={t.id} className={`rounded-lg border p-3 ${settings.defaultTemplate === t.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-slate-200'}`}>
              <TemplateThumb id={t.id} primary={b.primaryColor} secondary={b.secondaryColor} />
              <h3 className="mt-2 text-sm font-semibold">{t.name}</h3>
              <p className="text-xs text-slate-500">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <button className="btn-secondary btn-sm" onClick={() => preview(t.id)}><Eye size={13} /> Sample PDF</button>
                <button className="btn-ghost btn-sm" disabled={settings.defaultTemplate === t.id} onClick={() => save({ ...settings, defaultTemplate: t.id })}>
                  {settings.defaultTemplate === t.id ? 'Default' : 'Set default'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Sample PDFs use placeholder line items for preview only — nothing is saved. Each document can also choose its own template.</p>
      </Section>
      <Section title="Brand settings">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ColorField label="Primary colour" value={b.primaryColor} onChange={(v) => setB({ primaryColor: v })} />
          <ColorField label="Secondary / accent colour" value={b.secondaryColor} onChange={(v) => setB({ secondaryColor: v })} />
          <Select label="PDF font" value={b.font} onChange={(e) => setFont(e.target.value as PdfFont)}
            hint={b.font === 'noto' ? 'Prints ₹/€ symbols and accented, Greek & Cyrillic text. Adds roughly 150–250 KB to each PDF.' : 'Built-in font: amounts print with currency codes (INR).'}
            options={[
              { value: 'noto', label: 'Noto Sans — Unicode, prints ₹ (recommended for INR)' },
              { value: 'helvetica', label: 'Helvetica (sans-serif, built-in)' },
              { value: 'times', label: 'Times (serif, built-in)' },
              { value: 'courier', label: 'Courier (monospace, built-in)' },
            ]} />
          <Select label="Logo alignment" value={b.logoAlign} onChange={(e) => setB({ logoAlign: e.target.value as LogoAlign })}
            options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} />
          <div className="flex items-end"><Checkbox label="Show signature block on PDFs" checked={b.showSignature} onChange={(v) => setB({ showSignature: v })} /></div>
          <div className="flex items-end"><button className="btn-ghost btn-sm" onClick={() => setB(defaultSettings().branding)}>Restore default branding</button></div>
        </div>
        <p className="mt-2 text-xs text-slate-500">No remote fonts are used: Noto Sans (SIL Open Font License) is bundled with this app and loaded from this site only when selected. Complex scripts such as Devanagari are not shaped correctly by the PDF engine, so keep document text in Latin script. Footer text is set per document (default in Company profile).</p>
      </Section>
      <Section title="App appearance">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour theme">
          {(['light', 'dark', 'system'] as ThemePref[]).map((v) => (
            <button key={v} role="radio" aria-checked={theme === v} className={theme === v ? 'btn-primary' : 'btn-secondary'}
              onClick={() => { setThemePref(v); setTheme(v); }}>
              {v === 'light' ? 'Light' : v === 'dark' ? 'Dark' : 'Match system'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Affects the app only — PDFs always print on white. Saved in this browser.</p>
      </Section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <label className="label" htmlFor={`col-${label}`}>{label}</label>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} picker`} className="h-9 w-12 cursor-pointer rounded border border-slate-300" value={value} onChange={(e) => onChange(e.target.value)} />
        <input id={`col-${label}`} className={`input ${isHexColor(text) ? '' : 'input-error'}`} value={text} onChange={(e) => { setText(e.target.value); if (isHexColor(e.target.value)) onChange(e.target.value); }} maxLength={7} />
      </div>
    </div>
  );
}

function TemplateThumb({ id, primary, secondary }: { id: TemplateId; primary: string; secondary: string }) {
  // Simple schematic of each layout (decorative).
  const p = id === 'minimal' ? '#333' : primary;
  const s = id === 'minimal' ? '#999' : secondary;
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-full rounded border border-slate-200 bg-white" aria-hidden>
      {id === 'corporate' && <rect width="120" height="3" fill={p} />}
      {id === 'executive' && <rect width="120" height="18" fill={p} />}
      {id === 'modern' && <><rect width="4" height="80" fill={s} /><rect width="4" height="14" fill={p} /></>}
      <rect x="10" y={id === 'executive' ? 5 : 8} width="22" height="7" rx="1" fill={id === 'executive' ? '#fff' : '#cbd5e1'} />
      <rect x="78" y={id === 'executive' ? 6 : 9} width="32" height="5" rx="1" fill={id === 'executive' ? '#fff' : id === 'minimal' ? '#555' : id === 'modern' ? s : p} />
      {id === 'modern' || id === 'executive' ? <rect x="76" y="22" width="34" height="12" rx="2" fill={id === 'modern' ? s : p} opacity="0.12" /> : <rect x="10" y="34" width="100" height="0.6" fill={id === 'corporate' ? p : '#ccc'} />}
      <rect x="10" y="38" width="100" height="5" fill={id === 'minimal' ? '#fff' : id === 'modern' ? s : p} stroke={id === 'minimal' ? '#555' : 'none'} strokeWidth="0.3" />
      {[0, 1, 2].map((i) => <rect key={i} x="10" y={45 + i * 6} width="100" height="5" fill={i % 2 && id !== 'minimal' ? '#f1f5f9' : '#fff'} stroke="#e2e8f0" strokeWidth="0.3" />)}
      <rect x="74" y="66" width="36" height="6" fill={id === 'minimal' ? '#eee' : id === 'modern' ? s : p} />
    </svg>
  );
}

// ---------------------------------------------------------------------------------

function NumberingTab() {
  const settings = useSettings();
  const run = useAction();
  const [s, setS] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (settings && !s) setS(settings);
  }, [settings, s]);
  if (!s || !settings) return <Loading />;
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const keys: NumberingKey[] = ['invoice', 'quotation', 'proforma', 'credit-note', 'debit-note', 'purchase-order', 'receipt'];
  const setRule = (k: NumberingKey, patch: Partial<AppSettings['numbering'][NumberingKey]>) => setS({ ...s, numbering: { ...s.numbering, [k]: { ...s.numbering[k], ...patch } } });
  return (
    <div className="space-y-4">
      <Section title="Document numbering">
        <p className="mb-3 text-xs text-slate-500">Use {'{YYYY}'} or {'{YY}'} in a prefix to insert the document year. Numbers are unique only within this browser — they are not coordinated across devices.</p>
        <div className="space-y-3">
          {keys.map((k) => (
            <div key={k} className="grid grid-cols-2 items-end gap-2 rounded-md border border-slate-100 p-2 sm:grid-cols-5">
              <div className="col-span-2 text-sm font-medium sm:col-span-1">{k === 'receipt' ? 'Payment receipt' : DOC_META[k].label}</div>
              <TextInput label="Prefix" value={s.numbering[k].prefix} onChange={(e) => setRule(k, { prefix: e.target.value })} maxLength={40} />
              <NumberInput label="Next number" step="1" value={s.numbering[k].next} onChange={(n) => setRule(k, { next: Math.max(0, Math.floor(n)) })} />
              <NumberInput label="Padding (digits)" step="1" value={s.numbering[k].padding} onChange={(n) => setRule(k, { padding: Math.min(10, Math.max(0, Math.floor(n))) })} />
              <div className="col-span-2 pb-2 text-sm sm:col-span-1"><span className="text-xs text-slate-500">Next: </span><span className="font-mono">{formatNumbering(s.numbering[k])}</span></div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Defaults for new documents">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="Default currency" value={s.defaultCurrency} onChange={(e) => setS({ ...s, defaultCurrency: e.target.value })} options={CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))} />
          <Select label="Default tax presentation" value={s.defaultTaxMode} onChange={(e) => setS({ ...s, defaultTaxMode: e.target.value as TaxMode })} options={Object.entries(TAX_MODE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          <NumberInput label="Default tax rate %" value={s.defaultTaxRate} onChange={(n) => setS({ ...s, defaultTaxRate: Math.min(100, n) })} hint="Editable on every line." />
          <Select label="Default template" value={s.defaultTemplate} onChange={(e) => setS({ ...s, defaultTemplate: e.target.value as TemplateId })} options={TEMPLATES.map((t) => ({ value: t.id, label: t.name }))} />
        </div>
      </Section>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" disabled={!dirty} onClick={() => setS(settings)}>Discard</button>
        <button className="btn-primary" disabled={!dirty} onClick={() => run(() => saveSettings(s), 'Settings saved')}>Save settings</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------

function CustomFieldsTab() {
  const settings = useSettings();
  const run = useAction();
  const confirm = useConfirm();
  const [defs, setDefs] = useState<CustomFieldDef[] | null>(null);
  useEffect(() => {
    if (settings && !defs) setDefs(settings.customFields);
  }, [settings, defs]);
  if (!settings || !defs) return <Loading />;
  const dirty = JSON.stringify(defs) !== JSON.stringify(settings.customFields);
  const update = (i: number, patch: Partial<CustomFieldDef>) => setDefs(defs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const invalid = defs.some((d) => !d.label.trim() || d.docTypes.length === 0);
  return (
    <div className="space-y-4">
      <Section title="Custom fields">
        <p className="mb-3 text-sm text-slate-600">
          Add your own fields — e.g. <em>Contract ID</em>, <em>Vendor code</em>, <em>Cost centre</em>, <em>LUT / ARN number</em>, <em>Sprint</em>. They appear on new
          documents of the selected types, can be printed in the PDF details block, and are included in CSV exports. You can also add one-off fields on any document.
        </p>
        {defs.length === 0 && <p className="mb-3 text-sm text-slate-500">No custom fields yet.</p>}
        <div className="space-y-3">
          {defs.map((d, i) => (
            <div key={d.id} className="rounded-md border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput label="Field name *" value={d.label} maxLength={100} onChange={(e) => update(i, { label: e.target.value })} error={!d.label.trim() ? 'Enter a field name.' : ''} />
                <TextInput label="Default value (optional)" value={d.defaultValue} maxLength={1000} onChange={(e) => update(i, { defaultValue: e.target.value })} />
              </div>
              <fieldset className="mt-3">
                <legend className="label">Show on</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {DOC_TYPES.map((t) => (
                    <Checkbox key={t} label={DOC_META[t].label} checked={d.docTypes.includes(t)}
                      onChange={(v) => update(i, { docTypes: v ? [...d.docTypes, t] : d.docTypes.filter((x) => x !== t) })} />
                  ))}
                </div>
                {d.docTypes.length === 0 && <p className="mt-1 text-xs text-red-600">Select at least one document type.</p>}
              </fieldset>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Checkbox label="Print on PDF" checked={d.showOnPdf} onChange={(v) => update(i, { showOnPdf: v })} />
                <button className="btn-ghost btn-sm text-red-600" onClick={async () => {
                  if (await confirm({ title: `Remove “${d.label || 'field'}”?`, message: 'New documents will no longer include it. Existing documents keep their saved values.', confirmLabel: 'Remove', danger: true }))
                    setDefs(defs.filter((_, j) => j !== i));
                }}><Trash2 size={14} /> Remove</button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn-secondary mt-3" onClick={() => setDefs([...defs, { id: uid(), label: '', docTypes: ['invoice'], defaultValue: '', showOnPdf: true }])}><Plus size={15} /> Add custom field</button>
      </Section>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary" disabled={!dirty} onClick={() => setDefs(settings.customFields)}>Discard</button>
        <button className="btn-primary" disabled={!dirty || invalid} onClick={() => run(() => saveSettings({ ...settings, customFields: defs.map((d) => ({ ...d, label: d.label.trim() })) }), 'Custom fields saved')}>Save fields</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------

function BackupTab() {
  const settings = useSettings();
  const run = useAction();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge-skip');
  const [usage, setUsage] = useState<string>('');
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(2)} MB used${e.quota ? ` of ~${Math.round(e.quota / 1024 / 1024)} MB available` : ''}`);
    }).catch(() => undefined);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
  }, []);

  if (!settings) return <Loading />;
  const daysSince = settings.lastBackupAt ? Math.floor((Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000) : null;

  return (
    <div className="space-y-4">
      <Section title="Where your data lives">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>All data is stored in this browser on this device (IndexedDB). Nothing is uploaded, synced or sent to any server.</li>
          <li>Clearing site data, using private/incognito mode, or switching browser or device can make records unavailable.</li>
          <li>Export a backup regularly and keep it somewhere safe. Restore it to move data to another browser or device.</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {usage && <span>Storage: {usage}</span>}
          {persisted === false && navigator.storage?.persist && (
            <button className="btn-secondary btn-sm" onClick={async () => {
              const ok = await navigator.storage.persist();
              setPersisted(ok);
              toast(ok ? 'success' : 'info', ok ? 'Browser will keep this data unless you clear it manually.' : 'The browser declined persistent storage. Keep regular backups.');
            }}><ShieldCheck size={13} /> Request persistent storage</button>
          )}
          {persisted && <span className="text-emerald-700">✓ Persistent storage granted</span>}
        </div>
      </Section>

      <Section title="Backup">
        <p className="text-sm text-slate-600">
          Last backup: <strong>{settings.lastBackupAt ? `${formatDate(settings.lastBackupAt.slice(0, 10))}${daysSince ? ` (${daysSince} days ago)` : ''}` : 'never'}</strong>
          {(daysSince === null || daysSince > 14) && <span className="ml-1 text-amber-700">— consider exporting a backup now.</span>}
        </p>
        <p className="mt-1 text-xs text-slate-500">Exports a versioned JSON file containing your company profile (with images), clients, services, documents, payments, recurring schedules and settings. PDFs are not included — they can be regenerated from the data at any time.</p>
        <button className="btn-primary mt-3" onClick={() => run(exportBackup, 'Backup downloaded')}><Download size={15} /> Export backup (JSON)</button>
      </Section>

      <Section title="Restore">
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > 50 * 1024 * 1024) return toast('error', 'Backup file is larger than 50 MB and was rejected.');
          const r = parseBackup(await f.text());
          if (!r.ok) return toast('error', r.error);
          setMode('merge-skip');
          setPending(r.backup);
        }} />
        <p className="text-sm text-slate-600">Choose a backup file. You'll see what it contains and choose how to restore before anything changes.</p>
        <button className="btn-secondary mt-3" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose backup file…</button>
      </Section>

      <Section title="Danger zone">
        <p className="text-sm text-slate-600">Permanently delete every record stored by this app in this browser. Export a backup first.</p>
        <button className="btn-danger mt-3" onClick={async () => {
          const ok = await confirm({ title: 'Clear all local data?', message: 'This deletes your company profile, clients, services, documents, payments, schedules and settings from this browser. This cannot be undone.', confirmLabel: 'Delete everything', danger: true, requireText: 'DELETE' });
          if (ok && (await run(clearAllData, 'All local data cleared')) !== undefined) setTimeout(() => window.location.reload(), 600);
        }}><Trash2 size={15} /> Clear all local data</button>
      </Section>

      <Modal open={!!pending} title="Restore backup" onClose={() => setPending(null)} footer={<>
        <button className="btn-secondary" onClick={() => setPending(null)}>Cancel</button>
        <button className={mode === 'replace' ? 'btn-danger' : 'btn-primary'} onClick={async () => {
          if (!pending) return;
          if (mode === 'replace' && !(await confirm({ title: 'Replace all local data?', message: 'Everything currently stored in this browser will be deleted and replaced with the backup contents.', confirmLabel: 'Replace data', danger: true }))) return;
          const r = await run(() => restoreBackup(pending, mode));
          if (r) {
            toast('success', `Restore complete: ${r.added} record(s) written${r.skipped ? `, ${r.skipped} skipped (already present)` : ''}.`);
            setPending(null);
          }
        }}>Restore</button>
      </>}>
        {pending && (
          <div className="space-y-3 text-sm">
            <p className="text-slate-600">Backup from <strong>{new Date(pending.exportedAt).toLocaleString()}</strong> (format version {pending.schemaVersion}) contains:</p>
            <ul className="grid grid-cols-2 gap-1 rounded-md border border-slate-200 p-3">
              {Object.entries(backupCounts(pending.data)).map(([k, v]) => <li key={k} className="flex justify-between gap-2"><span className="text-slate-500">{k}</span><strong>{v}</strong></li>)}
            </ul>
            <fieldset className="space-y-2">
              <legend className="label">How should it be restored?</legend>
              {([
                ['merge-skip', 'Merge — keep my existing records', 'Adds records that are not already here. If an ID exists in both, your local version is kept. Company profile/settings are only imported if none exist.'],
                ['merge-overwrite', 'Merge — backup wins on conflicts', 'Adds new records and replaces local records that have the same ID.'],
                ['replace', 'Replace everything', 'Deletes all local data first, then loads the backup.'],
              ] as const).map(([v, l, d]) => (
                <label key={v} className={`flex cursor-pointer gap-2 rounded-md border p-2 ${mode === v ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                  <input type="radio" name="restore-mode" className="mt-1" checked={mode === v} onChange={() => setMode(v)} />
                  <span><span className="font-medium">{l}</span><span className="block text-xs text-slate-500">{d}</span></span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
      </Modal>
    </div>
  );
}
