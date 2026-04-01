import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY = Buffer.from(config.encryption.key, 'hex'); // 32-byte hex key

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: iv:tag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext (iv:tag:ciphertext).
 */
export function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, encryptedB64] = ciphertext.split(':');
  if (!ivB64 || !tagB64 || !encryptedB64) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf-8') + decipher.final('utf-8');
}

/**
 * Encrypts a numeric amount (stored as string for precision).
 */
export function encryptAmount(amount: number): string {
  return encrypt(amount.toFixed(2));
}

/**
 * Decrypts and returns a numeric amount.
 */
export function decryptAmount(ciphertext: string): number {
  return parseFloat(decrypt(ciphertext));
}
