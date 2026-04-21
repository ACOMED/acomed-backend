BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1) Multi-tenant support
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE facilities
    ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_tenant_id_fkey'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_tenant_id_fkey
            FOREIGN KEY (tenant_id)
            REFERENCES tenants(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'facilities_tenant_id_fkey'
          AND conrelid = 'facilities'::regclass
    ) THEN
        ALTER TABLE facilities
            ADD CONSTRAINT facilities_tenant_id_fkey
            FOREIGN KEY (tenant_id)
            REFERENCES tenants(id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_facilities_tenant_id ON facilities (tenant_id);

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2) CAPA system
CREATE TABLE IF NOT EXISTS capa (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    non_conformity_desc TEXT NOT NULL,
    assigned_to UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(50) NOT NULL CHECK (
        status IN (
            'A_FAIRE',
            'EN_COURS',
            'EN_ATTENTE_VALIDATION',
            'CLOTUREE',
            'REJETEE'
        )
    ),
    due_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capa_audit_id ON capa (audit_id);
CREATE INDEX IF NOT EXISTS idx_capa_assigned_to ON capa (assigned_to);
CREATE INDEX IF NOT EXISTS idx_capa_status ON capa (status);

DROP TRIGGER IF EXISTS trg_capa_updated_at ON capa;
CREATE TRIGGER trg_capa_updated_at
BEFORE UPDATE ON capa
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 3) Conditional logic for questions
ALTER TABLE IF EXISTS questions
    ADD COLUMN IF NOT EXISTS parent_question_id UUID;

ALTER TABLE IF EXISTS questions
    ADD COLUMN IF NOT EXISTS prerequisite_condition VARCHAR(100);

DO $$
DECLARE
    questions_table regclass;
BEGIN
    questions_table := to_regclass('public.questions');

    IF questions_table IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'questions_parent_question_id_fkey'
              AND conrelid = questions_table
        ) THEN
            ALTER TABLE questions
                ADD CONSTRAINT questions_parent_question_id_fkey
                FOREIGN KEY (parent_question_id)
                REFERENCES questions(id)
                ON DELETE SET NULL;
        END IF;

        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_questions_parent_question_id ON questions (parent_question_id)';
    END IF;
END;
$$;

-- 4) Audit lifecycle status upgrade
UPDATE audits
SET status = CASE
    WHEN status IN ('scheduled', 'SCHEDULED') THEN 'PLANIFIE'
    WHEN status IN ('in_progress', 'IN_PROGRESS') THEN 'EN_COURS'
    WHEN status IN ('completed', 'COMPLETED') THEN 'CLOTURE'
    WHEN status IN (
        'BROUILLON',
        'PLANIFIE',
        'EN_COURS',
        'SOUMIS',
        'REVU',
        'CLOTURE',
        'ARCHIVE'
    ) THEN status
    ELSE 'BROUILLON'
END;

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
    ALTER COLUMN status TYPE VARCHAR(50),
    ALTER COLUMN status SET DEFAULT 'PLANIFIE';

ALTER TABLE audits
    ADD CONSTRAINT audits_status_check CHECK (
        status IN (
            'BROUILLON',
            'PLANIFIE',
            'EN_COURS',
            'SOUMIS',
            'REVU',
            'CLOTURE',
            'ARCHIVE'
        )
    );

COMMIT;
