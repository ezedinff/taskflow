import { cpSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const [username, tag] = process.argv.slice(2);
if (!username || !tag || !/^[a-z0-9_-]+$/.test(username) || !/^[a-zA-Z0-9_.-]+$/.test(tag))
  throw new Error('Usage: node scripts/registry-manifests.mjs username immutable-tag');
const target = '.taskflow/registry';
mkdirSync(target, { recursive: true });
cpSync('infrastructure/kubernetes', target, { recursive: true });
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(p);
    else {
      let s = readFileSync(p, 'utf8');
      for (const image of ['project-service', 'task-service', 'web'])
        s = s.replaceAll(`taskflow-${image}:dev`, `${username}/taskflow-${image}:${tag}`);
      writeFileSync(p, s);
    }
  }
}
visit(target);
console.log(`Prepared ${target} with registry image tags`);
