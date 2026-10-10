const express = require('express');
const cors = require('cors');
const { errorHandler, notFound } = require('./lib/errors');
const { requireAuth, requireRole } = require('./middleware/auth');
const { buildAuthRoutes } = require('./routes/auth');
const { buildOwnerPetRoutes } = require('./routes/owners-pets');
const { buildAppointmentRoutes } = require('./routes/appointments');
const { buildClinicalRoutes } = require('./routes/clinical');
const { buildCatalogRoutes } = require('./routes/catalog');
const { buildInvoiceRoutes } = require('./routes/invoices');
const { buildProfileRoutes } = require('./routes/profile');
const { buildNotifyRoutes } = require('./routes/notify');
const { buildAvailabilityRoutes } = require('./routes/availability');

function createApp(db, options = {}) {
  const app = express();
  // The web panel (Vite :5173) and the API (:3001) are different origins
  // in local dev, so cross-origin requests must be allowed explicitly.
  // Restrict CORS_ORIGIN in production to the real panel URL.
  app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use('/auth', buildAuthRoutes(db, options));
  const api = express.Router();
  api.use(buildOwnerPetRoutes(db));
  api.use(buildAppointmentRoutes(db));
  api.use(buildClinicalRoutes(db));
  api.use(buildCatalogRoutes(db));
  api.use(buildInvoiceRoutes(db));
  api.use(buildProfileRoutes(db));
  api.use(buildNotifyRoutes(db));
  api.use(buildAvailabilityRoutes(db));

  // Dashboard KPIs computed from REAL system data (no fixtures).
  api.get(
    '/dashboard',
    requireAuth,
    requireRole('admin', 'vet', 'staff'),
    (req, res, next) => {
      try {
        const revenue = req.app.get('db')
          .prepare("SELECT COALESCE(SUM(total_cents), 0) AS total FROM invoices WHERE status IN ('issued','paid')")
          .get();
        const attended = req.app.get('db')
          .prepare("SELECT COUNT(*) AS n FROM appointments WHERE status = 'done'")
          .get();
        const pending = req.app.get('db')
          .prepare("SELECT COUNT(*) AS n FROM appointments WHERE status IN ('scheduled','checked_in')")
          .get();
        const perVet = req.app.get('db')
          .prepare(
            `SELECT u.id, u.display_name,
                    SUM(CASE WHEN a.status = 'done' THEN 1 ELSE 0 END) AS attended,
                    SUM(CASE WHEN a.status IN ('scheduled','checked_in') THEN 1 ELSE 0 END) AS pending
             FROM users u LEFT JOIN appointments a ON a.vet_user_id = u.id
             WHERE u.role IN ('vet','admin') GROUP BY u.id ORDER BY u.display_name`,
          )
          .all();
        res.json({
          revenue_cents: revenue.total,
          attended: attended.n,
          pending: pending.n,
          staff_performance: perVet,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  app.use('/', api);
  app.use(notFound);
  app.use(errorHandler);
  app.set('db', db);
  return app;
}

module.exports = { createApp };
