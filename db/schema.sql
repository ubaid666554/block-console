-- Block inventory schema (PostgreSQL)
--
-- Free capacity is never stored. It is derived by counting slots whose status
-- is 'empty'. A stored counter goes wrong the first time an operation fails
-- partway through; a derived count cannot.

CREATE TABLE IF NOT EXISTS blocks (
    id         SERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    capacity   INTEGER     NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slots (
    id          SERIAL PRIMARY KEY,
    block_id    INTEGER     NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    slot_number INTEGER     NOT NULL,
    status      TEXT        NOT NULL CHECK (status IN ('empty','occupied','reserved','maintenance')),
    item_ref    TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (block_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_slots_block_status ON slots (block_id, status);

CREATE TABLE IF NOT EXISTS positions (
    id        SERIAL PRIMARY KEY,
    name      TEXT    NOT NULL UNIQUE,
    latitude  NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    active    BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS target_points (
    id          SERIAL PRIMARY KEY,
    block_id    INTEGER NOT NULL UNIQUE REFERENCES blocks(id) ON DELETE CASCADE,
    latitude    NUMERIC(9,6) NOT NULL,
    longitude   NUMERIC(9,6) NOT NULL,
    label       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispatch_events (
    id          SERIAL PRIMARY KEY,
    block_id    INTEGER     NOT NULL REFERENCES blocks(id),
    position_id INTEGER     NOT NULL REFERENCES positions(id),
    launch_latitude NUMERIC(9,6),
    launch_longitude NUMERIC(9,6),
    target_latitude NUMERIC(9,6),
    target_longitude NUMERIC(9,6),
    operator    TEXT        NOT NULL,
    quantity    INTEGER     NOT NULL CHECK (quantity > 0),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_events ADD COLUMN IF NOT EXISTS launch_latitude NUMERIC(9,6);
ALTER TABLE dispatch_events ADD COLUMN IF NOT EXISTS launch_longitude NUMERIC(9,6);
ALTER TABLE dispatch_events ADD COLUMN IF NOT EXISTS target_latitude NUMERIC(9,6);
ALTER TABLE dispatch_events ADD COLUMN IF NOT EXISTS target_longitude NUMERIC(9,6);

CREATE TABLE IF NOT EXISTS dispatch_event_slots (
    id          SERIAL PRIMARY KEY,
    event_id    INTEGER NOT NULL REFERENCES dispatch_events(id) ON DELETE CASCADE,
    slot_id     INTEGER NOT NULL REFERENCES slots(id),
    slot_number INTEGER NOT NULL,
    item_ref    TEXT
);

CREATE TABLE IF NOT EXISTS slot_history (
    id          SERIAL PRIMARY KEY,
    slot_id     INTEGER     NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
    from_status TEXT        NOT NULL,
    to_status   TEXT        NOT NULL,
    reason      TEXT        NOT NULL,
    operator    TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
