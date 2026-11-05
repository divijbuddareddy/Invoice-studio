# Software Invoice Studio

A browser-based invoice and business-document generator for software companies, IT service providers, SaaS businesses, AI companies and technology consultancies.

It runs entirely in your browser: **no server, no login, no database server, no API keys, no paid services.** Everything is stored locally in the browser (IndexedDB), and you export polished A4 PDFs generated client-side. It is designed to be hosted as a static site on **GitHub Pages**.

> **Tax notice.** Invoice formats and tax obligations vary by jurisdiction, transaction type and business status. This app provides configurable fields and calculation support. It does not claim that any generated document is legally compliant. For India, verify GST invoice particulars, tax rates, place-of-supply rules, e-invoicing applicability and record-retention requirements with a qualified accountant or official government resources.

---

## Features

| Area | What you get |
|---|---|
| **Documents** | Invoices (Tax Invoice when GST applies), Quotations (convert to invoice), Proforma Invoices, Credit Notes and Debit Notes (linked to the original invoice), Payment Receipts, and Purchase Orders. Each has its own title, numbering prefix and PDF layout. |
| **Editor** | Two-column editor with a **live preview of the actual generated PDF**. Tabs on mobile. Actions: Save draft, Save & finalise, Download PDF, Print, Duplicate, Reset. You are warned before leaving with unsaved changes. |
| **Line items** | Multi-line descriptions, SAC/HSN codes, fractional quantities, units (fixed, hour, day, week, month, year, seat, milestone, custom), per-line fixed or percentage discount, per-line tax rate and treatment (taxable, zero-rated, exempt, non-GST, out of scope), reorder, add from catalogue. |
| **Calculations** | One shared, unit-tested engine working in integer minor units. Invoice-level discount is allocated across lines before tax. Additional charges can carry their own tax. Supports advance payments, optional round-off, CGST+SGST / IGST / other named tax / no tax, and multiple currencies. |
| **GST support** | Supplier state, place of supply, a suggested (never forced) tax mode, reverse charge, GSTIN/PAN structure checks, and a tax breakdown per rate. |
| **Payments** | Multiple partial payments, overpayment prevention, automatic Unpaid / Partially Paid / Paid / Overdue status, manual override with a required reason (logged), and a receipt PDF for each payment. |
| **PDF** | Real vector PDFs from jsPDF + AutoTable. A4 portrait, repeating table headers, multiple pages, page numbers and footer. Embedded logo, signature and stamp. Locally generated UPI QR code. Amount in words (lakh/crore for INR). A DRAFT watermark on drafts. |
| **Templates** | Corporate Blue, Minimal Professional, Technology Modern and Executive. These are genuinely different layouts. You can configure the primary and secondary colours, font (Helvetica, Times or Courier), logo alignment and signature visibility. |
| **Clients & services** | Client directory (search, archive, delete warnings, one-off clients). Editable service catalogue seeded with ~30 software/IT starter services. |
| **Recurring** | Weekly, monthly, quarterly, half-yearly and yearly schedules. Due drafts are offered when you open the app, with duplicate-period prevention and month-end clamping. Nothing is sent or charged automatically. |
| **History & dashboard** | Search by number, client, project or PO. Filter by type, status, date range and currency, sort by several columns, and archive. The dashboard shows per-currency totals, outstanding and overdue amounts, and recent documents. |
| **Custom fields** | Define your own fields (e.g. Contract ID, Vendor code, LUT/ARN no.) in Settings → Custom fields. Choose which document types they appear on, set a default value, and decide whether they print on the PDF. You can also add one-off fields on any document. They are included in CSV exports. |
| **Reports & CSV** | Pick a period (this month, last month, Indian financial year, calendar year, all time or custom) and a currency. See invoiced, taxable, tax, received and outstanding amounts, plus net after credit/debit notes. Tables break this down monthly, by GST rate (CGST/SGST/IGST), and by client. CSV exports cover the summary, documents, line items (HSN/SAC-wise) and payments. The CSVs are Excel-friendly (UTF-8 BOM) and protected against formula injection. |
| **Share** | Share any document or receipt through the device's share sheet with the PDF attached (most phones). You can also use your own email app (mailto) or WhatsApp (wa.me) with a prefilled message, in which case the PDF is downloaded for you to attach. No server is involved, and nothing is sent until you press send. |
| **Unicode PDF font** | Optional bundled Noto Sans (SIL OFL) prints ₹/€ symbols and accented, Greek and Cyrillic text. It is served from this site and loaded only when selected, and adds about 150–250 KB per PDF. |
| **Dark mode** | Light, Dark or Match system (sidebar toggle or Settings → Branding). PDFs always print on white. |
| **Backup** | Versioned JSON export. Imports are validated with Zod, show a preview of record counts, and offer three restore modes: replace, merge keeping local records, or merge with the backup winning conflicts. Includes a clear-all action with strong confirmation. |

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | React + Vite + TypeScript | react 18.3, vite 5.4, typescript 5.6 |
| Routing | React Router (hash router) | 6.30 |
| Styling | Tailwind CSS | 3.4 |
| Icons | Lucide React | 0.460 |
| PDF | jsPDF + jsPDF-AutoTable | 3.0 / 5.0 |
| QR | qrcode (drawn as vector rectangles in the PDF) | 1.5 |
| Storage | IndexedDB via Dexie (+ dexie-react-hooks) | 4.x |
| Validation | Zod | 3.25 |
| Tests | Vitest (+ jsdom and fake-indexeddb for the UI smoke test) | 2.1 |

