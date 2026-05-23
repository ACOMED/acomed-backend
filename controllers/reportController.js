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

const normalizeReportType = (value) => {
  if (!value) {
    return 'compliance';
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized;
};

const getReports = async (req, res) => {
  const tenantId = ensureTenantId(req);
  const reportType = normalizeReportType(req.query.report_type);
  const allowedTypes = new Set(['compliance', 'maturity']);

  if (!allowedTypes.has(reportType)) {
    return sendResponse(res, 400, false, null, 'Invalid report_type.');
  }

  const dateRangeValue = Number(req.query.date_range || 30);
  const dateRange = Number.isFinite(dateRangeValue) && dateRangeValue > 0 ? Math.floor(dateRangeValue) : 30;
  const facilityId = req.query.facility_id || null;
  const scoreColumn = reportType === 'maturity' ? 'maturity_level' : 'compliance_score';

  const params = [tenantId];
  let paramIndex = 2;
  let dateFilterSql = '';
  if (dateRange) {
    dateFilterSql = `AND COALESCE(a.date, a.scheduled_date) >= (NOW() - ($${paramIndex}::text || ' days')::interval)`;
    params.push(dateRange);
    paramIndex += 1;
  }

  let facilityFilterSql = '';
  if (facilityId) {
    facilityFilterSql = `AND f.id = $${paramIndex}`;
    params.push(facilityId);
  }

  const result = await db.query(
    `SELECT f.name AS facility,
            COUNT(a.id) FILTER (WHERE a.status = 'cloture')::int AS audits_completed,
            AVG(a.${scoreColumn}) FILTER (WHERE a.status = 'cloture')::numeric AS avg_score,
            COUNT(c.id) FILTER (WHERE c.status != 'closed')::int AS pending_capas
     FROM facilities f
     LEFT JOIN audits a
       ON a.facility_id = f.id
      AND a.tenant_id = $1
      ${dateFilterSql}
     LEFT JOIN capa c
       ON c.audit_id = a.id
      AND c.tenant_id = $1
     WHERE f.tenant_id = $1
     ${facilityFilterSql}
     GROUP BY f.name
     ORDER BY f.name ASC`,
    params
  );

  const headers = [
    'Facility',
    'Audits Completed',
    reportType === 'maturity' ? 'Avg Maturity' : 'Avg Compliance',
    'Pending CAPAs'
  ];

  const rows = result.rows.map((row) => {
    const avgScore = Number(row.avg_score || 0);
    return [
      row.facility,
      String(row.audits_completed || 0),
      `${Math.round(avgScore)}%`,
      String(row.pending_capas || 0)
    ];
  });

  return sendResponse(res, 200, true, { headers, rows }, 'Reports fetched successfully.');
};

module.exports = {
  getReports
};
