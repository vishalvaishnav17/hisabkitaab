-- Migration: 0001_foundation.sql
-- 1. Rebuild expenses with amount_paise (INTEGER), amount_expr, and deleted_at
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

CREATE TABLE expenses_new (
    id TEXT PRIMARY KEY,
    amount_paise INTEGER NOT NULL,
    amount_expr TEXT,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'UPI',
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

INSERT INTO expenses_new (
    id,
    amount_paise,
    amount_expr,
    description,
    category,
    payment_method,
    date,
    notes,
    created_at,
    updated_at,
    deleted_at
)
SELECT
    id,
    CAST(ROUND(amount * 100) AS INTEGER),
    NULL,
    description,
    category,
    payment_method,
    date,
    notes,
    created_at,
    updated_at,
    NULL
FROM expenses;

DROP TABLE expenses;

ALTER TABLE expenses_new RENAME TO expenses;

CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_deleted_at_date ON expenses(deleted_at, date);

-- 2. People table with is_me partial unique index and 'me' seed row
CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    upi_vpa TEXT,
    phone TEXT,
    is_me INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE UNIQUE INDEX idx_people_is_me ON people(is_me) WHERE is_me = 1;

INSERT INTO people (id, name, is_me, created_at) VALUES ('me', 'Me', 1, datetime('now'));

-- 3. Activity table with indices
CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    group_id TEXT,
    action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete', 'restore')),
    summary TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT
);

CREATE INDEX idx_activity_at ON activity(at);
CREATE INDEX idx_activity_entity ON activity(entity_type, entity_id, at);
CREATE INDEX idx_activity_group ON activity(group_id, at);
