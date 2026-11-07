-- D1 Database Schema for HisabKitaab
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