Exact resolved versions are pinned in `package-lock.json`.

## Getting started

Requires **Node.js 20+** and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run all unit tests and the UI smoke test |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |

### First run

1. Open **Company Settings**. Enter your legal name, address, GSTIN/PAN, bank details and UPI ID, and upload your logo. **A logo is required for final (non-draft) PDF export.**
2. Optionally adjust **Branding & templates** and **Numbering & defaults**.
3. Add clients, or enter one-off client details directly on a document.
4. Create an invoice, then use **Save & finalise** and **Download PDF**.

## Deploying to GitHub Pages

The build uses a **relative base path (`./`) and hash-based routing**. It therefore works under any repository name (`https://<user>.github.io/<repo>/`) and on a custom domain, and refreshing a nested route never returns a 404.

1. Create a GitHub repository and push this project to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Software Invoice Studio"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. On GitHub, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs on every push to `main`. It installs dependencies, then runs lint, typecheck and tests, builds, and deploys `dist/`. You can also run it manually from the **Actions** tab.
4. Your site is published at `https://<user>.github.io/<repo>/`.

**Custom domain:** add a file `public/CNAME` containing your domain (e.g. `invoices.example.com`), configure the DNS records GitHub describes, and set the domain under Settings → Pages.

**Absolute base path (optional):** build with `VITE_BASE=/<repo>/ npm run build` if you prefer absolute asset URLs.

## Data storage & privacy

- All data is stored **only in the current browser on the current device**. Structured records and images go to IndexedDB; a few UI preferences go to localStorage.
- No analytics, tracking, remote fonts or network requests containing your data. The app makes **no API calls**.
- Data is **not synced**. Clearing site data, using private/incognito mode, or switching browser or device can make records unavailable. You can ask the browser for persistent storage under Settings → Backup & data.
- Do not store card numbers, passwords or other payment credentials in notes.
- Uploaded images are validated by type and size, and rasterised to PNG through a canvas. SVGs containing scripts or embedded HTML are rejected, and no SVG markup is ever stored or embedded.
- Imported backups are treated as untrusted input. They are schema-validated with Zod, version-checked, and size-limited (images must be safe PNG/JPEG data under the size limit). Malformed files are rejected without changing any data.
- Storage failures (quota exceeded, blocked storage) are reported with a clear message. Changes are never silently discarded.

## Backup & restore

- **Export:** Settings → Backup & data → *Export backup (JSON)*. The file contains the company profile (with images), clients, services, documents, payments, recurring schedules and settings, in versioned format `schemaVersion: 1`.
- **Restore:** *Choose backup file…* shows the record counts first. Then pick one of:
  - **Merge, keep my existing records** (default). This adds new IDs and keeps the local copy on any conflict.
  - **Merge, backup wins on conflicts.**
  - **Replace everything.** This needs an extra confirmation.
- PDFs are not stored in the backup. They are regenerated from the data at any time.
- Use backups to move your data to another browser or device.

