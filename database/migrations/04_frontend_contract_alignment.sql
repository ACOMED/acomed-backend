BEGIN;

-- Templates: add code and defaults for schema_json
ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS code VARCHAR(100);

ALTER TABLE templates
    ALTER COLUMN schema_json SET DEFAULT '{"nodes":[],"edges":[]}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'templates_code_key'
    ) THEN
        ALTER TABLE templates
            ADD CONSTRAINT templates_code_key UNIQUE (code);
    END IF;
END;
$$;

-- Audits: add contract fields
ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS ref VARCHAR(50);

ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id);

ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS date DATE;

ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT '[]'::jsonb;

ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS compliance_score INT;

ALTER TABLE audits
    ADD COLUMN IF NOT EXISTS maturity_level INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'audits_ref_key'
    ) THEN
        ALTER TABLE audits
            ADD CONSTRAINT audits_ref_key UNIQUE (ref);
    END IF;
END;
$$;

-- Normalize audit status values
UPDATE audits
SET status = CASE
    WHEN status IN ('PLANIFIE', 'planifie') THEN 'planifie'
    WHEN status IN ('SOUMIS', 'soumis') THEN 'soumis'
    WHEN status IN ('CLOTURE', 'cloture') THEN 'cloture'
    WHEN status IN ('BROUILLON', 'brouillon') THEN 'brouillon'
    ELSE 'brouillon'
END;

UPDATE audits
SET date = COALESCE(date, scheduled_date)
WHERE date IS NULL;

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'audits'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE audits DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;
END;
$$;

ALTER TABLE audits
    ALTER COLUMN status SET DEFAULT 'brouillon';

ALTER TABLE audits
    ADD CONSTRAINT audits_status_check CHECK (
        status IN ('brouillon', 'planifie', 'soumis', 'cloture')
    );

-- CAPA: align to contract fields
ALTER TABLE capa
    ADD COLUMN IF NOT EXISTS title VARCHAR(255);

ALTER TABLE capa
    ADD COLUMN IF NOT EXISTS severity VARCHAR(50);

ALTER TABLE capa
    ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id);

ALTER TABLE capa
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

UPDATE capa c
SET tenant_id = a.tenant_id
FROM audits a
WHERE c.audit_id = a.id
    AND c.tenant_id IS NULL;

UPDATE capa
SET title = COALESCE(title, non_conformity_desc)
WHERE title IS NULL;

UPDATE capa
SET status = CASE
    WHEN status IN ('A_FAIRE', 'todo') THEN 'todo'
    WHEN status IN ('EN_COURS', 'inProgress') THEN 'inProgress'
    WHEN status IN ('EN_ATTENTE_VALIDATION', 'review') THEN 'review'
    WHEN status IN ('CLOTUREE', 'closed') THEN 'closed'
    ELSE 'todo'
END;

DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'capa'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE capa DROP CONSTRAINT %I', constraint_record.conname);
    END LOOP;
END;
$$;

ALTER TABLE capa
    ALTER COLUMN status SET DEFAULT 'todo';

ALTER TABLE capa
    ADD CONSTRAINT capa_status_check CHECK (
        status IN ('todo', 'inProgress', 'review', 'closed')
    );

COMMIT;
