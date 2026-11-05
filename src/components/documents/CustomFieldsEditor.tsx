import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CustomFieldDef, CustomFieldValue, DocType } from '../../types';
import { uid } from '../../utils/misc';

/** Edit a document's custom fields: values for configured fields, plus one-off fields for this document. */
export default function CustomFieldsEditor({ value, onChange, defs, type }: {
  value: CustomFieldValue[]; onChange: (v: CustomFieldValue[]) => void; defs: CustomFieldDef[]; type: DocType;
}) {
  const update = (i: number, patch: Partial<CustomFieldValue>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const missing = defs.filter((d) => d.docTypes.includes(type) && !value.some((v) => v.id === d.id));
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-slate-500">No additional fields on this document.</p>}
      {value.map((f, i) => {
        const configured = defs.some((d) => d.id === f.id);
        return (
          <div key={f.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
            <div className="min-w-0">
              <label className="label" htmlFor={`cfl-${f.id}`}>Field name</label>
              <input id={`cfl-${f.id}`} className="input" value={f.label} maxLength={100} readOnly={configured}
                title={configured ? 'Defined in Company Settings → Custom fields' : undefined}
                placeholder="e.g. Contract ID" onChange={(e) => update(i, { label: e.target.value })} />
            </div>
            <div className="min-w-0">
              <label className="label" htmlFor={`cfv-${f.id}`}>Value</label>
              <input id={`cfv-${f.id}`} className="input" value={f.value} maxLength={1000} onChange={(e) => update(i, { value: e.target.value })} />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
              <input type="checkbox" className="h-4 w-4" checked={f.showOnPdf} onChange={(e) => update(i, { showOnPdf: e.target.checked })} /> On PDF
            </label>
            <button type="button" className="btn-ghost btn-sm mb-1 text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove field ${f.label || i + 1}`}><Trash2 size={14} /></button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...value, { id: uid(), label: '', value: '', showOnPdf: true }])}><Plus size={14} /> Add field</button>
        {missing.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...value, ...missing.map((d) => ({ id: d.id, label: d.label, value: d.defaultValue, showOnPdf: d.showOnPdf }))])}>
            <Plus size={14} /> Add {missing.length} configured field{missing.length > 1 ? 's' : ''}
          </button>
        )}
        <Link to="/settings?tab=fields" className="text-xs text-brand-700 hover:underline">Manage default fields</Link>
      </div>
      <p className="text-xs text-slate-500">Fields marked “On PDF” with a value are printed in the document details block.</p>
    </div>
  );
}
