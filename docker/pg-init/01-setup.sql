-- Create the tenant database (management_db is created by POSTGRES_DB env var)
SELECT 'CREATE DATABASE default_tenant_db OWNER "user"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'default_tenant_db')\gexec

-- Enable pg_cron on the management database
CREATE EXTENSION IF NOT EXISTS pg_cron;
