const fs = require('node:fs/promises');
const path = require('node:path');

async function findTxtFiles(rootPath) {
  const files = [];

  async function walk(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.txt')) {
        files.push(entryPath);
      }
    }
  }

  await walk(rootPath);
  return files;
}

module.exports = { findTxtFiles };
