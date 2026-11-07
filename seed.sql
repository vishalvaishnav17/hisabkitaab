INSERT INTO expenses (id, amount_paise, description, category, payment_method, date, notes, created_at, updated_at) VALUES
('seed-1', 45000, 'Zomato Biryani Lunch', 'Food & Dining', 'UPI', date('now'), 'Lunch with team', datetime('now'), datetime('now')),
('seed-2', 285000, 'Nature Basket Groceries', 'Groceries', 'Credit Card', date('now', '-1 days'), 'Weekly provisions', datetime('now'), datetime('now')),
('seed-3', 120000, 'Petrol HP Pump', 'Transport & Fuel', 'UPI', date('now', '-2 days'), 'Full tank bike', datetime('now'), datetime('now')),
('seed-4', 159900, 'Amazon Electronics Cable & Hub', 'Shopping', 'Credit Card', date('now', '-3 days'), 'USB C hub', datetime('now'), datetime('now')),
('seed-5', 89900, 'Electricity BESCOM Bill', 'Bills & Utilities', 'Net Banking', date('now', '-5 days'), 'Monthly bill', datetime('now'), datetime('now')),
('seed-6', 500000, 'Mutual Fund SIP', 'Investments & Savings', 'Net Banking', date('now', '-7 days'), 'Index fund investment', datetime('now'), datetime('now')),
('seed-7', 35000, 'Starbucks Cold Brew', 'Food & Dining', 'UPI', date('now', '-8 days'), 'Catchup with friend', datetime('now'), datetime('now')),
('seed-8', 65000, 'PVR Cinema Movie Tickets', 'Entertainment', 'Debit Card', date('now', '-10 days'), 'Weekend show', datetime('now'), datetime('now'));
