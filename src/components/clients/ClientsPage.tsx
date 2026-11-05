import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, FilePlus2, Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react';
import type { Client } from '../../types';
import { deleteClient, putClient, useClients, useDocuments } from '../../services/storage/db';
import { emptyAddress } from '../../services/domain';
import { checkOptional, isEmail, isGstin, isPan, nowIso, uid } from '../../utils/misc';
import { Checkbox, EmptyState, Loading, Modal, PageHeader, TextArea, TextInput, useAction, useConfirm } from '../ui';
import AddressFields from '../forms/AddressFields';

const blank = (): Client => ({
  id: uid(), name: '', contactPerson: '', email: '', phone: '', billingAddress: emptyAddress(), shippingAddress: emptyAddress(),
  gstin: '', pan: '', notes: '', archived: false, createdAt: nowIso(), updatedAt: nowIso(),
});

export default function ClientsPage() {
  const clients = useClients();
  const docs = useDocuments();
  const run = useAction();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  useEffect(() => {
    if (params.get('new')) {
      setEditing(blank());
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs ?? []) if (d.client.clientId) m.set(d.client.clientId, (m.get(d.client.clientId) ?? 0) + 1);
    return m;
  }, [docs]);

  if (!clients) return <Loading />;
  const needle = q.trim().toLowerCase();
  const list = clients.filter((c) => (showArchived || !c.archived) && (!needle || [c.name, c.email, c.gstin].some((f) => f.toLowerCase().includes(needle))));

  const remove = async (c: Client) => {
    const used = usage.get(c.id) ?? 0;
    if (used) {
      const archive = await confirm({
        title: 'Client is used by documents',
        message: `${c.name} appears on ${used} saved document(s). Documents keep their own copy of client details, but archiving is recommended to preserve history. Archive instead?`,
        confirmLabel: 'Archive client',
      });
      if (archive) await run(() => putClient({ ...c, archived: true, updatedAt: nowIso() }), 'Client archived');
      return;
    }
    if (await confirm({ title: `Delete ${c.name}?`, message: 'This permanently removes the client from your directory.', confirmLabel: 'Delete', danger: true }))
      await run(() => deleteClient(c.id), 'Client deleted');
  };

  return (
    <div>
      <PageHeader title="Clients" subtitle="Saved client details prefill your documents." actions={
        <button className="btn-primary" onClick={() => setEditing(blank())}><UserPlus size={15} /> Add client</button>
      } />
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label className="label" htmlFor="c-search">Search</label>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-[30px] text-slate-400" />
          <input id="c-search" className="input pl-8" placeholder="Name, email or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Checkbox label="Show archived" checked={showArchived} onChange={setShowArchived} />
      </div>

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Users size={40} />} title={needle ? 'No matching clients' : 'No clients yet'} text="Add clients to reuse their billing details. You can also enter one-off client details directly on a document."
            action={!needle && <button className="btn-primary" onClick={() => setEditing(blank())}>Add your first client</button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <div key={c.id} className={`card flex flex-col p-4 ${c.archived ? 'opacity-70' : ''}`}>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{c.name}</h3>
                  {c.archived && <span className="rounded-full border border-slate-300 px-2 text-xs text-slate-500">Archived</span>}
                </div>
                {c.contactPerson && <p className="text-sm text-slate-600">{c.contactPerson}</p>}
                <p className="truncate text-sm text-slate-500">{[c.email, c.phone].filter(Boolean).join(' · ')}</p>
                {c.gstin && <p className="text-xs text-slate-500">GSTIN {c.gstin}</p>}
                <p className="mt-1 text-xs text-slate-400">{usage.get(c.id) ?? 0} document(s)</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                <button className="btn-secondary btn-sm" onClick={() => setEditing(c)}><Pencil size={13} /> Edit</button>
                <Link className="btn-ghost btn-sm" to={`/d/invoice/new`} state={{ clientId: c.id }}><FilePlus2 size={13} /> Invoice</Link>
                <button className="btn-ghost btn-sm" onClick={() => run(() => putClient({ ...c, archived: !c.archived, updatedAt: nowIso() }), c.archived ? 'Client restored' : 'Client archived')}>
                  {c.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />} {c.archived ? 'Restore' : 'Archive'}
                </button>
                <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(c)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && <ClientForm client={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ClientForm({ client, onClose }: { client: Client; onClose: () => void }) {
  const [c, setC] = useState(client);
  const [touched, setTouched] = useState(false);
  const [sameShip, setSameShip] = useState(!client.shippingAddress.line1);
  const run = useAction();
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setC((x) => ({ ...x, [k]: v }));
  const errors = {
    name: touched && !c.name.trim() ? 'Enter the client or company name.' : '',
    email: checkOptional(c.email, isEmail, 'Enter a valid email like name@company.com'),
    gstin: checkOptional(c.gstin, isGstin, 'GSTIN should be 15 characters, e.g. 27AAPFU0939F1ZV'),
    pan: checkOptional(c.pan, isPan, 'PAN should look like AAAAA9999A'),
  };
  const save = async () => {
    setTouched(true);
    if (!c.name.trim() || errors.email || errors.gstin || errors.pan) return;
    const r = await run(() => putClient({ ...c, name: c.name.trim(), shippingAddress: sameShip ? emptyAddress() : c.shippingAddress, updatedAt: nowIso() }), 'Client saved');
    if (r !== undefined) onClose();
  };
  return (
    <Modal open title={client.name ? `Edit ${client.name}` : 'Add client'} onClose={onClose} wide footer={<>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
      <button className="btn-primary" onClick={save}>Save client</button>
    </>}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label="Client / company name *" value={c.name} onChange={(e) => set('name', e.target.value)} error={errors.name} maxLength={300} />
        <TextInput label="Contact person" value={c.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} maxLength={200} />
        <TextInput label="Email" type="email" value={c.email} onChange={(e) => set('email', e.target.value)} error={errors.email} maxLength={200} />
        <TextInput label="Phone" value={c.phone} onChange={(e) => set('phone', e.target.value)} maxLength={50} />
        <TextInput label="GSTIN" value={c.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={errors.gstin} maxLength={15} />
        <TextInput label="PAN (optional)" value={c.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} error={errors.pan} maxLength={10} />
      </div>
      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Billing address</p>
      <AddressFields value={c.billingAddress} onChange={(a) => set('billingAddress', a)} />
      <div className="my-3"><Checkbox label="Shipping address same as billing" checked={sameShip} onChange={setSameShip} /></div>
      {!sameShip && <AddressFields value={c.shippingAddress} onChange={(a) => set('shippingAddress', a)} />}
      <TextArea wrapClass="mt-3" label="Notes (internal, not printed)" value={c.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
    </Modal>
  );
}
