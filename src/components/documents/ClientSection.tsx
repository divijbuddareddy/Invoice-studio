import { useState } from 'react';
import { Save, Search } from 'lucide-react';
import type { Client, ClientSnapshot } from '../../types';
import { putClient, useClients } from '../../services/storage/db';
import { TextInput, Checkbox, useAction } from '../ui';
import AddressFields from '../forms/AddressFields';
import { checkOptional, isEmail, isGstin, isPan, nowIso, uid } from '../../utils/misc';

export function snapshotFromClient(c: Client): ClientSnapshot {
  return {
    clientId: c.id, name: c.name, contactPerson: c.contactPerson, email: c.email, phone: c.phone,
    billingAddress: { ...c.billingAddress }, shippingAddress: { ...c.shippingAddress }, gstin: c.gstin, pan: c.pan,
  };
}

export default function ClientSection({ value, onChange, partyLabel, errors }: {
  value: ClientSnapshot; onChange: (c: ClientSnapshot) => void; partyLabel: string; errors: Record<string, string>;
}) {
  const clients = useClients();
  const run = useAction();
  const [q, setQ] = useState('');
  const [showShip, setShowShip] = useState(() => !!value.shippingAddress.line1);
  const active = (clients ?? []).filter((c) => !c.archived);
  const filtered = q
    ? active.filter((c) => [c.name, c.email, c.gstin].some((f) => f.toLowerCase().includes(q.toLowerCase())))
    : active;
  const set = <K extends keyof ClientSnapshot>(k: K, v: ClientSnapshot[K]) => onChange({ ...value, [k]: v });

  const saveToDirectory = async () => {
    const t = nowIso();
    const c: Client = {
      id: value.clientId ?? uid(), name: value.name.trim(), contactPerson: value.contactPerson, email: value.email, phone: value.phone,
      billingAddress: value.billingAddress, shippingAddress: value.shippingAddress, gstin: value.gstin.toUpperCase(), pan: value.pan.toUpperCase(),
      notes: '', archived: false, createdAt: t, updatedAt: t,
    };
    const ok = await run(() => putClient(c), value.clientId ? 'Client record updated' : 'Client saved to directory');
    if (ok !== undefined) onChange({ ...value, clientId: c.id });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="label" htmlFor="client-search">Search saved clients</label>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input id="client-search" className="input pl-8" placeholder="Name, email or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="client-pick">Select {partyLabel.toLowerCase()}</label>
          <select
            id="client-pick"
            className="input"
            value={value.clientId ?? ''}
            onChange={(e) => {
              const c = active.find((x) => x.id === e.target.value);
              if (c) {
                onChange(snapshotFromClient(c));
                setShowShip(!!c.shippingAddress.line1);
              } else onChange({ ...value, clientId: undefined });
            }}
          >
            <option value="">— One-off / not saved —</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` (${c.gstin})` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label={`${partyLabel} name *`} value={value.name} onChange={(e) => set('name', e.target.value)} error={errors.clientName} maxLength={300} />
        <TextInput label="Contact person" value={value.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} maxLength={200} />
        <TextInput label="Email" type="email" value={value.email} onChange={(e) => set('email', e.target.value)} error={checkOptional(value.email, isEmail, 'Enter a valid email like name@company.com')} />
        <TextInput label="Phone" value={value.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />
        <TextInput label="GSTIN" value={value.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15}
          error={checkOptional(value.gstin, isGstin, 'GSTIN should be 15 characters, e.g. 27AAPFU0939F1ZV')} />
        <TextInput label="PAN" value={value.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} maxLength={10}
          error={checkOptional(value.pan, isPan, 'PAN should look like AAAAA9999A')} />
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Billing address</p>
        <AddressFields value={value.billingAddress} onChange={(a) => set('billingAddress', a)} />
      </div>
      <Checkbox label="Different shipping / service address" checked={showShip} onChange={(v) => {
        setShowShip(v);
        if (!v) set('shippingAddress', { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' });
      }} />
      {showShip && <AddressFields value={value.shippingAddress} onChange={(a) => set('shippingAddress', a)} />}
      <button type="button" className="btn-secondary btn-sm" disabled={!value.name.trim()} onClick={saveToDirectory}>
        <Save size={14} /> {value.clientId ? 'Update saved client' : 'Save to client directory'}
      </button>
    </div>
  );
}
