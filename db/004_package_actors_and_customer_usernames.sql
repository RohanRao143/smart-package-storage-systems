-- Delivery and collection actors are independent; package ownership remains customer_id.
ALTER TABLE customers ADD COLUMN username varchar(80);
UPDATE customers
SET username = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_]', '', 'g')) || '_' || left(id::text, 8)
WHERE username IS NULL;
ALTER TABLE customers ALTER COLUMN username SET NOT NULL;
ALTER TABLE customers ADD CONSTRAINT customers_username_key UNIQUE (username);

ALTER TABLE packages ADD COLUMN stored_by uuid;
ALTER TABLE packages ADD COLUMN received_by uuid REFERENCES customers(id);
UPDATE packages SET stored_by = customer_id WHERE stored_by IS NULL;
ALTER TABLE packages ALTER COLUMN stored_by SET NOT NULL;
ALTER TABLE packages ADD CONSTRAINT packages_stored_by_fkey FOREIGN KEY (stored_by) REFERENCES customers(id);