## Project structure

```
src/
  app/            App.tsx (storage bootstrap), routes.tsx (hash router), UI smoke test
  components/
    layout/       Shell: sidebar, mobile nav, recurring-due prompt
    dashboard/    Dashboard
    documents/    Editor, view, list/history, line items, totals, live PDF preview
    receipt/      Payment dialog, receipts page
    clients/ services/ recurring/ settings/
    forms/        Shared form pieces
    ui.tsx        Fields, modal, confirm dialog, toasts, status badges
  features/
    documents/    Lifecycle actions (save, numbering, duplicate, convert, payments, recurring generation)
    payments/     Payment maths & validation
    recurring/    Pure schedule logic
  services/
    calculations/ Shared calculation engine (+ tests)
    pdf/          PDF templates & generation (+ tests)
    storage/      Dexie database + storage abstraction, localStorage prefs
    backup/       Backup schema/validation (+ tests) and restore
    domain.ts     Document types, labels, defaults, GST states, starter catalogue
  types/          TypeScript interfaces
  utils/          Money (minor units), dates, validation, images, amount in words
```

Each saved document stores a **snapshot** of the company and client details. Later profile changes don't rewrite historical documents. Use *Refresh company details* in the editor to update a document on purpose.

## Testing

`npm test` runs:

- **Calculations:** quantity × rate, fractional hours, line and invoice discounts before tax, capping so values never go negative, CGST/SGST and IGST, mixed rates, exempt and zero-rated items, charges, advances, round-off, floating-point safety, and JPY with zero decimals.
- **Money and formatting:** INR, USD, EUR and GBP symbols and codes, Indian digit grouping, amount in words, GSTIN/PAN/IFSC checks, filenames, numbering tokens, and month-end dates.
- **Documents:** titles per type (quotations and proformas are never labelled as tax invoices) and status derivation (unpaid, partially paid, paid, overdue, override).
- **Payments and recurring:** overpayment prevention, exact sums of partial payments, all frequencies, end dates, and duplicate-period prevention.
- **Backup:** valid import, non-JSON, foreign JSON, future versions, malformed records, and unsafe images.
- **PDF:** every document type, multi-page output on all four templates, templates producing distinct output, and receipts.
- **Unicode font and custom fields:** Noto Sans embedding (₹ and accented text), Helvetica fallback with a warning when the font isn't loaded, custom fields added per document type, and only fields marked for the PDF printed.
- **Reports, CSV and share:** filtering by status, date and currency, GST rate-wise and monthly sums, payments received, credit-note netting, CSV quoting and formula-injection guard, and mailto/WhatsApp link building.
- **UI smoke test:** boots the full app against an in-memory IndexedDB, renders every route (including Reports and every Settings tab), and checks a saved invoice with a partial payment across the view, edit, history, receipts, reports and dashboard pages.

## Known limitations

- **No background jobs.** Static hosting cannot run tasks while the app is closed. Recurring drafts are offered the next time you open the app.
- **Invoice numbers are unique only within one browser.** They are not coordinated across devices.
- **No email sending, payment collection, bank verification, GST portal filing, e-invoicing (IRP/IRN) or accounting sync.** These are intentionally out of scope.
- **PDF fonts:** with the built-in fonts (Helvetica, Times, Courier), amounts use ISO codes (`INR 1,000.00`) and characters outside Latin-1 print as `?`. Choose **Noto Sans** in Settings → Branding to print ₹ and accented, Greek or Cyrillic text. Complex scripts such as Devanagari, and CJK and emoji, are not supported by the PDF engine.
- **Sharing:** browsers can't attach files to email or WhatsApp links, so those options download the PDF for you to attach. Direct file sharing needs the Web Share API (most mobile browsers, some desktop ones). The WhatsApp option passes the message text through WhatsApp's wa.me link service.
- **Reports** are bookkeeping summaries to help prepare returns such as GSTR-1 and 3B. They are not filings. Verify them against your books.
- **Mobile PDF preview:** some mobile browsers can't display PDFs inline. Use *Open in new tab* or *Download PDF*.
- **Currency conversion:** foreign-currency amounts are entered by you. There is no live conversion. Dashboard totals are shown per currency and never summed across currencies.
