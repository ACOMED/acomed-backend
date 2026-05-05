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

const extractAnswerValue = (responseValue) => {
  if (responseValue === null || responseValue === undefined) {
    return null;
  }

  if (typeof responseValue === 'object') {
    if (Object.prototype.hasOwnProperty.call(responseValue, 'answer_value')) {
      return responseValue.answer_value;
    }
  }

  return responseValue;
};

const normalizeAnswerText = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.trim().toLowerCase();
};

const normalizeSeverity = (value) => {
  const normalized = normalizeAnswerText(value);
  if (!normalized) {
    return 'major';
  }

  if (normalized === 'critical') {
    return 'critical';
  }

  if (normalized === 'medium' || normalized === 'major') {
    return 'major';
  }

  if (normalized === 'low' || normalized === 'minor') {
    return 'minor';
  }

  return 'major';
};

const isAnswerYes = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeAnswerText(value);
  return normalized === 'yes' || normalized === 'true';
};

const isAnswerNo = (value) => {
  if (typeof value === 'boolean') {
    return value === false;
  }

  const normalized = normalizeAnswerText(value);
  return normalized === 'no' || normalized === 'false';
};

const shouldTriggerCapa = (question, responseValue) => {
  if (!question?.trigger_capa) {
    return false;
  }

  const normalizedAnswer = extractAnswerValue(responseValue);
  return isAnswerNo(normalizedAnswer);
};

const computeScores = (questions, answersByQuestionId) => {
  let totalReg = 0;
  let earnedReg = 0;
  let totalMat = 0;
  let earnedMat = 0;

  for (const question of questions) {
    const regPoints = Number(question?.reg_points || 0);
    const matPoints = Number(question?.mat_points || 0);

    if (regPoints > 0) {
      totalReg += regPoints;
    }
    if (matPoints > 0) {
      totalMat += matPoints;
    }

    const answer = answersByQuestionId.get(question.question_id || question.id);
    if (!answer) {
      continue;
    }

    const normalizedAnswer = extractAnswerValue(answer);
    if (isAnswerYes(normalizedAnswer)) {
      if (regPoints > 0) {
        earnedReg += regPoints;
      }
      if (matPoints > 0) {
        earnedMat += matPoints;
      }
    }
  }

  const complianceScore = totalReg > 0 ? Math.round((earnedReg / totalReg) * 100) : 0;
  const maturityScore = totalMat > 0 ? Math.round((earnedMat / totalMat) * 100) : 0;

  return { complianceScore, maturityScore };
};

const collectQuestions = (schemaJson) => {
  if (!schemaJson || typeof schemaJson !== 'object') {
    return [];
  }

  if (Array.isArray(schemaJson.questions)) {
    return schemaJson.questions;
  }

  return [];
};

const resolveCapaPayload = (question, responseValue) => {
  const title =
    question?.capa_title ||
    question?.label ||
    question?.question_text ||
    'Non-conformity detected';

  const severity = normalizeSeverity(question?.capa_severity || 'Major');

  const dueDate = null;

  const description = question?.label || question?.question_text || null;

  return { title, severity, dueDate, description, responseValue };
};

const applyScoringAndCapas = async (client, tenantId, auditIds) => {
  for (const auditId of auditIds) {
    const auditResult = await client.query(
      `SELECT a.id, a.template_id, a.tenant_id, t.schema_json
       FROM audits a
       LEFT JOIN templates t ON t.id = a.template_id
       WHERE a.id = $1 AND a.tenant_id = $2
       LIMIT 1`,
      [auditId, tenantId]
    );

    if (auditResult.rows.length === 0) {
      continue;
    }

    const auditRow = auditResult.rows[0];
    if (!auditRow.template_id || !auditRow.schema_json) {
      continue;
    }

    const answersResult = await client.query(
      `SELECT question_id, response_value
       FROM answers
       WHERE audit_id = $1`,
      [auditId]
    );

    const answersByQuestionId = new Map();
    for (const row of answersResult.rows) {
      answersByQuestionId.set(row.question_id, row.response_value);
    }

    const questions = collectQuestions(auditRow.schema_json);
    const { complianceScore, maturityScore } = computeScores(questions, answersByQuestionId);

    await client.query(
      `UPDATE audits
       SET compliance_score = $2,
           maturity_level = $3
       WHERE id = $1`,
      [auditId, complianceScore, maturityScore]
    );

    for (const question of questions) {
      const responseValue = answersByQuestionId.get(question.question_id || question.id);
      if (!responseValue) {
        continue;
      }

      if (!shouldTriggerCapa(question, responseValue)) {
        continue;
      }

      const { title, severity, dueDate, description } = resolveCapaPayload(question, responseValue);
      const existingCapa = await client.query(
        `SELECT id FROM capa
         WHERE audit_id = $1 AND tenant_id = $2 AND title = $3
         LIMIT 1`,
        [auditId, tenantId, title]
      );

      if (existingCapa.rows.length > 0) {
        continue;
      }

      await client.query(
        `INSERT INTO capa (audit_id, title, severity, status, due_date, tenant_id, non_conformity_desc)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditId, title, severity, 'todo', dueDate, tenantId, description]
      );
    }
  }
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
  const auditsToScore = new Set();

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
               template_id,
             status,
             scheduled_date,
             created_at,
             updated_at
           )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            audit.id,
            tenantId,
            audit.inspector_id,
            audit.facility_id,
              audit.template_id || null,
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
             template_id = COALESCE($5, template_id),
             status = $6,
             scheduled_date = $7,
             updated_at = $8
         WHERE id = $1 AND tenant_id = $2`,
        [
          audit.id,
          tenantId,
          audit.inspector_id,
          audit.facility_id,
          audit.template_id || null,
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
        auditsToScore.add(answer.audit_id);
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
      auditsToScore.add(answer.audit_id);
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

    if (auditsToScore.size > 0) {
      await applyScoringAndCapas(client, tenantId, auditsToScore);
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
