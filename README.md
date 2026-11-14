# Pacific Trips — Complete Accounting System

Professional multi-module financial web application for **Pacific Trips, Lahore**.  
All figures in **PKR**. Full monthly isolation + historical drill-down.

## Features (maps 1:1 to your Excel workbook)

| Excel Sheet              | App Module          | Status |
|--------------------------|---------------------|--------|
| Instructions             | Sidebar help text   | Done |
| Dashboard                | /dashboard          | Full live KPIs |
| Transactions             | /transactions       | CRUD + Balance Check |
| Clients / Client Ledger  | /clients            | Schema + period |
| Receivables              | /receivables        | Live outstanding/overdue |
| TripPnL                  | /trips              | Schema + auto profit |
| Payables                 | /payables           | Done |
| Hotels                   | /hotels             | Done |
| Transport                | /transport          | Done |
| Ticketing                | /ticketing          | Done |
| Supplier Advances        | /advances           | Done |
| Refunds                  | /refunds            | Done |
| Commissions & Payroll    | /payroll            | Net pay formulas |
| Marketing & Office Exp   | /expenses           | Done |
| Petty Cash               | /petty-cash         | Done |
| Bank                     | /bank               | Multi-account |
| Cash Flow                | /cashflow           | Free Cash |
| Assets                   | /assets             | Done |
| Liabilities              | /liabilities        | Done |
| Owner Account            | /owner              | Separated |
| Monthly Closing          | /monthly-closing    | Done |
| Vadets                   | Seeded in Dashboard | Done |
| Sales Team Performance   | /sales-team         | Done |

### Monthly Isolation
- Every record belongs to a **Period** (year + month).
- Switch period in the top-right selector → entire app (Dashboard, lists, totals) shows that month only.
- Historical months remain fully editable and reportable.
- Close a period when ready (isClosed flag).

## Quick Start

Use Node.js 20.9 or later and a local PostgreSQL database. Create an empty application database and a separate shadow database, then copy .env.example to .env. Set the database URLs, generate a unique AUTH_SECRET, and set a unique DEFAULT_ADMIN_PASSWORD of at least 10 characters.

    npm ci
    npm run db:generate
    npm run db:push
    npm run dev

Open http://localhost:3000 and sign in with the initial administrator credentials. To populate a disposable development database with synthetic demo data, run npm run db:seed. The repository seed contains demonstration records only.

## Tech Stack
- Next.js 16 (App Router) + TypeScript
- Prisma + PostgreSQL
- Tailwind CSS
- Recharts (ready for charts)
- date-fns, zod, lucide-react

## Color Conventions (preserved)
- Yellow background = User input forms
- Green text = Linked / calculated values
- Red = Overdue / alerts / critical
- Blue = Informational

## Non-Negotiable Rules (enforced by design)
- Every transaction recorded
- Client & supplier balances always clear
- Trips closed only with actual cost & profit
- Refunds stay open until paid
- Company vs personal funds separated (Owner Account)
- Payment process: Request → Verification → Approval → Payment → Entry → Document

## Extending a Module
1. Open the corresponding model in prisma/schema.prisma
2. Copy the pattern from transactions/page.tsx + TransactionForm.tsx + /api/transactions
3. Add auto-calc logic (remaining = original − paid, days overdue, net pay, etc.) in the API or on save

## Data Location
Application data lives in PostgreSQL. Each month is a row in Period with related records.

## Production
- Configure PostgreSQL and set the required environment variables.
- Deploy to Vercel / any Node host

---
Built to replace the Excel workbook while keeping every feature and the monthly historical view you requested.
