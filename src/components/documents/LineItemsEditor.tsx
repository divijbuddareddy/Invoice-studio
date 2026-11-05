import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Charge, LineItem, TaxMode, Unit } from '../../types';
import { UNITS } from '../../types';
import { TAX_PRESETS, TREATMENT_LABEL, UNIT_LABEL, emptyLine, lineFromService } from '../../services/domain';
import type { Totals } from '../../services/calculations/calc';
import { useServices } from '../../services/storage/db';
import { formatMoney } from '../../utils/money';
import { NumberInput, TextInput } from '../ui';
import { uid } from '../../utils/misc';

export function LineItemsEditor({ items, onChange, totals, currency, taxMode, defaultTaxRate, error }: {
  items: LineItem[]; onChange: (items: LineItem[]) => void; totals: Totals; currency: string; taxMode: TaxMode; defaultTaxRate: number; error?: string;
}) {
  const services = useServices();
  const update = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const activeServices = (services ?? []).filter((s) => s.active);
  const categories = [...new Set(activeServices.map((s) => s.category || 'Other'))].sort();

  return (
    <div className="space-y-3">
      <datalist id="tax-presets">{TAX_PRESETS.map((r) => <option key={r} value={r} />)}</datalist>
      {items.map((it, i) => {
        const r = totals.lines[i];
        return (
          <div key={it.id} className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Item {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move item ${i + 1} up`}><ArrowUp size={14} /></button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move item ${i + 1} down`}><ArrowDown size={14} /></button>
                <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}><Trash2 size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div className="col-span-2 sm:col-span-4">
                <label className="label" htmlFor={`desc-${it.id}`}>Description</label>
                <textarea id={`desc-${it.id}`} rows={2} className="input" value={it.description} maxLength={5000}
                  placeholder="Service, milestone or period of service" onChange={(e) => update(i, { description: e.target.value })} />
              </div>
              <TextInput wrapClass="col-span-2" label="SAC/HSN / code" value={it.serviceCode} onChange={(e) => update(i, { serviceCode: e.target.value })} maxLength={50} />
              <NumberInput label="Quantity" value={it.quantity} onChange={(n) => update(i, { quantity: n })} />
              <div className="min-w-0">
                <label className="label" htmlFor={`unit-${it.id}`}>Unit</label>
                <select id={`unit-${it.id}`} className="input" value={it.unit} onChange={(e) => update(i, { unit: e.target.value as Unit })}>
                  {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
                </select>
              </div>
              {it.unit === 'custom' && <TextInput label="Custom unit" value={it.customUnit} onChange={(e) => update(i, { customUnit: e.target.value })} maxLength={30} />}
              <NumberInput label={`Rate (${currency})`} value={it.rate} onChange={(n) => update(i, { rate: n })} />
              <div className="min-w-0">
                <label className="label" htmlFor={`disc-${it.id}`}>Discount</label>
                <div className="flex gap-1">
                  <NumberInput label="Discount value" srOnlyLabel value={it.discountValue} onChange={(n) => update(i, { discountValue: n })} wrapClass="flex-1" id={`disc-${it.id}`} />
                  <select className="input w-14 px-1" aria-label="Discount type" value={it.discountType} onChange={(e) => update(i, { discountType: e.target.value as LineItem['discountType'] })}>
                    <option value="percent">%</option>
                    <option value="fixed">Amt</option>
                  </select>
                </div>
              </div>
              {taxMode !== 'none' && (
                <>
                  <div className="min-w-0">
                    <label className="label" htmlFor={`treat-${it.id}`}>Tax treatment</label>
                    <select id={`treat-${it.id}`} className="input" value={it.taxTreatment} onChange={(e) => update(i, { taxTreatment: e.target.value as LineItem['taxTreatment'] })}>
                      {Object.entries(TREATMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <NumberInput label="Tax %" value={it.taxRate} onChange={(n) => update(i, { taxRate: Math.min(100, n) })} list="tax-presets" disabled={it.taxTreatment !== 'taxable'} />
                </>
              )}
              <div className="col-span-2 flex items-end justify-end sm:col-span-1">
                <div className="text-right">
                  <div className="text-xs text-slate-500">Amount</div>
                  <div className="font-semibold tabular-nums">{r ? formatMoney(r.netMinor, currency) : '-'}</div>
                  {r && r.taxMinor > 0 && <div className="text-[11px] text-slate-500">+ tax {formatMoney(r.taxMinor, currency)}</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...items, emptyLine(defaultTaxRate)])}><Plus size={14} /> Add row</button>
        <select
          className="input w-auto max-w-full text-xs"
          aria-label="Add from service catalogue"
          value=""
          onChange={(e) => {
            const s = activeServices.find((x) => x.id === e.target.value);
            if (!s) return;
            const blank = items.length === 1 && !items[0].description && !items[0].rate;
            onChange(blank ? [lineFromService(s)] : [...items, lineFromService(s)]);
          }}
        >
          <option value="">+ Add from service catalogue…</option>
          {categories.map((cat) => (
            <optgroup key={cat} label={cat}>
              {activeServices.filter((s) => (s.category || 'Other') === cat).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

export function ChargesEditor({ charges, onChange, currency, taxMode }: { charges: Charge[]; onChange: (c: Charge[]) => void; currency: string; taxMode: TaxMode }) {
  const update = (i: number, patch: Partial<Charge>) => onChange(charges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-2">
      {charges.map((c, i) => (
        <div key={c.id} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <TextInput label="Charge" value={c.label} placeholder="Travel, shipping, reimbursable…" onChange={(e) => update(i, { label: e.target.value })} wrapClass="col-span-2 sm:col-span-1" />
          <NumberInput label={`Amount (${currency})`} value={c.amount} onChange={(n) => update(i, { amount: n })} />
          {taxMode !== 'none' ? <NumberInput label="Tax %" value={c.taxRate} onChange={(n) => update(i, { taxRate: Math.min(100, n) })} list="tax-presets" /> : <div />}
          <div className="flex items-end">
            <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => onChange(charges.filter((_, j) => j !== i))} aria-label="Remove charge"><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...charges, { id: uid(), label: '', amount: 0, taxRate: 0 }])}><Plus size={14} /> Add charge</button>
    </div>
  );
}
