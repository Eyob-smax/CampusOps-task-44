import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function resolveFirstExistingPath(candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Schema file not found. Tried:\n${candidates.join('\n')}`);
}

function resolveSchemaPaths(): { canonicalPath: string; mirrorPath: string } {
  const cwd = process.cwd();

  const canonicalPath = resolveFirstExistingPath([
    path.resolve(cwd, 'prisma/schema.prisma'),
    path.resolve(cwd, 'backend/prisma/schema.prisma'),
    path.resolve(__dirname, '../prisma/schema.prisma'),
  ]);

  const mirrorPath = resolveFirstExistingPath([
    path.resolve(cwd, 'database/schema.prisma'),
    path.resolve(cwd, 'backend/database/schema.prisma'),
    path.resolve(__dirname, '../database/schema.prisma'),
  ]);

  return { canonicalPath, mirrorPath };
}

describe('Prisma schema synchronization', () => {
  it('keeps database/schema.prisma identical to prisma/schema.prisma', () => {
    const { canonicalPath, mirrorPath } = resolveSchemaPaths();

    const canonical = normalize(fs.readFileSync(canonicalPath, 'utf8'));
    const mirror = normalize(fs.readFileSync(mirrorPath, 'utf8'));

    expect(mirror).toBe(canonical);
  });
});
