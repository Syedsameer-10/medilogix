import type { TestReading } from './types/TestReading';

export interface TestStatistics {
  averagePsi: number;
  minimumPsi: number;
  peakPsi: number;
  sampleCount: number;
  testDuration: string;
}

function parseTimestampSeconds(timestamp: string) {
  const [hours, minutes, seconds] = timestamp.split(':').map(Number);
  if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return 0;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(normalizedSeconds / 60);
  const seconds = normalizedSeconds % 60;

  if (minutes === 0) {
    return `${seconds} sec`;
  }

  return `${minutes} min ${seconds} sec`;
}

export function calculateStatistics(readings: TestReading[]): TestStatistics {
  if (readings.length === 0) {
    throw new Error('No valid PSI readings found');
  }

  const psiValues = readings.map((reading) => reading.psi);
  const firstTimestamp = parseTimestampSeconds(readings[0].timestamp);
  const lastTimestamp = parseTimestampSeconds(readings[readings.length - 1].timestamp);

  return {
    averagePsi: psiValues.reduce((sum, value) => sum + value, 0) / psiValues.length,
    minimumPsi: Math.min(...psiValues),
    peakPsi: Math.max(...psiValues),
    sampleCount: readings.length,
    testDuration: formatDuration(lastTimestamp - firstTimestamp),
  };
}
