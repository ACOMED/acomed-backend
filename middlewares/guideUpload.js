const fs = require('fs');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');

const uploadRoot = path.join(__dirname, '..', 'uploads', 'guides');

const ensureUploadDir = () => {
  if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
  }
};

const sanitizeFilename = (name) => {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(-120);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    cb(null, uploadRoot);
  },
  filename: (req, file, cb) => {
    const safeName = sanitizeFilename(file.originalname);
    const suffix = crypto.randomUUID();
    const filename = `${Date.now()}-${suffix}-${safeName || 'guide'}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

module.exports = {
  upload
};
