-- Migration: 0002_groups.sql
-- Groups, group members, group expenses, expense shares, and transfers

CREATE TABLE groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT,
    kind TEXT CHECK(kind IN ('trip', 'home', 'couple', 'other')) DEFAULT 'other',
    simplify_debts INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE group_members (
    group_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    left_at TEXT,
    PRIMARY KEY(group_id, person_id)
);

CREATE TABLE group_expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Others',
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    amount_expr TEXT,
    paid_by TEXT NOT NULL,
    split_type TEXT NOT NULL CHECK(split_type IN ('equal', 'exact')),
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE TABLE expense_shares (
    expense_id TEXT NOT NULL,
    person_id TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    PRIMARY KEY(expense_id, person_id)
);

CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    from_person TEXT NOT NULL,
    to_person TEXT NOT NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    amount_expr TEXT,
    date TEXT NOT NULL,
    method TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    CHECK(from_person <> to_person)
);

CREATE INDEX idx_groups_deleted_at ON groups(deleted_at);
CREATE INDEX idx_group_expenses_group_deleted_date ON group_expenses(group_id, deleted_at, date);
CREATE INDEX idx_group_expenses_paid_by ON group_expenses(paid_by);
CREATE INDEX idx_expense_shares_person_id ON expense_shares(person_id);
CREATE INDEX idx_transfers_group_deleted ON transfers(group_id, deleted_at);
CREATE INDEX idx_transfers_from_person ON transfers(from_person);
CREATE INDEX idx_transfers_to_person ON transfers(to_person);
CREATE INDEX idx_group_members_person_id ON group_members(person_id);
