import { useState } from 'react';
import { Boxes, Pencil, Plus, Search, Trash2, RotateCcw } from 'lucide-react';
import { UNITS, type ServiceItem, type Unit } from '../../types';
import { UNIT_LABEL, starterServices, unitText } from '../../services/domain';
import { db, deleteService, guard, putService, useServices, useSettings } from '../../services/storage/db';
import { formatMoney, toMinor } from '../../utils/money';
import { nowIso, uid } from '../../utils/misc';
import { Checkbox, EmptyState, Loading, Modal, NumberInput, PageHeader, Select, TextArea, TextInput, useAction, useConfirm } from '../ui';

const blank = (taxRate: number): ServiceItem => ({
  id: uid(), name: '', category: '', description: '', unit: 'fixed', customUnit: '', defaultRate: 0, taxRate, serviceCode: '',
  active: true, createdAt: nowIso(), updatedAt: nowIso(),
});

export default function ServicesPage() {
  const services = useServices();
  const settings = useSettings();
  const run = useAction();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<ServiceItem | null>(null);

  if (!services || !settings) return <Loading />;
  const categories = [...new Set(services.map((s) => s.category || 'Other'))].sort();
  const needle = q.trim().toLowerCase();
  const list = services.filter((s) => (!cat || (s.category || 'Other') === cat) && (!needle || [s.name, s.description, s.serviceCode, s.category].some((f) => f.toLowerCase().includes(needle))));
  const cur = settings.defaultCurrency;

  const addStarters = async () => {
    if (!(await confirm({ title: 'Add starter services?', message: 'Adds the preset software/IT service list (about 30 items). Existing services are kept; you can edit or delete any of them.', confirmLabel: 'Add starter services' }))) return;
    await run(() => guard(() => db.services.bulkAdd(starterServices())), 'Starter services added');
  };

  return (
    <div>
      <PageHeader title="Services Catalogue" subtitle="Reusable services with default units, rates and tax. Starter items are fully editable." actions={
        <>
          <button className="btn-secondary" onClick={addStarters}><RotateCcw size={15} /> Add starter list</button>
          <button className="btn-primary" onClick={() => setEditing(blank(settings.defaultTaxRate))}><Plus size={15} /> New service</button>
        </>
      } />
      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <label className="label" htmlFor="s-search">Search</label>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-[30px] text-slate-400" />
          <input id="s-search" className="input pl-8" placeholder="Name, description or code" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="s-cat">Category</label>
          <select id="s-cat" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card"><EmptyState icon={<Boxes size={40} />} title={needle || cat ? 'No matching services' : 'Your catalogue is empty'} text="Create services you bill often, or add the starter list." /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th>Service</th><th className="hidden md:table-cell">Category</th><th className="hidden sm:table-cell">Unit</th><th className="text-right">Rate</th><th className="hidden sm:table-cell text-right">Tax</th><th className="sr-only">Actions</th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                  <td>
                    <div className="font-medium">{s.name}{!s.active && <span className="ml-1 text-xs text-slate-500">(inactive)</span>}</div>
                    {s.serviceCode && <div className="text-xs text-slate-500">Code {s.serviceCode}</div>}
                  </td>
                  <td className="hidden md:table-cell text-slate-600">{s.category}</td>
                  <td className="hidden sm:table-cell">{unitText(s.unit, s.customUnit)}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(toMinor(s.defaultRate, cur), cur)}</td>
                  <td className="hidden sm:table-cell text-right">{s.taxRate}%</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil size={14} /></button>
                    <button className="btn-ghost btn-sm text-red-600" aria-label={`Delete ${s.name}`} onClick={async () => {
                      if (await confirm({ title: `Delete ${s.name}?`, message: 'Existing documents are not affected.', confirmLabel: 'Delete', danger: true })) run(() => deleteService(s.id), 'Service deleted');
                    }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Rates shown in your default currency ({cur}). Rates are copied into documents as plain numbers in the document's currency.</p>
      {editing && <ServiceForm service={editing} categories={categories} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceForm({ service, categories, onClose }: { service: ServiceItem; categories: string[]; onClose: () => void }) {
  const [s, setS] = useState(service);
  const [touched, setTouched] = useState(false);
  const run = useAction();
  const set = <K extends keyof ServiceItem>(k: K, v: ServiceItem[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setTouched(true);
    if (!s.name.trim()) return;
    const r = await run(() => putService({ ...s, name: s.name.trim(), category: s.category.trim(), updatedAt: nowIso() }), 'Service saved');
    if (r !== undefined) onClose();
  };
  return (
    <Modal open title={service.name ? `Edit ${service.name}` : 'New service'} onClose={onClose} footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={save}>Save service</button>
    </>}>
      <datalist id="svc-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput wrapClass="sm:col-span-2" label="Service name *" value={s.name} onChange={(e) => set('name', e.target.value)} error={touched && !s.name.trim() ? 'Enter a service name.' : ''} maxLength={300} />
        <TextInput label="Category" list="svc-cats" value={s.category} onChange={(e) => set('category', e.target.value)} maxLength={200} />
        <TextInput label="Internal / SAC code" value={s.serviceCode} onChange={(e) => set('serviceCode', e.target.value)} maxLength={50} hint="User-entered; not auto-certified." />
        <TextArea wrapClass="sm:col-span-2" label="Default description" rows={2} value={s.description} onChange={(e) => set('description', e.target.value)} />
        <Select label="Default unit" value={s.unit} onChange={(e) => set('unit', e.target.value as Unit)} options={UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
        {s.unit === 'custom' ? <TextInput label="Custom unit name" value={s.customUnit} onChange={(e) => set('customUnit', e.target.value)} maxLength={30} /> : <div className="hidden sm:block" />}
        <NumberInput label="Default rate" value={s.defaultRate} onChange={(n) => set('defaultRate', n)} />
        <NumberInput label="Default tax %" value={s.taxRate} onChange={(n) => set('taxRate', Math.min(100, n))} />
        <div className="sm:col-span-2"><Checkbox label="Active (shown when adding items)" checked={s.active} onChange={(v) => set('active', v)} /></div>
      </div>
    </Modal>
  );
}
