BEGIN;

ALTER TABLE answers
    ALTER COLUMN question_id TYPE TEXT
    USING question_id::text;

COMMIT;
