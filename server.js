const express = require('express');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const syncRoutes = require('./routes/syncRoutes');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok' },
    message: 'Server is running.'
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
