'use strict';

const fs = require('fs');
const path = require('path');

function readCatalog(file, validate) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validate(parsed);
}

function loadCatalog(indexFile, validate, logger = console) {
  for (const file of [indexFile, `${indexFile}.bak`]) {
    try {
      if (!fs.existsSync(file)) continue;
      return { catalog: readCatalog(file, validate), source: file === indexFile ? 'primary' : 'backup' };
    } catch (error) {
      logger.warn?.(`[Catalog] Could not load ${path.basename(file)}: ${error.message}`);
    }
  }
  return null;
}

function fsyncFile(file) {
  const fd = fs.openSync(file, 'r+');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function atomicWriteCatalog(indexFile, catalog, validate) {
  const dir = path.dirname(indexFile);
  fs.mkdirSync(dir, { recursive: true });
  const temp = `${indexFile}.tmp`;
  const backup = `${indexFile}.bak`;
  const backupTemp = `${backup}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  fsyncFile(temp);
  readCatalog(temp, validate);

  if (fs.existsSync(indexFile)) {
    fs.copyFileSync(indexFile, backupTemp);
    fsyncFile(backupTemp);
    try { fs.renameSync(backupTemp, backup); }
    catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
      fs.rmSync(backup, { force: true });
      fs.renameSync(backupTemp, backup);
    }
  }
  try { fs.renameSync(temp, indexFile); }
  catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') throw error;
    fs.rmSync(indexFile, { force: true });
    fs.renameSync(temp, indexFile);
  }
  return catalog;
}

module.exports = { atomicWriteCatalog, loadCatalog, readCatalog };
