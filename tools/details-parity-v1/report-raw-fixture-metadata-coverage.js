const fs = require("fs");

const fixturePath = "tools/details-parity-v1/expanded-details-fixture.json";
const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const rows = Array.isArray(raw) ? raw : (raw.rows || raw.items || raw.movies || raw.hits || []);

const fields = ["poster","backdrop","overview","rating","genre","runtime","language","director","productionCompanies"];

function hasValue(row, field) {
const value = row[field];
if (Array.isArray(value)) return value.length > 0;
if (typeof value === "number") return true;
if (typeof value === "string") return value.trim().length > 0;
return value !== null && value !== undefined;
}

console.log("RAW_ROWS=" + rows.length);
for (const field of fields) {
console.log("RAW_" + field + "=" + rows.filter(row => hasValue(row, field)).length);
}
