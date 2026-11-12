import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import env from '../../config/env.js';
import ApiError from '../../utils/ApiError.js';
import { FILE_TYPES, SUPPORTED_EXTENSIONS, sanitizeFilename } from '../../processing/fileTypes.js';

/** Multipart filenames often arrive as UTF-8 bytes read as latin1; repair those, leave others alone. */
function decodeFilename(name = '') {
  if (![...name].every((c) => c.charCodeAt(0) <= 0xff) || !/[\u0080-ÿ]/.test(name)) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('�') ? name : fixed;
}
import { TMP_DIR, readHead, removeFile } from '../../processing/storage.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: TMP_DIR,
    filename: (_req, _file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}.upload`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 12 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const spec = FILE_TYPES[ext];
    if (!spec) {
      return cb(new ApiError(415, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`, 'UNSUPPORTED_FILE_TYPE'));
    }
    if (!spec.mimes.includes((file.mimetype || '').toLowerCase())) {
      return cb(new ApiError(415, `The file's type (${file.mimetype}) does not match its ${ext} extension.`, 'MIME_MISMATCH'));
    }
    cb(null, true);
  },
});

/**
 * Accepts a single `file` field, then verifies the file's signature (magic bytes / text encoding)
 * so a renamed executable or binary can't slip through as ".pdf" or ".txt".
 * On success: req.upload = { tmpPath, originalName, extension, size, mimeType }.
 */
export function receiveUpload(req, res, next) {
  upload.single('file')(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') throw new ApiError(413, `Files must be ${env.MAX_UPLOAD_MB} MB or smaller.`, 'FILE_TOO_LARGE');
          throw ApiError.badRequest(`Upload rejected: ${err.message}`);
        }
        throw err;
      }
      if (!req.file) throw ApiError.badRequest('Choose a file to upload', { fields: { file: 'Choose a file to upload' } });

      const extension = path.extname(req.file.originalname).toLowerCase();
      const spec = FILE_TYPES[extension];
      if (req.file.size === 0) {
        await removeFile(req.file.path, { isKey: false });
        throw ApiError.badRequest('This file is empty.');
      }
      const head = await readHead(req.file.path);
      if (!spec.check(head)) {
        await removeFile(req.file.path, { isKey: false });
        throw new ApiError(415, `This file's contents don't look like a valid ${spec.label} file.`, 'CONTENT_MISMATCH');
      }
      req.upload = {
        tmpPath: req.file.path,
        originalName: sanitizeFilename(decodeFilename(req.file.originalname)),
        extension,
        size: req.file.size,
      };
      next();
    } catch (e) {
      if (req.file?.path) await removeFile(req.file.path, { isKey: false });
      next(e);
    }
  });
}
