import type { Totals } from '../../services/calculations/calc';
import { formatMoney } from '../../utils/money';

export default function TotalsSummary({ totals, showPaid, discountLabel }: { totals: Totals; showPaid: boolean; discountLabel?: string }) {
  const c = totals.currency;
  const f = (m: number) => formatMoney(m, c);
  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <div className={`flex justify-between gap-4 py-1 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="text-sm" aria-live="polite">
      <Row label="Subtotal" value={f(totals.subtotalMinor)} />
      {totals.lineDiscountMinor > 0 && <Row label="Line discounts" value={`−${f(totals.lineDiscountMinor)}`} />}
      {totals.invoiceDiscountMinor > 0 && <Row label={`Invoice discount${discountLabel ?? ''}`} value={`−${f(totals.invoiceDiscountMinor)}`} />}
      <Row label="Taxable value" value={f(totals.taxableMinor - totals.nonTaxableMinor)} />
      {totals.nonTaxableMinor > 0 && <Row label="Zero-rated / exempt / non-GST" value={f(totals.nonTaxableMinor)} />}
      {totals.charges.map((ch) => <Row key={ch.id} label={ch.label || 'Additional charge'} value={f(ch.amountMinor)} />)}
      {totals.taxRows.map((t) => <Row key={`${t.label}${t.rate}`} label={`${t.label} @ ${t.rate}%`} value={f(t.taxMinor)} />)}
      {totals.roundOffMinor !== 0 && <Row label="Round off" value={f(totals.roundOffMinor)} />}
      <div className="my-1 border-t border-slate-200" />
      <Row label="Grand total" value={f(totals.grandTotalMinor)} strong />
      {showPaid && (
        <>
          <Row label="Advance / amount paid" value={f(totals.paidMinor)} />
          <Row label="Balance due" value={f(totals.balanceMinor)} strong />
        </>
      )}
      {(totals.lineDiscountMinor > 0 || totals.invoiceDiscountMinor > 0) && (
        <p className="mt-1 text-xs italic text-slate-500">Discounts are applied before tax.</p>
      )}
    </div>
  );
}
