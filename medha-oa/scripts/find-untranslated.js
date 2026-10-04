const fs = require("fs");
const path = require("path");

const roots = ["app", "components"];
const ignored = /(?:import|from|className|aria-|href=|src=|key=|type=|role=|id=|placeholder=|value=|name=|on[A-Z])/;
const pattern = />\s*([A-Za-z]{3,}[^<>{}\n]*)\s*</g;
let findings = [];

for (const root of roots) {
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[jt]sx?$/.test(entry.name)) {
        const source = fs.readFileSync(file, "utf8");
        for (const match of source.matchAll(pattern)) {
          const text = match[1].trim();
          if (!ignored.test(text) && !/[=();]/.test(text) && !source.slice(Math.max(0, match.index - 20), match.index).includes("t(")) findings.push(`${file}: ${text}`);
        }
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
}

console.log(findings.length ? findings.join("\n") : "No likely untranslated JSX text found.");
process.exitCode = findings.length ? 1 : 0;