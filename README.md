# JENGAKWANZA Business Management System

A comprehensive, enterprise-grade Business Management, ERP, and Point of Sale (POS) system built for **JENGAKWANZA LIMITED**, located in Arusha, Tanzania.

---

## 🏢 Business Identity & Credentials

All printed receipts, commercial tax invoices, quotations, delivery notes, and purchase orders automatically feature the official company credentials:

- **Company Name:** JENGAKWANZA LIMITED
- **Phone Numbers:** `0788989889` / `0713550104`
- **Postal Address:** P.O.BOX 14991 ARUSHA
- **Official Email:** `jengakwanzaltd@gmail.com`
- **Default Currency:** Tanzanian Shilling (TZS / TSh)
- **Company Logo:** Embedded high-resolution vector emblem (`public/assets/logo.svg`)

---

## 🚀 Quick Start & How to Run

### Method 1: One-Click Terminal Launch (Recommended)
Open your terminal in the project directory and run:
```bash
./start.sh
```
This automatically initializes the clean database, boots the local server on `http://localhost:8080`, and opens your web browser directly to the application.

### Method 2: Direct Server Launch
```bash
ruby server.rb
```
Then visit [http://localhost:8080](http://localhost:8080) in your browser.

### Method 3: Direct Standalone Browser Mode (No Server Needed)
Double-click `public/index.html` to open it in Chrome, Safari, or Firefox. The built-in client engine will save all transactions into local browser storage.

---

## 🔐 Default Admin Account & Access

On first launch, the system is provisioned with a secure initial administrator account:

| Field | Value |
|---|---|
| **Username** | `admin` |
| **Password** | `admin123` |
| **Role** | System Administrator |

> 💡 **Tip:** Once logged in, the Admin can change their password under **Staff & Admin > Workers & Daily Shifts** or add new workers.

---

## 📦 Zero Dummy Data Guarantee

This system starts completely **clean** with **zero sample or fake transactions**:
- `0` Mock products (ready for your real physical stock)
- `0` Mock customers (ready for your real clients)
- `0` Mock sales / orders
- `0` Mock expenses

Only system configuration, the initial Admin profile, and official JENGAKWANZA branding are loaded.

---

## 🛠️ Included Core Modules & Features

### 1. Point of Sale (POS)
- Fast barcode / SKU / search product lookup.
- Real-time stock availability check preventing overselling.
- Dynamic shopping cart with quantity adjuster, unit pricing, and custom order discounts.
- Flexible payment methods: **Cash**, **M-Pesa**, **Tigo Pesa**, **Airtel Money**, **Bank Transfer (CRDB/NMB)**, or **On Credit (Debtor)**.
- Cash change calculator.
- Instant **Thermal Receipt (80mm / 58mm)** and **A4 Receipt** generation with company logo, phone numbers, P.O. Box Arusha, email, cashier name, and barcode.

### 2. Proforma Invoices (Quotations)
- Generate official price quotes for prospective clients with 14-day validity terms.
- Includes company letterhead, client details, item specifications, and bank payment instructions.
- **One-Click Conversion:** Turn any accepted Proforma Invoice into a live Sales Invoice or POS order, instantly updating warehouse inventory.

### 3. Commercial Sales Invoices
- Issue official tax/commercial sales invoices.
- Track invoice payment statuses: `PAID`, `PARTIAL`, or `UNPAID`.
- Record progressive payments against invoices.
- Print standard A4 invoices with authorized signature blocks.

### 4. Delivery Notes
- Generate delivery documentation linked to sales invoices or independent dispatches.
- Fields for client destination address, transporter / driver name, and vehicle registration number (`T xxx XXX`).
- Client acknowledgement and receiver signature section.

### 5. Customers & Debtors (Credit Management)
- Customer directory with contact details, delivery site addresses, and credit limits.
- **Debtors Ledger:** Dedicated view highlighting all customers owing money.
- **Debt Repayment Collection:** Record cash, M-Pesa, or bank debt repayments.
- Generates official **Payment Receipts** with remaining balance indicators.

### 6. Inventory & Stock Management
- Real-time stock on hand, product category filtering, and SKU/barcode identification.
- Low stock threshold alerts (`Low Stock Alert` badge when quantity reaches minimum levels).
- Comprehensive **Stock Valuation:**
  - Total Stock Asset Value at Cost (Buying Price)
  - Estimated Retail Valuation (Selling Price)
- Restock & adjustment tools (Restock new deliveries, record damaged goods, customer returns).
- **Stock Movement Audit Log:** Permanent record of every item added, sold, or adjusted.

### 7. Suppliers & Purchase Orders (POs)
- Maintain vendor and supplier directories with contacts and locations.
- Create, track, and print Purchase Orders (`PENDING`, `APPROVED`, `RECEIVED`).
- **Receive Goods Workflow:** Clicking "Receive Stock" automatically increments warehouse stock and updates product buying costs.

### 8. Daily Business Expenses
- Record operational costs (Rent, Casual Wages, Fuel, Transport, Utilities, Store Supplies).
- Categorize by expense account (Cash in Hand, Bank, Mobile Money).
- Deducts automatically from active cash drawers and capital.

### 9. Available Capital & Financial Overview
- Real-time overview of business liquidity:
  - Physical Cash in Drawer
  - Bank Balance (CRDB / NMB)
  - Mobile Money Float (M-Pesa / Tigo Pesa)
- **Net Business Capital Valuation:**
  $$\text{Net Capital} = \text{Liquid Cash} + \text{Stock Asset Value (Cost)} + \text{Uncollected Debtors} - \text{Payables}$$
- Record owner capital injections or drawings with full ledger history.

### 10. Admin Profile: Workers & Daily Shift Tracking
- Admin can add workers with designated roles:
  - `Admin`
  - `Manager`
  - `Cashier`
  - `Storekeeper`
  - `Accountant`
- **"Know who was working on that specific day":**
  - Interactive calendar date picker to view attendance for **any past or present day**.
  - Shows exact clock-in and clock-out times, opening and closing cash drawer amounts.
  - Automatically aggregates how many sales transactions and total money each specific worker handled on that selected day.

### 11. Reports & Analytics
- Daily Profit & Loss report: Total Sales − Total Expenses = Daily Net Profit.
- Filter transactions by date and worker.
- Print-ready summaries for management review.

---

## 🗄️ Project Architecture

```
jengakwanzalimited/
├── server.rb             # Ruby WEBrick + SQLite REST API backend
├── start.sh              # One-click startup script for macOS / Linux
├── README.md             # Complete system documentation
├── db/
│   ├── schema.sql        # Full database schema definition
│   └── jengakwanza.db    # SQLite database (Clean initial state)
├── test/
│   └── test_direct.rb    # Automated test suite (13/13 passing tests)
└── public/
    ├── index.html        # Main application UI shell
    ├── assets/
    │   └── logo.svg      # Vector company logo for JENGAKWANZA
    ├── css/
    │   └── style.css     # Clean modern UI + @media print thermal styles
    └── js/
        ├── api.js        # API connector with offline fallback
        ├── state.js      # Application state & reactive store
        ├── print.js      # Thermal receipt & A4 document renderer
        └── app.js        # Core user workflows & business logic
```

---

---

## 🔥 Firebase Cloud Backend Integration

The system natively connects to **Google Cloud Firestore** for real-time cloud data synchronization across multiple devices, phones, and cash counters!

### Setting Up Firebase in 3 Steps:
1. **Create a Firebase Project:**
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g., `jengakwanza-pos`).
   - Enable **Firestore Database** in production mode.
