const db = require('../config/db');
const { sendResponse } = require('../utils/response');

const toEpoch = (value) => {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const ensureTenantId = (req) => {
  const tenantId = req.user && req.user.tenant_id;

  if (!tenantId) {
    throw createHttpError(401, 'Unauthorized: tenant_id is required in token payload.');
  }

  return tenantId;
};

const ensureAuditBelongsToTenant = async (client, auditId, tenantId) => {
  const auditResult = await client.query(
    'SELECT id FROM audits WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [auditId, tenantId]
  );

  if (auditResult.rows.length === 0) {
    throw createHttpError(403, 'Forbidden: audit does not belong to your tenant.');
  }
};

const shouldUpsert = (mobileUpdatedAt, serverUpdatedAt) => {
  if (mobileUpdatedAt === null) {
    return false;
  }

  if (serverUpdatedAt === null) {
    return true;
  }

  return mobileUpdatedAt > serverUpdatedAt;
};

const syncData = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const { audits = [], answers = [], capas = [] } = req.body || {};

  if (!Array.isArray(audits) || !Array.isArray(answers) || !Array.isArray(capas)) {
    return sendResponse(
      res,
      400,
      false,
      null,
      'Payload must include audits, answers, and capas arrays.'
    );
  }

  const client = await db.pool.connect();
  const syncedAudits = new Set();
  const syncedAnswers = new Set();
  const syncedCapas = new Set();

  try {
    await client.query('BEGIN');

    for (const audit of audits) {
      if (!audit || !audit.id) {
        continue;
      }

      const mobileUpdatedAt = toEpoch(audit.updated_at);
      if (mobileUpdatedAt === null) {
        continue;
      }

      const existingAuditResult = await client.query(
        'SELECT tenant_id, updated_at FROM audits WHERE id = $1 LIMIT 1',
        [audit.id]
      );

      if (existingAuditResult.rows.length === 0) {
        await client.query(
          `INSERT INTO audits (
             id,
             tenant_id,
             inspector_id,
             facility_id,
             status,
             scheduled_date,
             created_at,
             updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            audit.id,
            tenantId,
            audit.inspector_id,
            audit.facility_id,
            audit.status || 'PLANIFIE',
            audit.scheduled_date || null,
            audit.created_at || audit.updated_at,
            audit.updated_at
          ]
        );

        syncedAudits.add(audit.id);
        continue;
      }

      const existingAudit = existingAuditResult.rows[0];
      if (existingAudit.tenant_id !== tenantId) {
        throw createHttpError(403, 'Forbidden: audit tenant mismatch.');
      }

      const serverUpdatedAt = toEpoch(existingAudit.updated_at);
      if (!shouldUpsert(mobileUpdatedAt, serverUpdatedAt)) {
        continue;
      }

      await client.query(
        `UPDATE audits
         SET tenant_id = $2,
             inspector_id = $3,
             facility_id = $4,
             status = $5,
             scheduled_date = $6,
             updated_at = $7
         WHERE id = $1 AND tenant_id = $2`,
        [
          audit.id,
          tenantId,
          audit.inspector_id,
          audit.facility_id,
          audit.status || 'PLANIFIE',
          audit.scheduled_date || null,
          audit.updated_at
        ]
      );

      syncedAudits.add(audit.id);
    }

    for (const answer of answers) {
      if (!answer || !answer.id || !answer.audit_id) {
        continue;
      }

      const mobileUpdatedAt = toEpoch(answer.updated_at);
      if (mobileUpdatedAt === null) {
        continue;
      }

      const existingAnswerResult = await client.query(
        `SELECT ans.updated_at
         FROM answers ans
         INNER JOIN audits aud ON aud.id = ans.audit_id
         WHERE ans.id = $1 AND aud.tenant_id = $2
         LIMIT 1`,
        [answer.id, tenantId]
      );

      if (existingAnswerResult.rows.length === 0) {
        await ensureAuditBelongsToTenant(client, answer.audit_id, tenantId);

        await client.query(
          `INSERT INTO answers (
             id,
             audit_id,
             question_id,
             response_value,
             created_at,
             updated_at
           )
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

        syncedAnswers.add(answer.id);
        continue;
      }

      const serverUpdatedAt = toEpoch(existingAnswerResult.rows[0].updated_at);
      if (!shouldUpsert(mobileUpdatedAt, serverUpdatedAt)) {
        continue;
      }

      await ensureAuditBelongsToTenant(client, answer.audit_id, tenantId);

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

      syncedAnswers.add(answer.id);
    }

    for (const capa of capas) {
      if (!capa || !capa.id || !capa.audit_id) {
        continue;
      }

      const mobileUpdatedAt = toEpoch(capa.updated_at);
      if (mobileUpdatedAt === null) {
        continue;
      }

      const existingCapaResult = await client.query(
        `SELECT c.updated_at
         FROM capa c
         INNER JOIN audits aud ON aud.id = c.audit_id
         WHERE c.id = $1 AND aud.tenant_id = $2
         LIMIT 1`,
        [capa.id, tenantId]
      );

      if (existingCapaResult.rows.length === 0) {
        await ensureAuditBelongsToTenant(client, capa.audit_id, tenantId);

        await client.query(
          `INSERT INTO capa (
             id,
             audit_id,
             non_conformity_desc,
             assigned_to,
             status,
             due_date,
             created_at,
             updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            capa.id,
            capa.audit_id,
            capa.non_conformity_desc,
            capa.assigned_to,
            capa.status,
            capa.due_date || null,
            capa.created_at || capa.updated_at,
            capa.updated_at
          ]
        );

        syncedCapas.add(capa.id);
        continue;
      }

      const serverUpdatedAt = toEpoch(existingCapaResult.rows[0].updated_at);
      if (!shouldUpsert(mobileUpdatedAt, serverUpdatedAt)) {
        continue;
      }

      await ensureAuditBelongsToTenant(client, capa.audit_id, tenantId);

      await client.query(
        `UPDATE capa
         SET audit_id = $2,
             non_conformity_desc = $3,
             assigned_to = $4,
             status = $5,
             due_date = $6,
             updated_at = $7
         WHERE id = $1`,
        [
          capa.id,
          capa.audit_id,
          capa.non_conformity_desc,
          capa.assigned_to,
          capa.status,
          capa.due_date || null,
          capa.updated_at
        ]
      );

      syncedCapas.add(capa.id);
    }

    await client.query('COMMIT');

    return sendResponse(
      res,
      200,
      true,
      {
        syncedAudits: Array.from(syncedAudits),
        syncedAnswers: Array.from(syncedAnswers),
        syncedCapas: Array.from(syncedCapas)
      },
      'Sync successful'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  syncData
};
