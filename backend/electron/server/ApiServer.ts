import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createToken, verifyPassword, verifyToken } from './Auth';
import {
  MedilogixDatabase,
  type DoctorRecord,
  type PatientTestInput,
  type PatientTestMetadataInput,
  type RegisterDoctorInput,
} from './Database';

interface RequestContext {
  body: unknown;
  doctor: DoctorRecord | null;
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
}

const allowedGenders = new Set(['Female', 'Male', 'Other']);
const allowedLogoTypes = new Set(['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']);
const maxBodyBytes = 25 * 1024 * 1024;
const maxLogoBytes = 1024 * 1024;

function getAllowedOrigins() {
  return new Set(
    (process.env.MEDILOGIX_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export class MedilogixApiServer {
  private database: MedilogixDatabase;
  private server: http.Server;
  private baseUrl = '';

  constructor() {
    this.database = new MedilogixDatabase();
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
  }

  async start() {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    const host = process.env.MEDILOGIX_API_HOST || '127.0.0.1';
    const advertisedHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    const port = Number(process.env.MEDILOGIX_API_PORT ?? process.env.PORT ?? 3417);

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        const address = this.server.address() as AddressInfo;
        this.baseUrl = `http://${advertisedHost}:${address.port}/api`;
        resolve();
      });
    });

    void this.database.initialize().catch((error: unknown) => {
      console.error('[MediLogiX] Database initialization failed', error);
    });

    return this.baseUrl;
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async stop() {
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
    this.database.close();
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (!this.setBaseHeaders(request, response)) {
      this.sendJson(response, 403, { message: 'Origin is not allowed' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');

      if (!url.pathname.startsWith('/api/')) {
        this.sendJson(response, 404, { message: 'Route not found' });
        return;
      }

      const context: RequestContext = {
        body: ['POST', 'PUT', 'PATCH'].includes(request.method ?? '') ? await this.readJsonBody(request) : null,
        doctor: null,
        request,
        response,
        url,
      };

      await this.route(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected API error';
      const status = message === 'Request body is too large' || message === 'Invalid JSON body' ? 400 : 500;
      this.sendJson(response, status, { message });
    }
  }

  private async route(context: RequestContext) {
    const { request, response, url } = context;
    const method = request.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/api/health') {
      this.sendJson(response, 200, { ok: true });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/login') {
      await this.login(context);
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/register') {
      await this.register(context);
      return;
    }

    context.doctor = await this.authenticate(request);

    if (!context.doctor) {
      this.sendJson(response, 401, { message: 'Authentication required' });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/me') {
      this.sendJson(response, 200, { doctor: context.doctor });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/auth/change-password') {
      await this.changePassword(context);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/patient-tests') {
      this.sendJson(response, 200, { records: await this.database.listPatientTests(context.doctor.id) });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/patient-tests') {
      await this.createPatientTest(context);
      return;
    }

    const recordMatch = url.pathname.match(/^\/api\/patient-tests\/([^/]+)$/);

    if (method === 'GET' && recordMatch) {
      let record;

      try {
        record = await this.database.getPatientTest(decodeURIComponent(recordMatch[1]), context.doctor.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Analysis could not be loaded';
        const status = message.includes('missing') || message.includes('not available') ? 404 : 422;
        this.sendJson(response, status, { message });
        return;
      }

      if (!record) {
        this.sendJson(response, 404, { message: 'Record not found' });
        return;
      }

      this.sendJson(response, 200, { record });
      return;
    }

    if (method === 'PATCH' && recordMatch) {
      await this.updatePatientTest(context, decodeURIComponent(recordMatch[1]));
      return;
    }

    this.sendJson(response, 404, { message: 'Route not found' });
  }

  private async login(context: RequestContext) {
    const { response } = context;
    const body = context.body as { email?: unknown; gmail?: unknown; password?: unknown } | null;
    const emailValue = typeof body?.gmail === 'string' ? body.gmail : body?.email;
    const email = typeof emailValue === 'string' ? emailValue.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!email || !password) {
      this.sendJson(response, 400, { message: 'Gmail and password are required' });
      return;
    }

    const doctor = await this.database.findDoctorByEmail(email);

    if (!doctor || !verifyPassword(password, doctor.passwordSalt, doctor.passwordHash)) {
      this.sendJson(response, 401, { message: 'Invalid Gmail or password' });
      return;
    }

    const publicDoctor = await this.database.getDoctorById(doctor.id);

    if (!publicDoctor) {
      this.sendJson(response, 401, { message: 'Invalid Gmail or password' });
      return;
    }

    this.sendJson(response, 200, {
      doctor: publicDoctor,
      token: createToken(this.database.getTokenSecret(), publicDoctor),
    });
  }

  private async register(context: RequestContext) {
    const { response } = context;
    const validation = this.validateRegistration(context.body);

    if (!validation.ok) {
      this.sendJson(response, 422, { message: validation.message });
      return;
    }

    try {
      const doctor = await this.database.createDoctor(validation.value);
      this.sendJson(response, 201, { doctor });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      this.sendJson(response, message.includes('already exists') ? 409 : 500, { message });
    }
  }

  private async changePassword(context: RequestContext) {
    const { doctor, response } = context;
    const body = context.body as { currentPassword?: unknown; newPassword?: unknown } | null;
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!doctor) {
      this.sendJson(response, 401, { message: 'Authentication required' });
      return;
    }

    if (!currentPassword || newPassword.length < 8) {
      this.sendJson(response, 422, { message: 'Enter your current password and a new password with at least 8 characters' });
      return;
    }

    try {
      await this.database.changeDoctorPassword(doctor.id, currentPassword, newPassword);
      this.sendJson(response, 200, { message: 'Password updated successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password could not be updated';
      this.sendJson(response, message === 'Current password is incorrect' ? 401 : 500, { message });
    }
  }

  private async createPatientTest(context: RequestContext) {
    const { doctor, response } = context;
    const validation = this.validatePatientTest(context.body);

    if (!doctor) {
      this.sendJson(response, 401, { message: 'Authentication required' });
      return;
    }

    if (!validation.ok) {
      this.sendJson(response, 422, { message: validation.message });
      return;
    }

    const record = await this.database.createPatientTest(doctor.id, validation.value);
    this.sendJson(response, 201, { record });
  }

  private async updatePatientTest(context: RequestContext, recordId: string) {
    const { doctor, response } = context;
    const validation = this.validatePatientMetadata(context.body);

    if (!doctor) {
      this.sendJson(response, 401, { message: 'Authentication required' });
      return;
    }

    if (!validation.ok) {
      this.sendJson(response, 422, { message: validation.message });
      return;
    }

    const record = await this.database.updatePatientTestMetadata(recordId, doctor.id, validation.value);

    if (!record) {
      this.sendJson(response, 404, { message: 'Record not found' });
      return;
    }

    this.sendJson(response, 200, { record });
  }

  private async authenticate(request: IncomingMessage) {
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      return null;
    }

    const token = header.slice('Bearer '.length).trim();
    const payload = verifyToken(this.database.getTokenSecret(), token);

    if (!payload) {
      return null;
    }

    return this.database.getDoctorById(payload.sub);
  }

  private validatePatientTest(body: unknown): { ok: true; value: PatientTestInput } | { message: string; ok: false } {
    const value = body as Partial<PatientTestInput> | null;

    if (!value || typeof value !== 'object') {
      return { ok: false, message: 'Patient test payload is required' };
    }

    const requiredTextFields: Array<keyof PatientTestInput> = [
      'age',
      'caseHistory',
      'description',
      'id',
      'importedAt',
      'patientName',
      'testDate',
      'testDuration',
    ];
    const missingField = requiredTextFields.find((field) => {
      const fieldValue = value[field];

      return typeof fieldValue !== 'string' || fieldValue.trim().length === 0;
    });

    if (missingField) {
      return { ok: false, message: `${missingField} is required before saving` };
    }

    if (typeof value.gender !== 'string' || !allowedGenders.has(value.gender)) {
      return { ok: false, message: 'gender is required before saving' };
    }

    if (!Number.isInteger(Number(value.age)) || Number(value.age) <= 0) {
      return { ok: false, message: 'age must be a positive number' };
    }

    const numericFields: Array<keyof PatientTestInput> = ['averagePsi', 'minimumPsi'];
    const invalidNumericField = numericFields.find((field) => typeof value[field] !== 'number' || !Number.isFinite(value[field]));

    if (invalidNumericField) {
      return { ok: false, message: `${invalidNumericField} is required before saving` };
    }

    if (!Array.isArray(value.samples) || value.samples.length === 0) {
      return { ok: false, message: 'samples are required before saving' };
    }

    const invalidSample = value.samples.find((sample) => {
      const timestamp = sample.timestamp ?? sample.time;

      return typeof timestamp !== 'string' || timestamp.trim().length === 0 || typeof sample.psi !== 'number' || !Number.isFinite(sample.psi);
    });

    if (invalidSample) {
      return { ok: false, message: 'Every sample must include a timestamp and PSI value' };
    }

    const age = value.age as string;
    const averagePsi = value.averagePsi as number;
    const caseHistory = value.caseHistory as string;
    const description = value.description as string;
    const id = value.id as string;
    const importedAt = value.importedAt as string;
    const minimumPsi = value.minimumPsi as number;
    const patientName = value.patientName as string;
    const testDate = value.testDate as string;
    const testDuration = value.testDuration as string;

    return {
      ok: true,
      value: {
        age: age.trim(),
        averagePsi,
        caseHistory: caseHistory.trim(),
        description: description.trim(),
        gender: value.gender,
        id: id.trim(),
        importedAt: importedAt.trim(),
        minimumPsi,
        originalTxtContent: typeof value.originalTxtContent === 'string' && value.originalTxtContent.trim() ? value.originalTxtContent : undefined,
        patientName: patientName.trim(),
        peakPsi: typeof value.peakPsi === 'number' && Number.isFinite(value.peakPsi) ? value.peakPsi : undefined,
        sampleCount: value.samples.length,
        samples: value.samples,
        sourceFileName: typeof value.sourceFileName === 'string' ? value.sourceFileName.trim() : undefined,
        testDate: testDate.trim(),
        testDuration: testDuration.trim(),
      },
    };
  }

  private validatePatientMetadata(body: unknown): { ok: true; value: PatientTestMetadataInput } | { message: string; ok: false } {
    const value = body as Partial<PatientTestMetadataInput> | null;

    if (!value || typeof value !== 'object') {
      return { ok: false, message: 'Patient metadata is required' };
    }

    const patientName = typeof value.patientName === 'string' ? value.patientName.trim() : '';
    const gender = typeof value.gender === 'string' ? value.gender : '';
    const age = typeof value.age === 'string' ? value.age.trim() : '';
    const caseHistory = typeof value.caseHistory === 'string' ? value.caseHistory.trim() : '';
    const description = typeof value.description === 'string' ? value.description.trim() : '';

    if (!patientName || !gender || !age || !caseHistory || !description) {
      return { ok: false, message: 'Complete every metadata field before saving' };
    }

    if (!allowedGenders.has(gender)) {
      return { ok: false, message: 'gender is required before saving' };
    }

    if (!Number.isInteger(Number(age)) || Number(age) <= 0) {
      return { ok: false, message: 'age must be a positive number' };
    }

    return {
      ok: true,
      value: {
        age,
        caseHistory,
        description,
        gender: gender as PatientTestMetadataInput['gender'],
        patientName,
      },
    };
  }

  private validateRegistration(body: unknown): { ok: true; value: RegisterDoctorInput } | { message: string; ok: false } {
    const value = body as Partial<RegisterDoctorInput> | null;

    if (!value || typeof value !== 'object') {
      return { ok: false, message: 'Registration details are required' };
    }

    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const phoneNumber = typeof value.phoneNumber === 'string' ? value.phoneNumber.trim() : '';
    const serialNumber = typeof value.serialNumber === 'string' ? value.serialNumber.trim().toUpperCase() : '';
    const gmail = typeof value.gmail === 'string' ? value.gmail.trim().toLowerCase() : '';
    const hospitalLogo = typeof value.hospitalLogo === 'object' && value.hospitalLogo ? value.hospitalLogo : null;
    const password = typeof value.password === 'string' ? value.password : '';

    if (!name || !phoneNumber || !serialNumber || !gmail || !password || !hospitalLogo) {
      return { ok: false, message: 'Complete every sign-up field' };
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(gmail)) {
      return { ok: false, message: 'Enter a valid Gmail address' };
    }

    if (!/^(?=.*[A-Z])(?=.*\d)[A-Z0-9]+$/i.test(serialNumber)) {
      return { ok: false, message: 'Serial number must contain letters and numbers' };
    }

    if (password.length < 8) {
      return { ok: false, message: 'Password must be at least 8 characters' };
    }

    const logo = hospitalLogo as Partial<RegisterDoctorInput['hospitalLogo']>;
    const logoBase64 = typeof logo.base64 === 'string' ? logo.base64 : '';
    const logoFileName = typeof logo.fileName === 'string' ? logo.fileName.trim() : '';
    const logoMimeType = typeof logo.mimeType === 'string' ? logo.mimeType.trim() : '';

    if (!logoBase64 || !logoFileName || !allowedLogoTypes.has(logoMimeType)) {
      return { ok: false, message: 'Hospital logo must be PNG, JPG, WEBP, or SVG' };
    }

    const logoBytes = Buffer.byteLength(logoBase64, 'base64');

    if (logoBytes === 0 || logoBytes > maxLogoBytes) {
      return { ok: false, message: 'Hospital logo must be 1 MB or smaller' };
    }

    return {
      ok: true,
      value: {
        gmail,
        hospitalLogo: {
          base64: logoBase64,
          fileName: logoFileName,
          mimeType: logoMimeType,
        },
        name,
        password,
        phoneNumber,
        serialNumber,
      },
    };
  }

  private readJsonBody(request: IncomingMessage) {
    return new Promise<unknown>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      request.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;

        if (totalBytes > maxBodyBytes) {
          reject(new Error('Request body is too large'));
          request.destroy();
          return;
        }

        chunks.push(chunk);
      });

      request.on('end', () => {
        if (chunks.length === 0) {
          resolve(null);
          return;
        }

        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      request.on('error', reject);
    });
  }

  private setBaseHeaders(request: IncomingMessage, response: ServerResponse) {
    const origin = request.headers.origin;

    if (origin) {
      const configuredOrigins = getAllowedOrigins();
      const isAllowedOrigin =
        configuredOrigins.has(origin) ||
        origin === 'null' ||
        origin.startsWith('file://') ||
        origin.startsWith('http://127.0.0.1:') ||
        origin.startsWith('http://localhost:');

      if (!isAllowedOrigin) {
        return false;
      }

      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }

    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
    response.setHeader('Access-Control-Max-Age', '86400');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    return true;
  }

  private sendJson(response: ServerResponse, status: number, payload: unknown) {
    if (response.writableEnded) {
      return;
    }

    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
  }
}
