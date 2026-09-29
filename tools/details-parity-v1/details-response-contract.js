"use strict";

function stableSort(value) {
if (Array.isArray(value)) {
return value.map(stableSort);
}

if (value && typeof value === "object") {
const out = {};
for (const key of Object.keys(value).sort()) {
const v = value[key];
if (v === undefined) continue;
out[key] = stableSort(v);
}
return out;
}

return value;
}

function normalizeDetailsResponse(response) {
return stableSort(response || {});
}

function normalizeDetailsSnapshot(response) {
return normalizeDetailsResponse(response);
}

function buildDetailsResponseSnapshot(response) {
return normalizeDetailsResponse(response);
}

function createDetailsResponseSnapshot(response) {
return normalizeDetailsResponse(response);
}

function snapshotDetailsResponse(response) {
return normalizeDetailsResponse(response);
}

function stableDetailsResponseSnapshot(response) {
return normalizeDetailsResponse(response);
}

function toDetailsResponseSnapshot(response) {
return normalizeDetailsResponse(response);
}

function sanitizeDetailsResponse(response) {
return normalizeDetailsResponse(response);
}

function canonicalizeDetailsResponse(response) {
return normalizeDetailsResponse(response);
}

function validateResponseContract(response, key) {
const problems = [];
const prefix = key ? String(key) + ": " : "";

if (!response || typeof response !== "object" || Array.isArray(response)) {
problems.push(prefix + "response must be an object");
return problems;
}

if ("ok" in response && typeof response.ok !== "boolean") {
problems.push(prefix + "ok must be boolean when present");
}

if ("error" in response && response.error != null && typeof response.error !== "string") {
problems.push(prefix + "error must be string/null when present");
}

if ("type" in response && response.type != null && typeof response.type !== "string") {
problems.push(prefix + "type must be string/null when present");
}

if ("title" in response && response.title != null && typeof response.title !== "string") {
problems.push(prefix + "title must be string/null when present");
}

if ("response" in response && response.response === undefined) {
problems.push(prefix + "nested response must not be undefined");
}

return problems;
}

function assertDetailsResponseContract(response, key) {
const problems = validateResponseContract(response, key);
if (problems.length) {
throw new Error(problems.join("; "));
}
return true;
}

function validateDetailsResponseContract(response, key) {
const errors = validateResponseContract(response, key);
return {
ok: errors.length === 0,
errors
};
}

function isDetailsResponseContractValid(response, key) {
return validateResponseContract(response, key).length === 0;
}

function compareDetailsResponseSnapshot(actual, expected) {
const normalizedActual = normalizeDetailsResponse(actual);
const normalizedExpected = normalizeDetailsResponse(expected);

return {
ok: JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected),
actual: normalizedActual,
expected: normalizedExpected
};
}

module.exports = {
DETAILS_RESPONSE_CONTRACT_VERSION: 1,

stableSort,
normalizeDetailsResponse,
normalizeDetailsSnapshot,

buildDetailsResponseSnapshot,
createDetailsResponseSnapshot,
snapshotDetailsResponse,
stableDetailsResponseSnapshot,
toDetailsResponseSnapshot,

sanitizeDetailsResponse,
canonicalizeDetailsResponse,

validateResponseContract,
assertDetailsResponseContract,
validateDetailsResponseContract,
isDetailsResponseContractValid,

compareDetailsResponseSnapshot
};
