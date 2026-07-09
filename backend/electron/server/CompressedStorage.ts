import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function normalizeStoragePath(storagePath: string) {
  const normalizedPath = storagePath.replace(/^\/+/, '');

  if (!normalizedPath || normalizedPath.includes('..') || normalizedPath.includes('\\')) {
    throw new Error('Invalid Supabase Storage path');
  }

  return normalizedPath;
}

export async function compressBuffer(input: Buffer | string) {
  return gzipAsync(Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'));
}

export async function decompressBuffer(input: Buffer) {
  return gunzipAsync(input);
}

export interface SupabaseStorageOptions {
  anonKey: string;
  bucketName: string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

export class SupabaseCompressedStorage {
  private anonKey: string;
  private bucketName: string;
  private serviceRoleKey: string;
  private supabaseUrl: string;

  constructor(options: SupabaseStorageOptions) {
    this.anonKey = options.anonKey;
    this.bucketName = options.bucketName;
    this.serviceRoleKey = options.serviceRoleKey;
    this.supabaseUrl = options.supabaseUrl.replace(/\/$/, '');
  }

  async uploadCompressedFile(storagePath: string, compressedBuffer: Buffer) {
    const normalizedPath = normalizeStoragePath(storagePath);
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${normalizedPath}`, {
      body: new Uint8Array(compressedBuffer),
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/gzip',
        'x-upsert': 'true',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Compressed TXT upload failed: ${response.status} ${details}`);
    }

    return normalizedPath;
  }

  async downloadCompressedFile(storagePath: string) {
    const normalizedPath = normalizeStoragePath(storagePath);
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${normalizedPath}`, {
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      method: 'GET',
    });

    if (!response.ok) {
      const details = await response.text();
      const reason = response.status === 404 ? 'Compressed TXT file is missing' : `Compressed TXT download failed: ${response.status} ${details}`;
      throw new Error(reason);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async deleteCompressedFile(storagePath: string) {
    const normalizedPath = normalizeStoragePath(storagePath);
    const response = await fetch(`${this.supabaseUrl}/storage/v1/object/${this.bucketName}/${normalizedPath}`, {
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
      },
      method: 'DELETE',
    });

    if (!response.ok && response.status !== 404) {
      const details = await response.text();
      throw new Error(`Compressed TXT cleanup failed: ${response.status} ${details}`);
    }
  }
}
