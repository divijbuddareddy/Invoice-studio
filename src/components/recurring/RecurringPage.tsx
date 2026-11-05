import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Repeat, Trash2, Zap } from 'lucide-react';
import { FREQUENCY_LABEL } from '../../services/domain';
import { deleteRecurrence, putRecurrence, useDocuments, useRecurrences } from '../../services/storage/db';
import { findDueRecurrences, generateDueDrafts } from '../../features/documents/actions';
import { dueOccurrences } from '../../features/recurring/recurring';
import { formatDate, nowIso } from '../../utils/misc';
import { EmptyState, Loading, PageHeader, useAction, useConfirm } from '../ui';

export default function RecurringPage() {
  const rules = useRecurrences();
  const docs = useDocuments();
  const run = useAction();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map((docs ?? []).map((d) => [d.id, d])), [docs]);
  if (!rules || !docs) return <Loading />;
  const dueCount = rules.reduce((a, r) => a + dueOccurrences(r).length, 0);

  const generate = async () => {
    setBusy(true);
    const n = await run(async () => generateDueDrafts(await findDueRecurrences()));
    setBusy(false);
    if (n !== undefined) await run(async () => undefined, `${n} draft invoice${n === 1 ? '' : 's'} created`);
  };

  return (
    <div>
      <PageHeader title="Recurring Invoices" subtitle="Schedules that create draft invoices when you open the app on or after each due date." actions={
        <button className="btn-primary" disabled={!dueCount || busy} onClick={generate}><Zap size={15} /> {dueCount ? `Generate ${dueCount} due draft${dueCount > 1 ? 's' : ''}` : 'Nothing due'}</button>
      } />
      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        GitHub Pages is static hosting: nothing runs while this app is closed. Due periods are detected the next time you open the app, and drafts are only created after you confirm. Nothing is emailed or charged.
      </div>
      {rules.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Repeat size={40} />} title="No recurring schedules" text="Open a finalised invoice and choose “Make recurring” to bill retainers, subscriptions or maintenance contracts on a schedule."
            action={<Link className="btn-primary" to="/d/invoice">Open invoices</Link>} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-basic">
            <thead><tr><th>Template invoice</th><th>Frequency</th><th className="hidden sm:table-cell">Next date</th><th className="hidden md:table-cell">End</th><th>State</th><th className="sr-only">Actions</th></tr></thead>
            <tbody>
              {rules.map((r) => {
                const src = byId.get(r.sourceDocumentId);
                const due = dueOccurrences(r).length;
                return (
                  <tr key={r.id}>
                    <td>{src ? <Link className="font-medium text-brand-700 hover:underline" to={`/d/invoice/${src.id}`}>{src.number}</Link> : <span className="text-slate-400">source deleted</span>}
                      <div className="text-xs text-slate-500">{src?.client.name}</div></td>
                    <td>{FREQUENCY_LABEL[r.frequency]}</td>
                    <td className="hidden whitespace-nowrap sm:table-cell">{formatDate(r.nextDate)}{due > 0 && <span className="ml-1 text-xs font-medium text-amber-700">({due} due)</span>}</td>
                    <td className="hidden md:table-cell">{r.endDate ? formatDate(r.endDate) : 'No end'}</td>
                    <td>{r.active ? <span className="text-emerald-700">● Active</span> : <span className="text-slate-500">○ Paused</span>}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-ghost btn-sm" onClick={() => run(() => putRecurrence({ ...r, active: !r.active, updatedAt: nowIso() }), r.active ? 'Schedule paused' : 'Schedule resumed')}
                        aria-label={r.active ? 'Pause schedule' : 'Resume schedule'}>{r.active ? <Pause size={14} /> : <Play size={14} />}</button>
                      <button className="btn-ghost btn-sm text-red-600" aria-label="Delete schedule" onClick={async () => {
                        if (await confirm({ title: 'Delete schedule?', message: 'Drafts already generated are kept.', confirmLabel: 'Delete', danger: true })) run(() => deleteRecurrence(r.id), 'Schedule deleted');
                      }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
