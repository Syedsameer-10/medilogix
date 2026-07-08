import path from 'node:path';
import { calculateStatistics } from './StatisticsCalculator';
import type { PatientImportRecord } from './types/PatientImport';
import type { TestReading } from './types/TestReading';

const datePattern = /\b\d{2}\/\d{2}\/\d{2}\b/;
const readingPattern = /^\s*(\d{2}:\d{2}:\d{2})\s*,\s*(-?\d+(?:\.\d+)?)\s*,?\s*$/;

export function parseTxtFile(filePath: string, content: string): PatientImportRecord {
  const fileName = path.basename(filePath);
  const patientId = path.parse(fileName).name;
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (lines.length === 0) {
    throw new Error('Empty TXT file');
  }

  const dateLine = lines.find((line) => datePattern.test(line));
  const testDate = dateLine?.match(datePattern)?.[0];

  if (!testDate) {
    throw new Error('Test date not found');
  }

  const samples: TestReading[] = [];

  lines.forEach((line) => {
    const match = line.match(readingPattern);
    if (!match) {
      return;
    }

    samples.push({
      timestamp: match[1],
      psi: Number(match[2]),
    });
  });

  const statistics = calculateStatistics(samples);

  return {
    id: patientId,
    patientName: '',
    gender: '',
    age: '',
    caseHistory: '',
    description: '',
    testDate,
    testDuration: statistics.testDuration,
    averagePsi: statistics.averagePsi,
    minimumPsi: statistics.minimumPsi,
    sampleCount: statistics.sampleCount,
    importedAt: new Date().toISOString(),
    status: 'Pending',
    samples,
  };
}
