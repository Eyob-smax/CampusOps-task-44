import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { uploadEvidenceImage, addTextEvidence } from './evidence.service';
import type { CropRect } from './evidence.service';

// ---- Multer configuration (memory storage) ----

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG images are allowed'));
    }
  },
});

export const multerSingleImage = upload.single('file');

// ---- Handlers ----

export async function uploadEvidenceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: ticketId } = req.params;
    const actorId          = (req as any).user?.id ?? 'system';

    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded', code: 'NO_FILE' });
      return;
    }

    let cropRect: CropRect | undefined;
    if (req.body.cropRect) {
      try {
        cropRect = typeof req.body.cropRect === 'string'
          ? JSON.parse(req.body.cropRect)
          : req.body.cropRect;
      } catch {
        res.status(400).json({ success: false, error: 'Invalid cropRect format', code: 'INVALID_CROP_RECT' });
        return;
      }
    }

    const evidence = await uploadEvidenceImage(
      ticketId,
      req.file.buffer,
      req.file.mimetype,
      actorId,
      cropRect,
      req.user,
    );

    res.status(201).json({ success: true, data: evidence });
  } catch (err) {
    next(err);
  }
}

export async function addTextNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { id: ticketId } = req.params;
    const actorId          = (req as any).user?.id ?? 'system';
    const { note }         = req.body as { note?: string };

    if (!note || note.trim().length === 0) {
      res.status(400).json({ success: false, error: 'note is required', code: 'MISSING_NOTE' });
      return;
    }

    const evidence = await addTextEvidence(ticketId, note.trim(), actorId, req.user);
    res.status(201).json({ success: true, data: evidence });
  } catch (err) {
    next(err);
  }
}
