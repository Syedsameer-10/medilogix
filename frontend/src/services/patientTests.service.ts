import type { PatientTestRecord } from '../types/patientTest';
import { apiClient } from './apiClient';

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown }; status?: number } }).response;
    const message = response?.data?.message;

    if (typeof message === 'string' && message.trim()) {
      return getUserSafeMessage(message, response?.status, fallback);
    }
  }

  return fallback;
}

function getUserSafeMessage(message: string, status: number | undefined, fallback: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('storage') || normalizedMessage.includes('bucket') || normalizedMessage.includes('supabase')) {
    return 'The analysis file could not be saved. Please try again shortly.';
  }

  if (normalizedMessage.includes('gzip') || normalizedMessage.includes('compressed txt')) {
    return 'The analysis file could not be processed. Please try importing the TXT file again.';
  }

  if (normalizedMessage.includes('parse') || normalizedMessage.includes('txt')) {
    return 'This TXT file could not be read. Please check the file format and try again.';
  }

  if (status && status >= 500) {
    return 'The server is temporarily unavailable. Please try again shortly.';
  }

  if (normalizedMessage.includes('record not found')) {
    return 'This record is no longer available.';
  }

  if (normalizedMessage.includes('required') || normalizedMessage.includes('complete every')) {
    return message;
  }

  return fallback;
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
    throw new Error(getApiErrorMessage(error, 'Analysis could not be loaded. Please try again.'), { cause: error });
  }
}

export async function createPatientTest(record: PatientTestRecord) {
  try {
    const response = await apiClient.post<{ record: PatientTestRecord }>('/patient-tests', record);

    return response.data.record;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Record was not saved. Complete every required field and try again.'), { cause: error });
  }
}

export async function updatePatientTestMetadata(
  recordId: string,
  values: Pick<PatientTestRecord, 'age' | 'caseHistory' | 'description' | 'gender' | 'patientName'>,
) {
  try {
    const response = await apiClient.patch<{ record: PatientTestRecord }>(`/patient-tests/${encodeURIComponent(recordId)}`, values);

    return response.data.record;
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Patient information could not be updated. Please try again.'), { cause: error });
  }
}

export async function deletePatientTest(recordId: string) {
  try {
    await apiClient.delete(`/patient-tests/${encodeURIComponent(recordId)}`);
  } catch (error) {
    throw new Error(getApiErrorMessage(error, 'Record could not be deleted. Please try again.'), { cause: error });
  }
}
