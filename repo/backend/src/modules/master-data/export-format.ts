import * as XLSX from 'xlsx';

export type MasterDataExportFormat = 'csv' | 'xlsx';

export function resolveMasterDataExportFormat(raw: unknown): MasterDataExportFormat | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null || value === '') {
    return 'csv';
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'csv' || normalized === 'xlsx') {
    return normalized;
  }

  return null;
}

export function csvToXlsxBuffer(csv: string): Buffer {
  const workbook = XLSX.read(csv, { type: 'string' });
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
