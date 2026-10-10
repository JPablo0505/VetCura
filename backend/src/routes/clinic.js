const express = require('express');
const { requireAuth } = require('../middleware/auth');

// Header data printed on formal receipts. From env (no secrets);
// Colombian defaults so the receipt reads correctly out of the box.
function clinicInfo() {
  return {
    name: process.env.CLINIC_NAME || 'Veterinaria VetCura',
    nit: process.env.CLINIC_NIT || '900.123.456-7',
    address: process.env.CLINIC_ADDRESS || 'Calle 10 # 43-28',
    city: process.env.CLINIC_CITY || 'Medellín, Colombia',
  };
}

function buildClinicRoutes() {
  const router = express.Router();
  router.use(requireAuth);
  router.get('/clinic', (req, res) => {
    res.json({ clinic: clinicInfo() });
  });
  return router;
}

module.exports = { buildClinicRoutes, clinicInfo };
