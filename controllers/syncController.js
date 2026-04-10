const db = require('../config/db');

const toEpoch = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const syncAuditRecord = async (client, audit) => {
  const existing = await client.query(
    'SELECT updated_at FROM audits WHERE id = $1 LIMIT 1',
    [audit.id]
  );

  const mobileUpdatedAt = toEpoch(audit.updated_at);
  if (!mobileUpdatedAt) {
    return 'ignored';
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO audits (id, inspector_id, facility_id, status, scheduled_date, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        audit.id,
        audit.inspector_id,
        audit.facility_id,
        audit.status,
        audit.scheduled_date || null,
        audit.created_at || audit.updated_at,
        audit.updated_at
      ]
    );
    return 'inserted';
  }

  const serverUpdatedAt = toEpoch(existing.rows[0].updated_at);
  if (serverUpdatedAt !== null && mobileUpdatedAt > serverUpdatedAt) {
    await client.query(
      `UPDATE audits
       SET inspector_id = $2,
           facility_id = $3,
           status = $4,
           scheduled_date = $5,
           updated_at = $6
       WHERE id = $1`,
      [
        audit.id,
        audit.inspector_id,
        audit.facility_id,
        audit.status,
        audit.scheduled_date || null,
        audit.updated_at
      ]
    );
    return 'updated';
  }

  return 'ignored';
};

const syncAnswerRecord = async (client, answer) => {
  const existing = await client.query(
    'SELECT updated_at FROM answers WHERE id = $1 LIMIT 1',
    [answer.id]
  );

  const mobileUpdatedAt = toEpoch(answer.updated_at);
  if (!mobileUpdatedAt) {
    return 'ignored';
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO answers (id, audit_id, question_id, response_value, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        answer.id,
        answer.audit_id,
        answer.question_id,
        answer.response_value,
        answer.created_at || answer.updated_at,
        answer.updated_at
      ]
    );
    return 'inserted';
  }

  const serverUpdatedAt = toEpoch(existing.rows[0].updated_at);
  if (serverUpdatedAt !== null && mobileUpdatedAt > serverUpdatedAt) {
    await client.query(
      `UPDATE answers
       SET audit_id = $2,
           question_id = $3,
           response_value = $4,
           updated_at = $5
       WHERE id = $1`,
      [
        answer.id,
        answer.audit_id,
        answer.question_id,
        answer.response_value,
        answer.updated_at
      ]
    );
    return 'updated';
  }

  return 'ignored';
};

const syncData = async (req, res, next) => {
  const { audits = [], answers = [] } = req.body;

  if (!Array.isArray(audits) || !Array.isArray(answers)) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Payload must include audits and answers arrays.'
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const summary = {
      audits: { inserted: 0, updated: 0, ignored: 0 },
      answers: { inserted: 0, updated: 0, ignored: 0 }
    };

    for (const audit of audits) {
      const result = await syncAuditRecord(client, audit);
      summary.audits[result] += 1;
    }

    for (const answer of answers) {
      const result = await syncAnswerRecord(client, answer);
      summary.answers[result] += 1;
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      data: summary,
      message: 'Sync completed.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
};

module.exports = {
  syncData
};
