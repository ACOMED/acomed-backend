const express = require('express');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const syncRoutes = require('./routes/syncRoutes');
const { sendResponse } = require('./utils/response');

dotenv.config({ quiet: true });

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);

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
