import type { PatientTestRecord } from '../types/patientTest';
import { apiClient } from './apiClient';

function getApiErrorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    const message = response?.data?.message;

    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return 'Record was not saved. Complete every required field and try again.';
}

export async function getPatientTests() {
  const response = await apiClient.get<{ records: PatientTestRecord[] }>('/patient-tests');

  return response.data.records;
}

export async function getPatientTest(recordId: string) {
  try {
    const response = await apiClient.get<{ record: PatientTestRecord }>(`/patient-tests/${encodeURIComponent(recordId)}`);

    return response.data.record;
  } catch (error) {
    throw new Error(getApiErrorMessage(error), { cause: error });
  }
}

export async function createPatientTest(record: PatientTestRecord) {
  try {
    const response = await apiClient.post<{ record: PatientTestRecord }>('/patient-tests', record);

    return response.data.record;
  } catch (error) {
    throw new Error(getApiErrorMessage(error), { cause: error });
  }
}

export async function updatePatientTestMetadata(recordId: string, values: Pick<PatientTestRecord, 'age' | 'caseHistory' | 'description' | 'gender' | 'patientName'>) {
  try {
    const response = await apiClient.patch<{ record: PatientTestRecord }>(`/patient-tests/${encodeURIComponent(recordId)}`, values);

    return response.data.record;
  } catch (error) {
    throw new Error(getApiErrorMessage(error), { cause: error });
  }
}
