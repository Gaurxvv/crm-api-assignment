const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  getUnclaimed,
  claimLead,
  getMyLeads,
} = require('../controllers/leadController');

/**
 * Lead Routes
 * 
 * IMPORTANT: Static routes (`/unclaimed` and `/my`) must be declared before
 * parameterized routes (`/:id/claim`) to prevent Express router collision.
 */

// GET /api/leads/unclaimed - List public (unclaimed) leads (Protected)
router.get('/unclaimed', auth, getUnclaimed);

// GET /api/leads/my - List leads claimed by the logged-in counselor (Protected)
router.get('/my', auth, getMyLeads);

// POST /api/leads/:id/claim - Atomically claim a lead (Protected)
router.post('/:id/claim', auth, claimLead);

module.exports = router;
