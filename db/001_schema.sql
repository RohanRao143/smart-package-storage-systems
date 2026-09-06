-- Smart Package Storage System: PostgreSQL 15+ schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE locker_size AS ENUM ('SMALL', 'MEDIUM', 'LARGE');
CREATE TYPE package_status AS ENUM ('STORED', 'COLLECTED');
CREATE TYPE charge_status AS ENUM ('PAID', 'FAILED');

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  email varchar(320) NOT NULL UNIQUE,
  phone_number varchar(30) NOT NULL UNIQUE,
  wallet_balance_cents bigint NOT NULL DEFAULT 0 CHECK (wallet_balance_cents >= 0),
  current_packages integer NOT NULL DEFAULT 0 CHECK (current_packages >= 0),
  total_packages integer NOT NULL DEFAULT 0 CHECK (total_packages >= 0),
  last_checked_in_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lockers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  size locker_size NOT NULL,
  size_rank smallint NOT NULL CHECK (size_rank BETWEEN 1 AND 3),
  width_cm integer NOT NULL CHECK (width_cm > 0),
  height_cm integer NOT NULL CHECK (height_cm > 0),
  breadth_cm integer NOT NULL CHECK (breadth_cm > 0),
  max_weight_grams integer NOT NULL CHECK (max_weight_grams > 0),
  fragile_support boolean NOT NULL DEFAULT false,
  is_occupied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((size = 'SMALL' AND size_rank = 1) OR
         (size = 'MEDIUM' AND size_rank = 2) OR
         (size = 'LARGE' AND size_rank = 3))
);

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_id uuid NOT NULL REFERENCES lockers(id),
  package_name varchar(50) NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  status package_status NOT NULL DEFAULT 'STORED',
  stored_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz,
  width_cm integer NOT NULL CHECK (width_cm > 0),
  height_cm integer NOT NULL CHECK (height_cm > 0),
  breadth_cm integer NOT NULL CHECK (breadth_cm > 0),
  weight_grams integer NOT NULL CHECK (weight_grams > 0),
  has_fragile_items boolean NOT NULL DEFAULT false,
  base_daily_rate_cents integer NOT NULL CHECK (base_daily_rate_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'STORED' AND collected_at IS NULL) OR
         (status = 'COLLECTED' AND collected_at IS NOT NULL AND collected_at >= stored_at))
);

-- This is the database-level backstop for the one-package-per-locker invariant.
CREATE UNIQUE INDEX one_active_package_per_locker
  ON packages(locker_id) WHERE status = 'STORED';
CREATE INDEX active_packages_by_customer ON packages(customer_id) WHERE status = 'STORED';

CREATE TABLE pickup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL UNIQUE REFERENCES packages(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  locker_id uuid NOT NULL REFERENCES lockers(id),
  pickup_code_hash varchar(255) NOT NULL UNIQUE,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE storage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL UNIQUE REFERENCES packages(id),
  pickup_code_id uuid NOT NULL UNIQUE REFERENCES pickup_codes(id),
  charged_amount_cents bigint NOT NULL CHECK (charged_amount_cents >= 0),
  package_held_time_ms bigint NOT NULL CHECK (package_held_time_ms >= 0),
  status charge_status NOT NULL,
  charged_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation varchar(40) NOT NULL CHECK (operation IN ('STORE_PACKAGE', 'RETRIEVE_PACKAGE')),
  idempotency_key uuid NOT NULL,
  request_hash varchar(64) NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation, idempotency_key)
);

CREATE INDEX available_lockers_by_rank
  ON lockers(size_rank, id) WHERE is_occupied = false;
