const db = require('../config/db');
const { sendResponse } = require('../utils/response');

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

const isAnswerYes = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeAnswerText(value);
  return normalized === 'yes' || normalized === 'true' || normalized === 'pass';
};

const resolveCategory = (question) => {
  return question?.category || question?.topic || question?.group || null;
};

const getAnalyticsOverview = async (req, res) => {
  const tenantId = ensureTenantId(req);

  const auditTotals = await db.query(
    `SELECT
       AVG(compliance_score)::int AS avg_compliance,
       AVG(maturity_level)::int AS avg_maturity
     FROM audits
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const activeAudits = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM audits
     WHERE tenant_id = $1
       AND status IN ('brouillon', 'planifie', 'soumis')`,
    [tenantId]
  );

  const openCapas = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM capa
     WHERE tenant_id = $1
       AND status != 'closed'`,
    [tenantId]
  );

  const facilitiesInspected = await db.query(
    `SELECT COUNT(DISTINCT facility_id)::int AS total
     FROM audits
     WHERE tenant_id = $1
       AND status = 'cloture'`,
    [tenantId]
  );

  const totalFacilities = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM facilities
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const capaCounts = await db.query(
    `SELECT severity, status, COUNT(*)::int AS count
     FROM capa
     WHERE tenant_id = $1
     GROUP BY severity, status`,
    [tenantId]
  );

  const trendRows = await db.query(
    `SELECT to_char(date_trunc('month', COALESCE(date, scheduled_date)), 'Mon') AS month,
            AVG(compliance_score)::int AS compliance,
            AVG(maturity_level)::int AS maturity
     FROM audits
     WHERE tenant_id = $1
       AND COALESCE(date, scheduled_date) >= (NOW() - INTERVAL '6 months')
     GROUP BY date_trunc('month', COALESCE(date, scheduled_date))
     ORDER BY date_trunc('month', COALESCE(date, scheduled_date))`,
    [tenantId]
  );

  const auditTotal = auditTotals.rows[0] || { avg_compliance: 0, avg_maturity: 0 };
  const complianceScore = Number(auditTotal.avg_compliance || 0);
  const maturityScore = Number(auditTotal.avg_maturity || 0);

  const templateRows = await db.query(
    `SELECT id, schema_json
     FROM templates
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const templateMap = new Map(templateRows.rows.map((row) => [row.id, row.schema_json]));

  const auditRows = await db.query(
    `SELECT id, template_id
     FROM audits
     WHERE tenant_id = $1
       AND template_id IS NOT NULL`,
    [tenantId]
  );

  const auditTemplateMap = new Map(auditRows.rows.map((row) => [row.id, row.template_id]));
  const auditIds = auditRows.rows.map((row) => row.id);

  let categoryScores = new Map();
  if (auditIds.length > 0) {
    const answerRows = await db.query(
      `SELECT audit_id, question_id, response_value
       FROM answers
       WHERE audit_id = ANY($1::uuid[])`,
      [auditIds]
    );

    const questionMetaCache = new Map();
    for (const row of answerRows.rows) {
      const templateId = auditTemplateMap.get(row.audit_id);
      if (!templateId) {
        continue;
      }

      if (!questionMetaCache.has(templateId)) {
        const schema = templateMap.get(templateId);
        const questionMeta = new Map();

        if (schema && Array.isArray(schema.questions)) {
          for (const question of schema.questions) {
            const questionId = question?.question_id || question?.id || null;
            const category = resolveCategory(question);
            if (!questionId || !category) {
              continue;
            }

            questionMeta.set(questionId, {
              category,
              matPoints: Number(question?.mat_points || 0)
            });
          }
        }

        questionMetaCache.set(templateId, questionMeta);
      }

      const questionMeta = questionMetaCache.get(templateId);
      const meta = questionMeta?.get(row.question_id);
      if (!meta || meta.matPoints <= 0) {
        continue;
      }

      if (!categoryScores.has(meta.category)) {
        categoryScores.set(meta.category, { total: 0, earned: 0 });
      }

      const score = categoryScores.get(meta.category);
      score.total += meta.matPoints;

      const normalizedAnswer = extractAnswerValue(row.response_value);
      if (isAnswerYes(normalizedAnswer)) {
        score.earned += meta.matPoints;
      }
    }
  }

  const trendData = trendRows.rows.map((row) => ({
    name: row.month,
    compliance: Number(row.compliance || 0),
    maturity: Number(row.maturity || 0)
  }));

  const normalizeCounts = (statuses) => {
    return capaCounts.rows
      .filter((row) => statuses.includes(row.status))
      .reduce(
        (acc, row) => {
          const severityKey = row.severity ? row.severity.toLowerCase() : 'minor';
          if (severityKey === 'critical') {
            acc.Critical += row.count;
          } else if (severityKey === 'major') {
            acc.Major += row.count;
          } else {
            acc.Minor += row.count;
          }
          return acc;
        },
        { Critical: 0, Major: 0, Minor: 0 }
      );
  };

  const hasCategoryScores = Array.from(categoryScores.values()).some((score) => score.total > 0);
  const radarData = hasCategoryScores
    ? Array.from(categoryScores.entries()).map(([category, score]) => ({
      subject: category,
      A: score.total > 0 ? Math.round((score.earned / score.total) * 100) : 0,
      fullMark: 100
    }))
    : [
      { subject: 'Safety', A: complianceScore, fullMark: 100 },
      { subject: 'Hygiene', A: maturityScore, fullMark: 100 },
      { subject: 'Documentation', A: maturityScore, fullMark: 100 },
      { subject: 'Training', A: maturityScore, fullMark: 100 },
      { subject: 'Process', A: complianceScore, fullMark: 100 }
    ];

  const response = {
    complianceScore,
    maturityScore,
    activeAudits: Number(activeAudits.rows[0]?.total || 0),
    openCapas: Number(openCapas.rows[0]?.total || 0),
    facilitiesInspected: Number(facilitiesInspected.rows[0]?.total || 0),
    totalFacilities: Number(totalFacilities.rows[0]?.total || 0),
    radarData,
    capaCounts: {
      open: normalizeCounts(['todo', 'inProgress', 'review']),
      closed: normalizeCounts(['closed'])
    },
    trendData
  };

  return res.status(200).json({
    success: true,
    data: response
  });
};

module.exports = {
  getAnalyticsOverview
};
