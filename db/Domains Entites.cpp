Domains Entites


Locker : Id (PK), size (small | medium | large), fragile_support (bool), has_occupied (bool)

Package : Id (PK), locker_id (FK), customer_id (FK), stored_at(time_stamp), collected_at(time_stamp), width: int (cm), height int (cm), breadth int (cm), weight: (grams), has_fragile_items (bool)

Customer : Id (PK), name (varchar), email (varchar), phone_number (int), wallet_balance (int), current_packages (int), total_packages (int), last_checked_in (timestamp)

PickupCode: Id (PK), package_id (FK), customer_id (FK), locker_id(FK), pickup_code (varchar)

StorageCharge: Id (PK), pickup_code (FK), charged_amount (int), package_held_time_ms (bigint), status (varchar)