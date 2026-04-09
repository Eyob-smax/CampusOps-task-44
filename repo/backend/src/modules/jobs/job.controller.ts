import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { listJobs, getJobById, updateJobRecord } from './job.service';
import { importQueue } from '../../jobs/index';
import { config } from '../../config';

export async function getJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listJobs({
      queueName: req.query['queue']    as string | undefined,
      status:    req.query['status']   as string | undefined as any,
      actorId:   req.query['actorId']  as string | undefined,
      campusId:  req.user?.campusId,
      from:      req.query['from'] ? new Date(req.query['from'] as string) : undefined,
      to:        req.query['to']   ? new Date(req.query['to']   as string) : undefined,
      page:      req.query['page']  ? Number(req.query['page'])  : undefined,
      limit:     req.query['limit'] ? Number(req.query['limit']) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await getJobById(req.params.id);
    if (!job) { res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' }); return; }
    if (job.campusId && req.user?.campusId && job.campusId !== req.user.campusId) {
      res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
}

export async function downloadErrorReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await getJobById(req.params.id);
    if (!job) { res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' }); return; }
    if (job.campusId && req.user?.campusId && job.campusId !== req.user.campusId) {
      res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' });
      return;
    }
    if (!job.hasErrorReport || !job.result?.['errorReportPath']) {
      res.status(404).json({ success: false, error: 'No error report available for this job', code: 'NOT_FOUND' });
      return;
    }
    const reportPath = job.result['errorReportPath'] as string;
    if (!fs.existsSync(reportPath)) {
      res.status(404).json({ success: false, error: 'Error report file not found on disk', code: 'NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="error-report-${job.id}.csv"`);
    fs.createReadStream(reportPath).pipe(res);
  } catch (err) { next(err); }
}

export async function retryJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const job = await getJobById(req.params.id);
    if (!job) { res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' }); return; }
    if (job.campusId && req.user?.campusId && job.campusId !== req.user.campusId) {
      res.status(404).json({ success: false, error: 'Job not found', code: 'NOT_FOUND' });
      return;
    }

    if (job.status !== 'failed') {
      res.status(400).json({ success: false, error: 'Only failed jobs can be retried', code: 'INVALID_STATE' });
      return;
    }

    // Verify the file still exists on disk to retry
    const importsDir = path.join(config.storage.path, 'imports');
    const ext        = job.inputFilename ? path.extname(job.inputFilename) : '.xlsx';
    const filePath   = path.join(importsDir, `${job.id}${ext}`);

    if (!fs.existsSync(filePath)) {
      res.status(409).json({ success: false, error: 'Source file no longer available — re-upload required', code: 'FILE_EXPIRED' });
      return;
    }

    // Re-enqueue
    const bullJob = await importQueue.add('student-import', {
      jobRecordId: job.id,
      filePath,
      actorId: req.user!.id,
      campusId: job.campusId ?? req.user!.campusId,
    });

    await updateJobRecord(job.id, {
      status:    'waiting',
      progress:  0,
      errorMsg:  undefined,
      bullJobId: String(bullJob.id),
      attempts:  (job.attempts ?? 0) + 1,
    });

    const updated = await getJobById(job.id);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}
