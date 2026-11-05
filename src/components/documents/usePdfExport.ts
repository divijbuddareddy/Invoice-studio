import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Branding, DocumentRecord, Payment } from '../../types';
import { buildDocumentPdf, buildReceiptPdf, downloadPdf, printPdf, type PdfResult } from '../../services/pdf/pdf';
import { loadUnicodeFont } from '../../services/pdf/fonts';
import { getSettings } from '../../services/storage/db';
import { useConfirm, useToast } from '../ui';

/** Settings branding, with the Unicode font loaded first when it's selected. */
export async function brandingForPdf(): Promise<Branding> {
  const { branding } = await getSettings();
  if (branding.font === 'noto') await loadUnicodeFont();
  return branding;
}

/** Download/print/share with the "logo required for final export" rule and warning reporting. */
export function usePdfExport() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  const gate = useCallback(
    async (doc: DocumentRecord): Promise<boolean> => {
      if (doc.status === 'draft' || doc.companySnapshot.logo) return true;
      const go = await confirm({
        title: 'Company logo required',
        message: 'A company logo is required for final document export. Upload one in Company Settings, then re-open this document (finalised documents keep the company details they were saved with — use Edit → "Refresh company details" to update them). Draft documents can be exported without a logo and are watermarked DRAFT.',
        confirmLabel: 'Open Company Settings',
      });
      if (go) navigate('/settings');
      return false;
    },
    [confirm, navigate],
  );

  const report = useCallback((r: PdfResult) => {
    if (r.warnings.length) toast('info', r.warnings.join(' '));
  }, [toast]);

  /** Build the PDF for a document (after the logo gate). Returns null if blocked or failed. */
  const prepareDoc = useCallback(
    async (doc: DocumentRecord, payments: Payment[]): Promise<PdfResult | null> => {
      if (!(await gate(doc))) return null;
      try {
        const r = buildDocumentPdf(doc, payments, await brandingForPdf());
        report(r);
        return r;
      } catch (e) {
        toast('error', `PDF could not be generated: ${(e as Error).message}`);
        return null;
      }
    },
    [gate, report, toast],
  );

  const prepareReceipt = useCallback(
    async (payment: Payment, invoice: DocumentRecord, payments: Payment[]): Promise<PdfResult | null> => {
      try {
        const r = buildReceiptPdf(payment, invoice, payments, await brandingForPdf());
        report(r);
        return r;
      } catch (e) {
        toast('error', `Receipt could not be generated: ${(e as Error).message}`);
        return null;
      }
    },
    [report, toast],
  );

  const exportDoc = useCallback(
    async (doc: DocumentRecord, payments: Payment[], mode: 'download' | 'print') => {
      const r = await prepareDoc(doc, payments);
      if (r) (mode === 'download' ? downloadPdf : printPdf)(r);
    },
    [prepareDoc],
  );

  const exportReceipt = useCallback(
    async (payment: Payment, invoice: DocumentRecord, payments: Payment[], mode: 'download' | 'print') => {
      const r = await prepareReceipt(payment, invoice, payments);
      if (r) (mode === 'download' ? downloadPdf : printPdf)(r);
    },
    [prepareReceipt],
  );

  return { exportDoc, exportReceipt, prepareDoc, prepareReceipt };
}
