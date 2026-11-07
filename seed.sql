INSERT INTO expenses (id, amount, description, category, payment_method, date, notes, created_at, updated_at) VALUES
('seed-1', 450.00, 'Zomato Biryani Lunch', 'Food & Dining', 'UPI', date('now'), 'Lunch with team', datetime('now'), datetime('now')),
('seed-2', 2850.00, 'Nature Basket Groceries', 'Groceries', 'Credit Card', date('now', '-1 days'), 'Weekly provisions', datetime('now'), datetime('now')),
('seed-3', 1200.00, 'Petrol HP Pump', 'Transport & Fuel', 'UPI', date('now', '-2 days'), 'Full tank bike', datetime('now'), datetime('now')),
('seed-4', 1599.00, 'Amazon Electronics Cable & Hub', 'Shopping', 'Credit Card', date('now', '-3 days'), 'USB C hub', datetime('now'), datetime('now')),
('seed-5', 899.00, 'Electricity BESCOM Bill', 'Bills & Utilities', 'Net Banking', date('now', '-5 days'), 'Monthly bill', datetime('now'), datetime('now')),
('seed-6', 5000.00, 'Mutual Fund SIP', 'Investments & Savings', 'Net Banking', date('now', '-7 days'), 'Index fund investment', datetime('now'), datetime('now')),
('seed-7', 350.00, 'Starbucks Cold Brew', 'Food & Dining', 'UPI', date('now', '-8 days'), 'Catchup with friend', datetime('now'), datetime('now')),
('seed-8', 650.00, 'PVR Cinema Movie Tickets', 'Entertainment', 'Debit Card', date('now', '-10 days'), 'Weekend show', datetime('now'), datetime('now'));
