-- Migration: 0003_bills.sql
-- Recurring bills and bill participants

CREATE TABLE recurring_bills (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    amount_paise INTEGER NULL,
    amount_expr TEXT,
    category TEXT NOT NULL DEFAULT 'Bills & Utilities',
    payment_method TEXT,
    cadence TEXT NOT NULL CHECK(cadence IN ('weekly', 'monthly', 'yearly')),
    anchor_day INTEGER NOT NULL,
    next_due TEXT NOT NULL,
    group_id TEXT NULL,
    paid_by TEXT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE recurring_bill_participants (
    bill_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    PRIMARY KEY(bill_id, person_id)
);

CREATE INDEX idx_recurring_bills_deleted_active_due ON recurring_bills(deleted_at, active, next_due);
CREATE INDEX idx_recurring_bills_group_id ON recurring_bills(group_id);
