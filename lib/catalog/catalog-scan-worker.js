'use strict';

const { parentPort, workerData } = require('worker_threads');
const { scanCatalog } = require('./scanner');

try {
  const catalog = scanCatalog({ ...workerData, logger: { warn() {} } });
  parentPort.postMessage({ ok: true, catalog });
} catch (error) {
  parentPort.postMessage({ ok: false, error: {
    name: error.name,
    message: error.message,
    code: error.code,
    availability: error.availability,
    stack: error.stack,
  } });
}
