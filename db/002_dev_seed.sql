-- Development-only inventory. Adjust dimensions and pricing to product decisions.
INSERT INTO lockers (size, size_rank, width_cm, height_cm, breadth_cm, max_weight_grams, fragile_support)
VALUES
  ('SMALL', 1, 30, 30, 30, 5000, true),
  ('SMALL', 1, 30, 30, 30, 5000, false),
  ('MEDIUM', 2, 50, 50, 50, 15000, true),
  ('LARGE', 3, 80, 80, 80, 30000, true);

INSERT INTO customers (name, username, email, phone_number, wallet_balance_cents)
VALUES ('Delivery Agent', 'delivery_agent', 'delivery_agent@example.test', '+15550000001', 10000),
('Car workshop', 'vehicle_workshop', 'vehicle_workshop@example.test', '+15550000002', 10000);
