import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownUp, Download, FilePlus2, FileText, Search } from 'lucide-react';
import { DOC_TYPES, type DocStatus, type DocType } from '../../types';
import { DOC_META, STATUS_LABEL } from '../../services/domain';
import { useDocuments, usePayments } from '../../services/storage/db';
import { docSummary } from '../../features/payments/payments';
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/misc';
import { Checkbox, EmptyState, Loading, PageHeader, StatusBadge } from '../ui';
import { usePdfExport } from './usePdfExport';

type SortKey = 'date' | 'number' | 'client' | 'amount';

export default function DocumentList({ type }: { type?: DocType }) {
  const docs = useDocuments();
  const payments = usePayments();
  const { exportDoc } = usePdfExport();
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(type ?? '');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>('date');
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => {
    if (!docs) return [];
    const needle = q.trim().toLowerCase();
    const list = docs
      .filter((d) => (type ? d.type === type : !typeFilter || d.type === typeFilter))
      .filter((d) => archived || !d.archived)
      .map((d) => ({ d, ...docSummary(d, payments ?? []) }))
      .filter(({ d, status: s }) =>
        (!needle || [d.number, d.client.name, d.projectName, d.poReference].some((f) => f.toLowerCase().includes(needle))) &&
        (!status || s === status) && (!currency || d.currency === currency) && (!from || d.issueDate >= from) && (!to || d.issueDate <= to));
    const dir = desc ? -1 : 1;
    list.sort((a, b) => {
      let c = 0;
      if (sort === 'date') c = a.d.issueDate.localeCompare(b.d.issueDate) || a.d.createdAt.localeCompare(b.d.createdAt);
      else if (sort === 'number') c = a.d.number.localeCompare(b.d.number, undefined, { numeric: true });
      else if (sort === 'client') c = a.d.client.name.localeCompare(b.d.client.name);
      else c = a.totals.grandTotalMinor - b.totals.grandTotalMinor;
      return c * dir;
    });
    return list;
  }, [docs, payments, q, type, typeFilter, status, currency, from, to, archived, sort, desc]);

  if (!docs) return <Loading />;
  const title = type ? DOC_META[type].plural : 'Invoice History';
  const statuses: DocStatus[] = type ? DOC_META[type].statuses : (Object.keys(STATUS_LABEL) as DocStatus[]);
  const currencies = [...new Set(docs.map((d) => d.currency))].sort();
  const anyFilter = q || status || currency || from || to || (!type && typeFilter);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button className="inline-flex items-center gap-1 uppercase" onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(k === 'date' || k === 'amount')))} aria-label={`Sort by ${label}`}>
      {label} {sort === k && <ArrowDownUp size={11} />}
    </button>
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={type ? undefined : 'All saved documents. Search, filter, open, duplicate or download again.'}
        actions={
          type ? (
            <Link className="btn-primary" to={`/d/${type}/new`}><FilePlus2 size={15} /> New {DOC_META[type].label}</Link>
          ) : (
            <Link className="btn-primary" to="/d/invoice/new"><FilePlus2 size={15} /> New Invoice</Link>
          )
        }
      />

      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <label className="label" htmlFor="doc-search">Search</label>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-[30px] text-slate-400" />
          <input id="doc-search" className="input pl-8" placeholder="Number, client, project or PO" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!type && (
          <div>
            <label className="label" htmlFor="f-type">Type</label>
            <select id="f-type" className="input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_META[t].label}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-cur">Currency</label>
          <select id="f-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="">All</option>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1">
          <div><label className="label" htmlFor="f-from">From</label><input id="f-from" type="date" className="input px-1.5" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label" htmlFor="f-to">To</label><input id="f-to" type="date" className="input px-1.5" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-6">
          <Checkbox label="Include archived" checked={archived} onChange={setArchived} />
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {rows.length} result{rows.length === 1 ? '' : 's'}
            {anyFilter && <button className="btn-ghost btn-sm" onClick={() => { setQ(''); setStatus(''); setCurrency(''); setFrom(''); setTo(''); if (!type) setTypeFilter(''); }}>Clear filters</button>}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={<FileText size={40} />} title={anyFilter ? 'No matching documents' : `No ${type ? DOC_META[type].plural.toLowerCase() : 'documents'} yet`}
            text={anyFilter ? 'Try different search terms or clear the filters.' : 'Documents you save appear here. Everything is stored locally in this browser.'}
            action={!anyFilter && <Link className="btn-primary" to={`/d/${type ?? 'invoice'}/new`}>Create {type ? DOC_META[type].label.toLowerCase() : 'an invoice'}</Link>} />
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {rows.map(({ d, totals, status: s }) => (
              <li key={d.id} className="card p-3">
                <Link to={`/d/${d.type}/${d.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{d.number}</div>
                      <div className="truncate text-sm text-slate-600">{d.client.name || '—'}</div>
                      <div className="text-xs text-slate-500">{!type && `${DOC_META[d.type].label} · `}{formatDate(d.issueDate)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular-nums">{formatMoney(totals.grandTotalMinor, d.currency)}</div>
                      <div className="mt-1"><StatusBadge status={s} /></div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-basic">
              <thead>
                <tr>
                  <th><SortBtn k="number" label="Number" /></th>
                  {!type && <th>Type</th>}
                  <th><SortBtn k="client" label="Client" /></th>
                  <th><SortBtn k="date" label="Date" /></th>
                  <th>{type ? DOC_META[type].dueLabel || 'Reference' : 'Due'}</th>
                  <th className="text-right"><SortBtn k="amount" label="Amount" /></th>
                  {(!type || type === 'invoice') && <th className="text-right">Balance</th>}
                  <th>Status</th>
                  <th className="sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, totals, status: s }) => (
                  <tr key={d.id}>
                    <td><Link className="font-medium text-brand-700 hover:underline" to={`/d/${d.type}/${d.id}`}>{d.number}</Link>{d.archived && <span className="ml-1 text-xs text-slate-400">(archived)</span>}</td>
                    {!type && <td className="text-slate-600">{DOC_META[d.type].label}</td>}
                    <td className="max-w-[220px] truncate">{d.client.name || '—'}{d.projectName && <div className="truncate text-xs text-slate-500">{d.projectName}</div>}</td>
                    <td className="whitespace-nowrap">{formatDate(d.issueDate)}</td>
                    <td className="whitespace-nowrap text-slate-600">{d.dueDate ? formatDate(d.dueDate) : d.referenceNumber || '—'}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(totals.grandTotalMinor, d.currency)}</td>
                    {(!type || type === 'invoice') && <td className="whitespace-nowrap text-right tabular-nums">{d.type === 'invoice' ? formatMoney(Math.max(0, totals.balanceMinor), d.currency) : '—'}</td>}
                    <td><StatusBadge status={s} /></td>
                    <td className="whitespace-nowrap text-right">
                      <button className="btn-ghost btn-sm" onClick={() => exportDoc(d, payments ?? [], 'download')} aria-label={`Download PDF for ${d.number}`}><Download size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
