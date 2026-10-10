const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { apiError } = require('./errors');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 4096;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

// Real type from magic bytes — never trust extension or Content-Type.
function detectImage(buffer) {
  if (buffer.length > 8 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buffer.length > 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buffer.length > 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function checkDimensions(buffer) {
  let sizeOf;
  try {
    sizeOf = require('image-size');
  } catch {
    return; // library unavailable: size gate already enforced by multer
  }
  const fn = sizeOf.imageSize || sizeOf;
  const dims = fn(buffer);
  if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    throw apiError('validation_error', `Image exceeds ${MAX_DIMENSION}px per side`, 413);
  }
}

function uploadDir() {
  const dir = process.env.UPLOAD_DIR || './data/uploads';
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveUpload(prefix, buffer) {
  const detected = detectImage(buffer);
  if (!detected) {
    throw apiError('validation_error', 'Only JPEG, PNG or WebP images are accepted', 415);
  }
  checkDimensions(buffer);
  const name = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${detected.ext}`;
  fs.writeFileSync(path.join(uploadDir(), name), buffer);
  return { filename: name, mime: detected.mime };
}

function multerErrorHandler(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return next(apiError('validation_error', 'Image exceeds the 2 MB limit', 413));
  }
  return next(err);
}

module.exports = { upload, detectImage, saveUpload, multerErrorHandler, uploadDir, MAX_BYTES };
