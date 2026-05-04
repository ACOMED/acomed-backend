BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    schema_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_tenant_name_version
    ON templates (tenant_id, name, version);

CREATE INDEX IF NOT EXISTS idx_templates_tenant_id
    ON templates (tenant_id);

CREATE TABLE IF NOT EXISTS facility_inspectors (
    facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    inspector_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (facility_id, inspector_id)
);

CREATE INDEX IF NOT EXISTS idx_facility_inspectors_facility_id
    ON facility_inspectors (facility_id);

CREATE INDEX IF NOT EXISTS idx_facility_inspectors_inspector_id
    ON facility_inspectors (inspector_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_templates_updated_at'
    ) THEN
        CREATE TRIGGER trg_templates_updated_at
        BEFORE UPDATE ON templates
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
    END IF;
END;
$$;

COMMIT;
