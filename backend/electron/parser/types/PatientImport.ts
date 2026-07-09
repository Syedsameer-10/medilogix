import type { TestReading } from './TestReading';

export interface PatientImportRecord {
  id: string;
  patientName: '';
  gender: '';
  age: '';
  caseHistory: '';
  description: '';
  testDate: string;
  testDuration: string;
  averagePsi: number;
  minimumPsi: number;
  peakPsi: number;
  sampleCount: number;
  importedAt: string;
  status: 'Pending';
  samples: TestReading[];
  originalTxtContent: string;
  sourceFileName: string;
}

export interface PatientImportError {
  fileName: string;
  message: string;
}

export interface PatientImportResult {
  errors: PatientImportError[];
  records: PatientImportRecord[];
  txtFilesFound: number;
}
