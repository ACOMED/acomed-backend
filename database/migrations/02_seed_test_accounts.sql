BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO tenants (id, name)
VALUES ('9f7d55aa-cd6f-43e0-9fa8-7f6ac4e91f01', 'ACOMED Sandbox Tenant')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = NOW();

INSERT INTO users (
    id,
    tenant_id,
    full_name,
    email,
    password_hash,
    role
)
VALUES
    (
        '6d10f899-36a4-4e50-bf64-3982cde29ce9',
        '9f7d55aa-cd6f-43e0-9fa8-7f6ac4e91f01',
        'Test Admin',
        'test.admin@acomed.tech',
        '$2b$10$eZXofkQaGPoP6a4X1pIr3Oe23J17XHM8qi1vV6659bIN33n0GYSBC',
        'admin'
    ),
    (
        '7386b7de-3e03-4f51-a6ef-e26ced09664f',
        '9f7d55aa-cd6f-43e0-9fa8-7f6ac4e91f01',
        'Test Inspector',
        'test.inspector@acomed.tech',
        '$2b$10$Gm23DizX5EGaRV/xSDKQ0.rO2YlVLR9O53eKBDy1v3TI51GdG.HEi',
        'inspector'
    )
ON CONFLICT (email) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    updated_at = NOW();

COMMIT;
