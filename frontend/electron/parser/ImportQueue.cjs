const fs = require('node:fs/promises');
const path = require('node:path');
const { findTxtFiles } = require('./DriveScanner.cjs');
const { parseTxtFile } = require('./TxtParser.cjs');

class ImportQueue {
  records = [];

  getRecords() {
    return this.records;
  }

  async importFromDrive(driveLetter) {
    const txtFiles = await findTxtFiles(driveLetter);
    const records = [];
    const errors = [];

    if (txtFiles.length === 0) {
      return {
        errors: [{ fileName: driveLetter, message: 'No TXT files found' }],
        records: [],
        txtFilesFound: 0,
      };
    }

    for (const filePath of txtFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        records.push(parseTxtFile(filePath, content));
      } catch (error) {
        errors.push({
          fileName: path.basename(filePath),
          message: error instanceof Error ? error.message : 'Unreadable TXT file',
        });
      }
    }

    this.records = records;

    return {
      errors,
      records,
      txtFilesFound: txtFiles.length,
    };
  }
}

module.exports = { ImportQueue };
