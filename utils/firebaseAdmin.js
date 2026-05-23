const admin = require('firebase-admin');

let initialized = false;

const getFirebaseAdmin = () => {
  if (!initialized) {
    const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!rawConfig) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
    }

    let serviceAccount = null;
    try {
      serviceAccount = JSON.parse(rawConfig);
    } catch (error) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    initialized = true;
  }

  return admin;
};

module.exports = {
  getFirebaseAdmin
};
