const express = require('express');
const { validate } = require('../lib/validate');
const { apiError } = require('../lib/errors');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadPDF, saveUploadPDF, multerErrorHandler } = require('../lib/uploads');
const { serveUpload } = require('./profile');
const { audit } = require('../lib/audit');

function consultationPetId(db, consultationId) {
  const row = db.prepare('SELECT pet_id FROM consultations WHERE id = ?').get(consultationId);
  return row ? row.pet_id : null;
}

function assertPetAccess(db, user, petId) {
  const { petVisibleTo } = require('./owners-pets');
  const pet = petVisibleTo(db, petId, user);
  if (pet === null) throw apiError('not_found', 'Consultation not found', 404);
  if (pet === undefined) throw apiError('forbidden', 'Not your pet', 403);
}

function buildExamRoutes(db) {
  const router = express.Router();
  router.use(requireAuth);

  // Lab PDFs are attached by staff and delivered to the owner: list and
  // download are owner-scoped, upload is staff-only.
  router.post(
    '/consultations/:id/exams',
    requireRole('admin', 'vet', 'staff'),
    uploadPDF.single('exam'),
    multerErrorHandler,
    (req, res, next) => {
      try {
        const consultationId = Number(req.params.id);
        const petId = consultationPetId(db, consultationId);
        if (!petId) throw apiError('not_found', 'Consultation not found', 404);
        if (!req.file) throw apiError('validation_error', 'Missing exam file (field: exam, PDF only)', 400);
        const saved = saveUploadPDF(`exam-${consultationId}`, req.file.buffer);
        const created = db
          .prepare(
            'INSERT INTO consultation_attachments (consultation_id, filename, mime, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?)',
          )
          .run(consultationId, saved.filename, saved.mime, req.file.buffer.length, req.user.sub);
        audit(db, { actor: req.user.sub, action: 'exam.upload', targetType: 'consultation', targetId: consultationId });
        res.status(201).json({ exam: { id: Number(created.lastInsertRowid), filename: saved.filename } });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get('/consultations/:id/exams', (req, res, next) => {
    try {
      const consultationId = Number(req.params.id);
      const petId = consultationPetId(db, consultationId);
      if (!petId) throw apiError('not_found', 'Consultation not found', 404);
      assertPetAccess(db, req.user, petId);
      const rows = db
        .prepare('SELECT id, filename, mime, size_bytes, created_at FROM consultation_attachments WHERE consultation_id = ? ORDER BY id')
        .all(consultationId);
      res.json({ exams: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get('/consultations/:cid/exams/:id', (req, res, next) => {
    try {
      const consultationId = Number(req.params.cid);
      const petId = consultationPetId(db, consultationId);
      if (!petId) throw apiError('not_found', 'Consultation not found', 404);
      assertPetAccess(db, req.user, petId);
      const row = db
        .prepare('SELECT filename FROM consultation_attachments WHERE id = ? AND consultation_id = ?')
        .get(Number(req.params.id), consultationId);
      if (!row) throw apiError('not_found', 'Exam not found', 404);
      return serveUpload(res, row.filename, next);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildExamRoutes };
