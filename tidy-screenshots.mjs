// Keeps every screenshot in ONE folder: screenshots/
// Moves image files that landed in the project root, in .playwright-mcp/, or in an accidental
// nested screenshots/screenshots/ folder into screenshots/. Never deletes or overwrites:
// if a name already exists it adds -1, -2, ...
// Runs automatically after every Playwright tool call (PostToolUse hook in .claude/settings.json).
// Can also be run by hand: node tidy-screenshots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(root, 'screenshots');
const sources = [root, path.join(root, '.playwright-mcp'), path.join(dest, 'screenshots')];
const isImage = (f) => /\.(png|jpe?g)$/i.test(f);

try {
  fs.mkdirSync(dest, { recursive: true });
  let moved = 0;
  for (const dir of sources) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const from = path.join(dir, f);
      if (!isImage(f) || !fs.statSync(from).isFile()) continue;
      const { name, ext } = path.parse(f);
      let to = path.join(dest, f);
      for (let i = 1; fs.existsSync(to); i++) to = path.join(dest, `${name}-${i}${ext}`);
      fs.renameSync(from, to);
      moved++;
    }
  }
  if (moved) console.log(`tidy-screenshots: moved ${moved} image(s) into screenshots/`);
} catch (e) {
  console.error(`tidy-screenshots: ${e.message}`); // never block Claude Code
}
process.exit(0);
