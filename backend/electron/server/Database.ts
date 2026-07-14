import crypto from 'node:crypto';
import path from 'node:path';
import { parseTxtFile } from '../parser/TxtParser';
import type { PatientImportRecord } from '../parser/types/PatientImport';
import { compressBuffer, decompressBuffer, SupabaseCompressedStorage } from './CompressedStorage';
import { hashPassword, verifyPassword } from './Auth';

export interface DoctorRecord {
  createdAt: string;
  email: string;
  hospitalLogoPath: string;
  hospitalLogoUrl: string;
  id: string;
  name: string;
  phoneNumber: string;
  serialNumber: string;
}

export interface DoctorAuthRecord extends DoctorRecord {
  passwordHash: string;
  passwordSalt: string;
}

interface DoctorRow {
  created_at: string;
  email: string;
  hospital_logo_path?: string;
  hospital_logo_url?: string;
  id: string;
  name: string;
  password_hash: string;
  password_salt: string;
  phone_number?: string;
  serial_number?: string;
}

interface PatientTestRow {
  age: number;
  average_psi: number;
  case_history: string;
  description: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  id: string;
  imported_at: string;
  minimum_psi: number;
  patient_file_id: string;
  patient_name: string;
  peak_psi: number | null;
  sample_count: number;
  saved_at: string;
  source_file_name: string | null;
  status: 'Completed' | null;
  stimulation_current_ma: string | null;
  storage_file_path: string | null;
  test_date: string;
  test_duration: string;
}

export interface PatientTestInput {
  age: string;
  averagePsi: number;
  caseHistory: string;
  description: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  id: string;
  importedAt: string;
  minimumPsi: number;
  originalTxtContent?: string;
  patientName: string;
  peakPsi?: number;
  sampleCount: number;
  samples: Array<{ psi: number; time?: string; timestamp?: string }>;
  sourceFileName?: string;
  stimulationCurrentMa?: string;
  testDate: string;
  testDuration: string;
}

export interface PatientTestMetadataInput {
  age: string;
  caseHistory: string;
  description: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  patientName: string;
}

export interface RegisterDoctorInput {
  gmail: string;
  hospitalLogo: {
    base64: string;
    fileName: string;
    mimeType: string;
  };
  name: string;
  password: string;
  phoneNumber: string;
  serialNumber: string;
}

export interface PatientTestRecord {
  age: string;
  averagePsi: number;
  caseHistory: string;
  description: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  id: string;
  importedAt: string;
  minimumPsi: number;
  patientName: string;
  peakPsi: number;
  recordId: string;
  sampleCount: number;
  samples: Array<{ psi: number; time: string; timestamp: string }>;
  savedAt: string;
  sourceFileName?: string;
  storageFilePath?: string;
  status: 'Completed';
  stimulationCurrentMa: string;
  testDate: string;
  testDuration: string;
}

export class MedilogixDatabase {
  private anonKey: string;
  private serviceRoleKey: string;
  private storage: SupabaseCompressedStorage;
  private supabaseUrl: string;
  private tokenSecret: string;

  constructor() {
    this.supabaseUrl = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    this.anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? this.serviceRoleKey;
    this.tokenSecret = process.env.MEDILOGIX_JWT_SECRET ?? crypto.randomBytes(32).toString('hex');

    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the MediLogiX API');
    }

