import crypto from 'node:crypto';
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
  age: number | null;
  average_psi: number;
  case_history: string;
  description: string;
  gender: '' | 'Female' | 'Male' | 'Other';
  id: string;
  imported_at: string;
  minimum_psi: number;
  patient_file_id: string;
  patient_name: string;
  peak_psi: number;
  sample_count: number;
  saved_at: string;
  source_file_name: string | null;
  test_date: string;
  test_duration: string;
}

interface SampleRow {
  psi: number;
  timestamp: string;
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
  patientName: string;
  peakPsi: number;
  sampleCount: number;
  samples: Array<{ psi: number; time?: string; timestamp?: string }>;
  sourceFileName?: string;
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
  status: 'Completed' | 'Pending';
  testDate: string;
  testDuration: string;
}

export class MedilogixDatabase {
  private anonKey: string;
  private serviceRoleKey: string;
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

    return Promise.all(rows.map((row) => this.mapPatientTest(row)));
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

    return rows[0] ? this.mapPatientTest(rows[0]) : null;
  }

  async createPatientTest(doctorId: string, input: PatientTestInput) {
    const recordId = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    const record = await this.rpc<PatientTestRow>('save_patient_test', {
      p_age: input.age ? Number(input.age) : null,
      p_average_psi: input.averagePsi,
      p_case_history: input.caseHistory,
      p_description: input.description,
      p_doctor_id: doctorId,
      p_gender: input.gender,
      p_id: recordId,
      p_imported_at: input.importedAt,
      p_minimum_psi: input.minimumPsi,
      p_patient_file_id: input.id,
      p_patient_name: input.patientName,
      p_peak_psi: input.peakPsi,
      p_samples: input.samples.map((sample) => ({
        psi: sample.psi,
        timestamp: sample.timestamp ?? sample.time,
      })),
      p_saved_at: savedAt,
      p_source_file_name: input.sourceFileName ?? null,
      p_test_date: input.testDate,
      p_test_duration: input.testDuration,
    });

    return this.mapPatientTest(record);
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
    const doctor = rows[0] ? this.mapDoctorAuth(rows[0]) : null;

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

    return rows[0] ? this.mapPatientTest(rows[0]) : null;
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

  private async mapPatientTest(row: PatientTestRow): Promise<PatientTestRecord> {
    const sampleRows = await this.request<SampleRow[]>('patient_test_samples', {
      query: {
        order: 'sample_order.asc',
        record_id: `eq.${row.id}`,
        select: 'timestamp,psi',
      },
    });

    return {
      age: row.age ? String(row.age) : '',
      averagePsi: row.average_psi,
      caseHistory: row.case_history ?? '',
      description: row.description,
      gender: row.gender,
      id: row.patient_file_id,
      importedAt: row.imported_at,
      minimumPsi: row.minimum_psi,
      patientName: row.patient_name,
      peakPsi: row.peak_psi,
      recordId: row.id,
      sampleCount: row.sample_count,
      samples: sampleRows.map((sample) => ({
        psi: sample.psi,
        time: sample.timestamp,
        timestamp: sample.timestamp,
      })),
      savedAt: row.saved_at,
      sourceFileName: row.source_file_name ?? undefined,
      status: row.patient_name && row.gender && row.age && row.case_history && row.description ? 'Completed' : 'Pending',
      testDate: row.test_date,
      testDuration: row.test_duration,
    };
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
