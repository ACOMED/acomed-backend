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
       COUNT(*)::int AS total,
       SUM(CASE WHEN status = 'cloture' THEN 1 ELSE 0 END)::int AS closed,
       AVG(compliance_score)::int AS avg_compliance
     FROM audits
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

  const facilityTotals = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM facilities
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

  const pendingCapas = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM capa
     WHERE tenant_id = $1
       AND status != 'closed'`,
    [tenantId]
  );

  const facilityInspected = await db.query(
    `SELECT COUNT(DISTINCT facility_id)::int AS total
     FROM audits
     WHERE tenant_id = $1`,
    [tenantId]
  );

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

  const auditTotal = auditTotals.rows[0] || { total: 0, closed: 0, avg_compliance: 0 };
  const response = {
    compliance_score: Number(auditTotal.avg_compliance || 0),
    maturity_scores: {
      Process: 0,
      Documentation: 0,
      Training: 0,
      'Risk Mgmt': 0,
      Audit: 0,
      CAPA: 0
    },
    capa_counts: {
      open: normalizeCounts(['todo', 'inProgress', 'review']),
      closed: normalizeCounts(['closed'])
    },
    kpis: {
      active_audits: Number(activeAudits.rows[0]?.total || 0),
      pending_capas: Number(pendingCapas.rows[0]?.total || 0),
      facilities_inspected: Number(facilityInspected.rows[0]?.total || 0),
      total_facilities: Number(facilityTotals.rows[0]?.total || 0),
      system_health: 'Good'
    }
  };

  return sendResponse(res, 200, true, response, 'Analytics overview fetched successfully.');
};

module.exports = {
  getAnalyticsOverview
};
