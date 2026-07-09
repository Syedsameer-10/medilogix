export type PatientTestStatus = 'Pending' | 'Completed';

export interface PsiSample {
  time?: string;
  timestamp?: string;
  psi: number;
}

export interface PatientTestRecord {
  id: string;
  recordId?: string;
  recordKey?: string;
  patientName: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  age: string;
  caseHistory: string;
  description: string;
  testDate: string;
  testDuration: string;
  averagePsi?: number;
  minimumPsi?: number;
  peakPsi?: number;
  sampleCount?: number;
  importedAt: string;
  savedAt?: string;
  sourceFileName?: string;
  storageFilePath?: string;
  originalTxtContent?: string;
  status: PatientTestStatus;
  samples: PsiSample[];
}

export interface PatientMetadataFormValues {
  patientName: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  age: string;
  caseHistory: string;
  description: string;
}
