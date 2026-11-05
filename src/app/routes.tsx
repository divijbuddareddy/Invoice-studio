import { createHashRouter, Navigate, useParams } from 'react-router-dom';
import Shell from '../components/layout/Shell';
import Dashboard from '../components/dashboard/Dashboard';
import DocumentList from '../components/documents/DocumentList';
import DocumentEditor from '../components/documents/DocumentEditor';
import DocumentView from '../components/documents/DocumentView';
import ReceiptsPage from '../components/receipt/ReceiptsPage';
import ClientsPage from '../components/clients/ClientsPage';
import ServicesPage from '../components/services/ServicesPage';
import RecurringPage from '../components/recurring/RecurringPage';
import SettingsPage from '../components/settings/SettingsPage';
import ReportsPage from '../components/reports/ReportsPage';
import { DOC_TYPES, type DocType } from '../types';
import { EmptyState } from '../components/ui';

function TypeGuard({ view }: { view: 'list' | 'new' | 'edit' | 'view' }) {
  const { type, id } = useParams();
  if (!DOC_TYPES.includes(type as DocType)) {
    return <EmptyState title="Page not found" text="This document type does not exist." />;
  }
  const t = type as DocType;
  if (view === 'list') return <DocumentList key={t} type={t} />;
  if (view === 'new') return <DocumentEditor key={`new-${t}`} type={t} />;
  if (view === 'edit') return <DocumentEditor key={`edit-${id}`} type={t} id={id} />;
  return <DocumentView key={id} id={id!} />;
}

// Hash routing: refreshing any nested route works on GitHub Pages without 404 fallbacks.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'd/:type', element: <TypeGuard view="list" /> },
      { path: 'd/:type/new', element: <TypeGuard view="new" /> },
      { path: 'd/:type/:id', element: <TypeGuard view="view" /> },
      { path: 'd/:type/:id/edit', element: <TypeGuard view="edit" /> },
      { path: 'history', element: <DocumentList /> },
      { path: 'receipts', element: <ReceiptsPage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'recurring', element: <RecurringPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
