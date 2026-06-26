-- Create role and databases for Galactic Empire Reborn
-- This runs only on first postgres container initialization (docker-entrypoint-initdb.d)

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ge') THEN
    CREATE ROLE ge WITH LOGIN PASSWORD 'ge' CREATEDB;
  END IF;
END
$$;

CREATE DATABASE ge OWNER ge;
CREATE DATABASE ge_test OWNER ge;
