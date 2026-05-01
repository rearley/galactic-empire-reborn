-- Creates the test database alongside the dev database on first container start.
-- Both use the same `ge` owner created by POSTGRES_USER.
CREATE DATABASE ge_test OWNER ge;
