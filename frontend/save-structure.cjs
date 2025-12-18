const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next'];

const output = [];
const INDENT = '  ';

function walk(dir, level = 0) {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory() && EXCLUDE_DIRS.includes(item)) {
      continue;
    }

    const prefix = INDENT.repeat(level) + (stat.isDirectory() ? '📁 ' : '📄 ');
    output.push(prefix + item);

    if (stat.isDirectory()) {
      walk(fullPath, level + 1);
    }
  }
}

const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
walk(rootDir);

fs.writeFileSync('project-structure.txt', output.join('\n'), 'utf8');
console.log('✅ The project structure is saved in project-structure.txt');
