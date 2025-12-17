const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const getEnv = (key, fallback) => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

const parsePort = (value, fallback) => {
  const parsed = Number(value ?? fallback);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid port value "${value}"`);
  }
  return parsed;
};

const sslKeyPath = getEnv('SSL_KEY_PATH');
const sslCertPath = getEnv('SSL_CERT_PATH');

const readSSL = () => {
  if (!sslKeyPath && !sslCertPath) {
    return null;
  }

  if (!sslKeyPath || !sslCertPath) {
    throw new Error('Both SSL_KEY_PATH and SSL_CERT_PATH must be provided.');
  }

  const resolvedKeyPath = path.resolve(sslKeyPath);
  const resolvedCertPath = path.resolve(sslCertPath);

  if (!fs.existsSync(resolvedKeyPath) || !fs.existsSync(resolvedCertPath)) {
    throw new Error('SSL certificate files could not be found at the provided paths.');
  }

  return {
    key: fs.readFileSync(resolvedKeyPath),
    cert: fs.readFileSync(resolvedCertPath),
  };
};

module.exports = {
  host: getEnv('HOST', '0.0.0.0'),
  domain: getEnv('DOMAIN', 'localhost'),
  port: parsePort(getEnv('PORT', '1445')),
  peerPath: getEnv('PEER_PATH', '/peers'),
  peerKey: getEnv('PEER_KEY', 'peerjs'),
  corsOrigin: getEnv('CORS_ORIGIN', '*'),
  ssl: readSSL(),
};
