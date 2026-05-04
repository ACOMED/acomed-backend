const express = require('express');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const syncRoutes = require('./routes/syncRoutes');
const templateRoutes = require('./routes/templateRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const auditRoutes = require('./routes/auditRoutes');
const capaRoutes = require('./routes/capaRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const { sendResponse } = require('./utils/response');

dotenv.config({ quiet: true });

const app = express();
const port = Number(process.env.PORT || 5000);
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(express.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = corsOrigin.split(',').map((value) => value.trim());

  if (corsOrigin === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/capas', capaRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/health', (req, res) => {
  return sendResponse(res, 200, true, { status: 'ok' }, 'Server is running.');
});

app.use((req, res) => {
  return sendResponse(res, 404, false, null, 'Route not found.');
});

app.use((error, req, res, next) => {
  const statusCode = Number(error.statusCode || error.status || 500);
  const message = error.message || 'Internal server error.';
  return sendResponse(res, statusCode, false, null, message);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