2. **Deploy Security Rules:**
   - Production-grade security rules have already been generated for you in [`firestore.rules`](file:///Users/totysaito/Desktop/jengakwanzalimited/firestore.rules).
   - In your Firebase Console, click **Firestore Database** -> **Rules**, and copy-paste the contents of [`firestore.rules`](file:///Users/totysaito/Desktop/jengakwanzalimited/firestore.rules), then click **Publish**.
3. **Connect to JENGAKWANZA:**
   - In Firebase Console, go to **Project Settings** -> **Your apps** -> Click the Web icon (`</>`).
   - Copy the `firebaseConfig` keys.
   - Inside JENGAKWANZA, go to **Company Profile & Settings** -> **Firebase Cloud Backend & Vercel Sync**.
   - Paste your `apiKey`, `projectId`, `authDomain`, etc., and click **Save Firebase Configuration**!
   - The app will instantly connect to Cloud Firestore and sync your clean setup.

---

## ⚡ Publishing to Vercel & Pushing to GitHub

The application includes full native Vercel configuration (`vercel.json`) and is ready for 1-click global deployment.

### Step 1: Push Changes to GitHub
Run the provided helper script:
```bash
./push_to_github.sh https://github.com/<your-username>/jengakwanza.git
```
*(Or perform manual git commands:)*
```bash
git init
git add .
git commit -m "JENGAKWANZA Business Management System with Firebase & Vercel"
git branch -M main
git remote add origin https://github.com/<your-username>/jengakwanza.git
git push -u origin main
```
> ℹ️ *Note: If macOS prompts you with an Xcode Command Line Tools dialog when running git for the first time, click "Install" to complete Apple's tool setup.*

### Step 2: Deploy to Vercel
1. Log in to [vercel.com](https://vercel.com) and click **"Add New..." -> "Project"**.
2. Select and import your `jengakwanza` repository from GitHub.
3. Vercel automatically detects the [`vercel.json`](file:///Users/totysaito/Desktop/jengakwanzalimited/vercel.json) configuration.
4. Click **Deploy**.
5. Your JENGAKWANZA system is now live on your custom `.vercel.app` domain!

---

## 🖨️ Printing Receipts & Documents

When you click **Print** on any document:
1. An on-screen high-fidelity preview appears showing the exact output.
2. Clicking **Print Now** opens the native macOS/browser print dialog.
3. The layout automatically adapts:
   - **80mm Thermal Printer:** Select 80mm roll paper in printer settings.
   - **A4 Invoices / Delivery Notes:** Formatted with letterhead, grid lines, and signature spaces.
   - **Save as PDF:** Standard support via the browser's "Save as PDF" destination.

---

© 2026 **JENGAKWANZA LIMITED** — P.O.BOX 14991 ARUSHA, TANZANIA.
