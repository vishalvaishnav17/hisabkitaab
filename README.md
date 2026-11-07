# HisabKitaab (₹) - Personal Expense Tracker

A modern, fast, pitch-black expense tracker tailored for INR (₹) currency, powered by Cloudflare Workers and Cloudflare D1 Database.

Designed to be hosted on `expenses.vishalvaishnav.cc`.

---

## ⚡ Features

- **Pure Pitch Black UI (`#000000`)**: Deep black design with subtle zinc borders and emerald/amber/rose glowing accents.
- **INR (`₹`) Native**: Native Indian Rupee currency formatting (`en-IN`), Indian payment methods (UPI, Cards, Cash, Net Banking).
- **Interactive Analytics**:
  - Donut chart category breakdown (Chart.js)
  - Daily spending trend bar chart
  - Key statistics: Total spent, Monthly spending, Average daily spend, Top expense category
- **Transaction Management**:
  - Add / Edit / Delete expenses with modal and quick amount buttons (+₹100, +₹500, +₹1,000, +₹2,000)
  - Real-time search across description, category, and notes
  - Multi-criteria filtering: Category, Payment Mode, Date range (This Month, Last Month, Last 30 Days, All)
  - Instant CSV Export
- **Edge Architecture**:
  - Backend: Hono TypeScript API running on Cloudflare Workers
  - Database: Cloudflare D1 SQL database with indexed date and category queries
  - Zero-asset bundle friction: single worker deployment

---

## 🚀 Local Development

1. **Install Dependencies**:
   ```bash
   bun install
   ```

2. **Apply Local Database Schema & Seed**:
   ```bash
   bun x wrangler d1 execute hisabkitaab-db --local --file=schema.sql
   bun x wrangler d1 execute hisabkitaab-db --local --file=seed.sql
   ```

3. **Start Local Worker**:
   ```bash
   bun run dev
   # or: bun x wrangler dev
   ```
   Open `http://localhost:8787` in your browser.

---

## ☁️ Cloudflare Deployment

1. **Create Cloudflare D1 Database (Remote)**:
   ```bash
   bun x wrangler d1 create hisabkitaab-db
   ```
   Copy the generated `database_id` into `wrangler.jsonc`.

2. **Apply Schema to Remote Database**:
   ```bash
   bun x wrangler d1 execute hisabkitaab-db --remote --file=schema.sql
   ```

3. **Deploy Worker & Custom Subdomain**:
   ```bash
   bun x wrangler deploy
   ```
   `wrangler.jsonc` is configured with `custom_domain: true` for `expenses.vishalvaishnav.cc`. Cloudflare automatically provisions the DNS record and SSL certificate for the subdomain.
