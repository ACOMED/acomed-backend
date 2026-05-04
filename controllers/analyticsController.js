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

  const trendData = trendRows.rows.map((row) => ({
    name: row.month,
    compliance: Number(row.compliance || 0),
    maturity: Number(row.maturity || 0)
  }));

  const response = {
    complianceScore,
    maturityScore,
    activeAudits: Number(activeAudits.rows[0]?.total || 0),
    openCapas: Number(openCapas.rows[0]?.total || 0),
    radarData: [
      { subject: 'Safety', A: complianceScore, fullMark: 100 },
      { subject: 'Hygiene', A: maturityScore, fullMark: 100 }
    ],
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