    this.storage = new SupabaseCompressedStorage({
      anonKey: this.anonKey,
      bucketName: 'patient-test-files',
      serviceRoleKey: this.serviceRoleKey,
      supabaseUrl: this.supabaseUrl,
    });
  }

  async initialize() {
    await this.seedDefaultDoctor();
  }

  close() {
    return undefined;
  }

  getTokenSecret() {
    return this.tokenSecret;
  }

  async findDoctorByEmail(email: string) {
    const rows = await this.request<DoctorRow[]>('doctors', {
      query: {
        email: `eq.${email}`,
        limit: '1',
        select: '*',
      },
    });

    return rows[0] ? this.mapDoctorAuth(rows[0]) : null;
  }

  async getDoctorById(id: string) {
    const rows = await this.request<DoctorRow[]>('doctors', {
      query: {
        id: `eq.${id}`,
        limit: '1',
        select: '*',
      },
    });

    return rows[0] ? this.mapDoctor(rows[0]) : null;
  }

  async listPatientTests(doctorId: string) {
    const rows = await this.request<PatientTestRow[]>('patient_test_records', {
      query: {
        doctor_id: `eq.${doctorId}`,
        order: 'saved_at.desc',
        select: '*',
      },
    });

    return rows.map((row) => this.mapPatientTestMetadata(row));
  }

  async getPatientTest(recordId: string, doctorId: string) {
    const rows = await this.request<PatientTestRow[]>('patient_test_records', {
      query: {
        doctor_id: `eq.${doctorId}`,
        id: `eq.${recordId}`,
        limit: '1',
        select: '*',
      },
    });

    return rows[0] ? this.mapPatientTestWithSamples(rows[0]) : null;
  }

  async createPatientTest(doctorId: string, input: PatientTestInput) {
    const recordId = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    const originalTxtContent = input.originalTxtContent ?? this.createTxtContentFromSamples(input);
    const sourceFileName = input.sourceFileName || `${input.id}.txt`;
    let parsedRecord;

    try {
      parsedRecord = parseTxtFile(sourceFileName, originalTxtContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TXT parsing failed';
      throw new Error(`TXT parsing failed before save: ${message}`);
    }

    const storagePath = this.createPatientTestStoragePath(doctorId, recordId, sourceFileName);
    let uploadedStoragePath: string;

    try {
      const compressedBuffer = await compressBuffer(originalTxtContent);
      await this.assertCompressionRoundTrip(sourceFileName, originalTxtContent, compressedBuffer, parsedRecord);
      uploadedStoragePath = await this.storage.uploadCompressedFile(storagePath, compressedBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compressed TXT upload failed';
      throw new Error(`Patient TXT storage failed: ${message}`);
    }

    try {
      const record = await this.rpc<PatientTestRow>('save_patient_test', {
        p_age: Number(input.age),
        p_average_psi: parsedRecord.averagePsi,
        p_case_history: input.caseHistory,
        p_description: input.description,
        p_doctor_id: doctorId,
        p_gender: input.gender,
        p_id: recordId,
        p_imported_at: input.importedAt,
        p_minimum_psi: parsedRecord.minimumPsi,
        p_patient_file_id: input.id,
        p_patient_name: input.patientName,
        p_peak_psi: parsedRecord.peakPsi,
        p_sample_count: parsedRecord.sampleCount,
        p_saved_at: savedAt,
        p_source_file_name: sourceFileName,
        p_status: 'Completed',
        p_stimulation_current_ma: parsedRecord.stimulationCurrentMa,
        p_storage_file_path: uploadedStoragePath,
        p_test_date: parsedRecord.testDate,
        p_test_duration: parsedRecord.testDuration,
      });

      return this.mapPatientTestMetadata(record);
    } catch (error) {
      try {
        await this.storage.deleteCompressedFile(uploadedStoragePath);
      } catch (cleanupError) {
        console.warn('[MediLogiX] Uploaded TXT cleanup failed after metadata save failure', cleanupError);
      }

      throw error;
    }
  }

  async createDoctor(input: RegisterDoctorInput) {
    const existingDoctor = await this.findDoctorByEmail(input.gmail);

    if (existingDoctor) {
      throw new Error('An account already exists for this Gmail address');
    }

    const credentials = hashPassword(input.password);
    const doctorId = crypto.randomUUID();
    const hospitalLogoPath = await this.uploadHospitalLogo(doctorId, input.hospitalLogo);
    const [row] = await this.request<DoctorRow[]>('doctors', {
      body: {
        created_at: new Date().toISOString(),
        email: input.gmail,
        id: doctorId,
        name: input.name,
        hospital_logo_path: hospitalLogoPath,
        hospital_logo_url: '',
        password_hash: credentials.hash,
        password_salt: credentials.salt,
        phone_number: input.phoneNumber,
        serial_number: input.serialNumber,
      },
      method: 'POST',
      prefer: 'return=representation',
    });

    return this.mapDoctor(row);
  }

  async changeDoctorPassword(doctorId: string, currentPassword: string, newPassword: string) {
    const rows = await this.request<DoctorRow[]>('doctors', {
      query: {
        id: `eq.${doctorId}`,
        limit: '1',
        select: '*',
      },
    });
    const doctor = rows[0] ? await this.mapDoctorAuth(rows[0]) : null;

    if (!doctor || !verifyPassword(currentPassword, doctor.passwordSalt, doctor.passwordHash)) {
      throw new Error('Current password is incorrect');
    }

    const credentials = hashPassword(newPassword);

    await this.request('doctors', {
      body: {
        password_hash: credentials.hash,
        password_salt: credentials.salt,
      },
      method: 'PATCH',
      query: {
        id: `eq.${doctorId}`,
      },
    });
  }

  async updatePatientTestMetadata(recordId: string, doctorId: string, input: PatientTestMetadataInput) {
    const rows = await this.request<PatientTestRow[]>('patient_test_records', {
      body: {
        age: Number(input.age),
        case_history: input.caseHistory,
        description: input.description,
        gender: input.gender,
        patient_name: input.patientName,
      },
      method: 'PATCH',
      prefer: 'return=representation',
      query: {
        doctor_id: `eq.${doctorId}`,
        id: `eq.${recordId}`,
      },
    });

    return rows[0] ? this.mapPatientTestMetadata(rows[0]) : null;
  }

  async deletePatientTest(recordId: string, doctorId: string) {
    const rows = await this.findPatientTestForDelete(recordId, doctorId);
    const record = rows[0];

    if (!record) {
      return false;
    }

    if (record.storage_file_path) {
      await this.storage.deleteCompressedFile(record.storage_file_path);
    }

    await this.request('patient_test_records', {
      method: 'DELETE',
      query: {
        doctor_id: `eq.${doctorId}`,
        id: `eq.${recordId}`,
      },
    });

    return true;
  }

  private async findPatientTestForDelete(recordId: string, doctorId: string) {
    try {
      return await this.request<PatientTestRow[]>('patient_test_records', {
        query: {
          doctor_id: `eq.${doctorId}`,
          id: `eq.${recordId}`,
          limit: '1',
          select: 'id,storage_file_path',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (!message.includes('storage_file_path')) {
        throw error;
      }

      return this.request<PatientTestRow[]>('patient_test_records', {
        query: {
          doctor_id: `eq.${doctorId}`,
          id: `eq.${recordId}`,
          limit: '1',
          select: 'id',
        },
      });
    }
  }

  private async seedDefaultDoctor() {
    const rows = await this.request<Array<{ id: string }>>('doctors', {
      query: {
        limit: '1',
        select: 'id',
      },
    });

    if (rows.length > 0) {
      return;
    }

    const email = process.env.MEDILOGIX_DEFAULT_DOCTOR_EMAIL ?? 'doctor@medilogix.local';
    const password = process.env.MEDILOGIX_DEFAULT_DOCTOR_PASSWORD ?? 'MediLogix@2026';
    const name = process.env.MEDILOGIX_DEFAULT_DOCTOR_NAME ?? 'MediLogiX Doctor';
    const credentials = hashPassword(password);

    await this.request('doctors', {
      body: {
        created_at: new Date().toISOString(),
        email,
        id: crypto.randomUUID(),
        name,
        hospital_logo_path: '',
        hospital_logo_url: '',
        password_hash: credentials.hash,
        password_salt: credentials.salt,
        phone_number: '',
        serial_number: '',
      },
      method: 'POST',
    });
  }

  private mapPatientTestMetadata(row: PatientTestRow): PatientTestRecord {
    return {
      age: String(row.age),
      averagePsi: row.average_psi,
      caseHistory: row.case_history ?? '',
      description: row.description,
      gender: row.gender,
      id: row.patient_file_id,
      importedAt: row.imported_at,
      minimumPsi: row.minimum_psi,
      patientName: row.patient_name,
      peakPsi: row.peak_psi ?? row.average_psi,
      recordId: row.id,
      sampleCount: row.sample_count,
      samples: [],
      savedAt: row.saved_at,
      sourceFileName: row.source_file_name ?? undefined,
      storageFilePath: row.storage_file_path ?? undefined,
      status: 'Completed',
      stimulationCurrentMa: row.stimulation_current_ma ?? '--',
      testDate: row.test_date,
      testDuration: row.test_duration,
    };
  }

  private async mapPatientTestWithSamples(row: PatientTestRow): Promise<PatientTestRecord> {
    if (!row.storage_file_path) {
      throw new Error('Analysis file is not available for this patient test');
    }

    let decompressedText: string;

    try {
      const compressedBuffer = await this.storage.downloadCompressedFile(row.storage_file_path);
      decompressedText = (await decompressBuffer(compressedBuffer)).toString('utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Compressed TXT download failed';
      throw new Error(`Analysis file could not be loaded: ${message}`);
    }

    let parsedRecord;

    try {
      parsedRecord = parseTxtFile(row.source_file_name ?? `${row.patient_file_id}.txt`, decompressedText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'TXT parsing failed';
      throw new Error(`Analysis file could not be parsed: ${message}`);
    }

    return {
      ...this.mapPatientTestMetadata(row),
      averagePsi: parsedRecord.averagePsi,
      minimumPsi: parsedRecord.minimumPsi,
      peakPsi: parsedRecord.peakPsi,
      sampleCount: parsedRecord.sampleCount,
      samples: parsedRecord.samples.map((sample) => ({
        psi: sample.psi,
        time: sample.timestamp,
        timestamp: sample.timestamp,
      })),
      stimulationCurrentMa: parsedRecord.stimulationCurrentMa || this.mapPatientTestMetadata(row).stimulationCurrentMa,
      testDate: parsedRecord.testDate,
      testDuration: parsedRecord.testDuration,
    };
  }

  private createPatientTestStoragePath(doctorId: string, recordId: string, sourceFileName: string) {
    const extension = path.extname(sourceFileName) || '.txt';
    const baseName = path.basename(sourceFileName, extension).replace(/[^a-zA-Z0-9._-]/g, '_') || 'patient-test';

    return `${doctorId}/${recordId}/${baseName}${extension}.gz`;
  }

  private async assertCompressionRoundTrip(
    sourceFileName: string,
    originalTxtContent: string,
    compressedBuffer: Buffer,
    parsedRecord: PatientImportRecord,
  ) {
    const decompressedText = (await decompressBuffer(compressedBuffer)).toString('utf8');

    if (decompressedText !== originalTxtContent) {
      throw new Error('Compressed TXT round-trip mismatch');
    }

    const reparsedRecord = parseTxtFile(sourceFileName, decompressedText);

    if (
      reparsedRecord.testDate !== parsedRecord.testDate ||
      reparsedRecord.testDuration !== parsedRecord.testDuration ||
      reparsedRecord.averagePsi !== parsedRecord.averagePsi ||
      reparsedRecord.minimumPsi !== parsedRecord.minimumPsi ||
      reparsedRecord.peakPsi !== parsedRecord.peakPsi ||
      reparsedRecord.sampleCount !== parsedRecord.sampleCount ||
      reparsedRecord.stimulationCurrentMa !== parsedRecord.stimulationCurrentMa ||
      reparsedRecord.samples.length !== parsedRecord.samples.length
    ) {
      throw new Error('Compressed TXT parser round-trip mismatch');
    }

    parsedRecord.samples.forEach((sample, index) => {
      const reparsedSample = reparsedRecord.samples[index];

      if (!reparsedSample || reparsedSample.timestamp !== sample.timestamp || reparsedSample.psi !== sample.psi) {
        throw new Error('Compressed TXT sample round-trip mismatch');
      }
    });
  }

  private createTxtContentFromSamples(input: PatientTestInput) {
    const sampleLines = input.samples.map((sample) => `${sample.timestamp ?? sample.time}, ${sample.psi}`);

    return [input.testDate, ...sampleLines].join('\n');
  }

  private async mapDoctor(row: DoctorRow): Promise<DoctorRecord> {
    const logoPath = row.hospital_logo_path ?? '';

    return {
      createdAt: row.created_at,
      email: row.email,
      hospitalLogoPath: logoPath,
      hospitalLogoUrl: logoPath ? await this.createHospitalLogoSignedUrl(logoPath) : row.hospital_logo_url ?? '',
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number ?? '',
      serialNumber: row.serial_number ?? '',
    };
  }

  private async mapDoctorAuth(row: DoctorRow): Promise<DoctorAuthRecord> {
    return {
      ...(await this.mapDoctor(row)),
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
    };
  }

  private async createHospitalLogoSignedUrl(path: string) {
    const normalizedPath = path.replace(/^\/+/, '');
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/sign/hospital-logos/${normalizedPath}`, {
      body: JSON.stringify({ expiresIn: 60 * 60 }),
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      return '';
    }

    const payload = await response.json() as { signedURL?: string; signedUrl?: string };
    const signedPath = payload.signedURL ?? payload.signedUrl ?? '';

    if (!signedPath) {
      return '';
    }

    return signedPath.startsWith('http') ? signedPath : `${this.supabaseUrl}/storage/v1${signedPath}`;
  }

  private async uploadHospitalLogo(doctorId: string, logo: RegisterDoctorInput['hospitalLogo']) {
    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/svg+xml': 'svg',
      'image/webp': 'webp',
    };
    const extension = extensionByType[logo.mimeType];

    if (!extension) {
      throw new Error('Hospital logo must be PNG, JPG, WEBP, or SVG');
    }

    const fileBuffer = Buffer.from(logo.base64, 'base64');

    if (fileBuffer.length === 0 || fileBuffer.length > 1024 * 1024) {
      throw new Error('Hospital logo must be 1 MB or smaller');
    }

    const storagePath = `${doctorId}/logo.${extension}`;
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/hospital-logos/${storagePath}`, {
      body: fileBuffer,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': logo.mimeType,
        'x-upsert': 'true',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Hospital logo upload failed: ${details}`);
    }

    return storagePath;
  }

  private async request<T = unknown>(
    table: string,
    options: {
      body?: unknown;
      method?: 'DELETE' | 'GET' | 'PATCH' | 'POST';
      prefer?: string;
      query?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const query = new URLSearchParams(options.query ?? {});
    const url = `${this.supabaseUrl}/rest/v1/${table}${query.size > 0 ? `?${query.toString()}` : ''}`;
    const response = await fetch(url, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...(options.prefer ? { Prefer: options.prefer } : {}),
      },
      method: options.method ?? 'GET',
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase request failed: ${response.status} ${details}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const responseText = await response.text();

    if (!responseText) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }

  private async rpc<T = unknown>(functionName: string, body: unknown): Promise<T> {
    const url = `${this.supabaseUrl}/rest/v1/rpc/${functionName}`;
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Supabase RPC failed: ${response.status} ${details}`);
    }

    const responseText = await response.text();

    if (!responseText) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }
}
