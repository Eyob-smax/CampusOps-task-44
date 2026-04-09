import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { logger } from '../../lib/logger';
import type { AuthenticatedUser } from '../../types';

// ---- Magic bytes for JPEG and PNG ----

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function checkMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.subarray(0, 3).equals(JPEG_MAGIC);
  }
  if (mimeType === 'image/png') {
    return buffer.subarray(0, 4).equals(PNG_MAGIC);
  }
  return false;
}

// ---- Perceptual hash (average hash — 8x8 grayscale) ----

/**
 * Computes an average-hash (aHash) of an image buffer.
 * Steps:
 *   1. Resize to 8x8 grayscale
 *   2. Compute average pixel value
 *   3. Generate 64-bit binary string (1 if pixel >= avg, else 0)
 *   4. Convert binary string to hex
 */
export async function computePerceptualHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = Array.from(data);
  const avg    = pixels.reduce((a, b) => a + b, 0) / pixels.length;

  const bits = pixels.map(p => (p >= avg ? '1' : '0')).join('');

  // Convert 64-bit binary string to 16-char hex
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Computes Hamming distance between two hex hash strings.
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    const bitsA = parseInt(hashA[i]!, 16).toString(2).padStart(4, '0');
    const bitsB = parseInt(hashB[i]!, 16).toString(2).padStart(4, '0');
    for (let j = 0; j < 4; j++) {
      if (bitsA[j] !== bitsB[j]) dist++;
    }
  }
  return dist;
}

// ---- Duplicate detection ----

export function isHashWithinDuplicateThreshold(
  distance: number,
  threshold = config.perceptualHash.hammingDistanceThreshold,
): boolean {
  return distance <= threshold;
}

export async function checkDuplicate(ticketId: string, hash: string): Promise<boolean> {
  const existing = await prisma.ticketEvidence.findMany({
    where: {
      ticketId,
      type:     'photo',
      fileHash: { not: null },
    },
  });

  const threshold = config.perceptualHash.hammingDistanceThreshold;
  for (const ev of existing) {
    if (ev.fileHash && isHashWithinDuplicateThreshold(hammingDistance(hash, ev.fileHash), threshold)) {
      return true;
    }
  }
  return false;
}

// ---- Image upload pipeline ----

export interface CropRect {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

async function getScopedTicket(ticketId: string, requester?: AuthenticatedUser) {
  const where: Record<string, unknown> = { id: ticketId };
  if (requester?.campusId) {
    where.campusId = requester.campusId;
  }
  if (requester?.role === 'customer_service_agent') {
    where.createdById = requester.id;
  }

  return prisma.afterSalesTicket.findFirst({ where });
}

export async function uploadEvidenceImage(
  ticketId:  string,
  fileBuffer: Buffer,
  mimeType:  string,
  actorId:   string,
  cropRect?: CropRect,
  requester?: AuthenticatedUser,
) {
  // 1. Validate MIME type
  if (!['image/jpeg', 'image/png'].includes(mimeType)) {
    const err: any = new Error('Only JPEG and PNG images are allowed');
    err.status = 422;
    err.code   = 'INVALID_MIME_TYPE';
    throw err;
  }

  // 2. Validate magic bytes
  if (!checkMagicBytes(fileBuffer, mimeType)) {
    const err: any = new Error('File content does not match declared MIME type');
    err.status = 422;
    err.code   = 'INVALID_FILE_CONTENT';
    throw err;
  }

  // 3. Validate size (10 MB max)
  const maxSize = 10 * 1024 * 1024;
  if (fileBuffer.length > maxSize) {
    const err: any = new Error('File exceeds maximum size of 10 MB');
    err.status = 422;
    err.code   = 'FILE_TOO_LARGE';
    throw err;
  }

  // 4. Validate ticket exists
  const ticket = await getScopedTicket(ticketId, requester);
  if (!ticket) {
    const err: any = new Error('After-sales ticket not found');
    err.status = 404;
    err.code   = 'TICKET_NOT_FOUND';
    throw err;
  }

  // 5. Build sharp pipeline
  let pipeline = sharp(fileBuffer);

  // Apply optional crop
  if (cropRect) {
    pipeline = pipeline.extract({
      left:   Math.round(cropRect.x),
      top:    Math.round(cropRect.y),
      width:  Math.round(cropRect.width),
      height: Math.round(cropRect.height),
    });
  }

  // Resize to max 1920px (maintain aspect ratio), quality 80, always output JPEG
  pipeline = pipeline
    .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 });

  const processedBuffer = await pipeline.toBuffer();

  // 6. Compute perceptual hash
  const hash = await computePerceptualHash(processedBuffer);

  // 7. Duplicate detection
  const isDuplicate = await checkDuplicate(ticketId, hash);
  if (isDuplicate) {
    const err: any = new Error('Duplicate image detected (perceptual hash match)');
    err.status = 409;
    err.code   = 'DUPLICATE_EVIDENCE';
    throw err;
  }

  // 8. Persist file
  const uploadDir = path.resolve(config.storage.path, 'evidence');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `evidence_${ticketId}_${Date.now()}.jpg`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, processedBuffer);

  // 9. Save TicketEvidence record
  const evidence = await prisma.ticketEvidence.create({
    data: {
      ticketId,
      type:     'photo',
      filePath,
      fileHash: hash,
    },
  });

  logger.info({ msg: 'Evidence image uploaded', evidenceId: evidence.id, ticketId, actorId });
  return evidence;
}

// ---- Text evidence ----

export async function addTextEvidence(
  ticketId: string,
  note:     string,
  actorId:  string,
  requester?: AuthenticatedUser,
) {
  // Validate ticket exists
  const ticket = await getScopedTicket(ticketId, requester);
  if (!ticket) {
    const err: any = new Error('After-sales ticket not found');
    err.status = 404;
    err.code   = 'TICKET_NOT_FOUND';
    throw err;
  }

  const evidence = await prisma.ticketEvidence.create({
    data: {
      ticketId,
      type:     'text',
      textNote: note,
    },
  });

  logger.info({ msg: 'Text evidence added', evidenceId: evidence.id, ticketId, actorId });
  return evidence;
}
