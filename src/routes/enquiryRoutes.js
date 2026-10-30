const router = require('express').Router();
const { createEnquiry } = require('../controllers/leadController');

/**
 * Public Enquiry Routes
 *
 * Open endpoint for prospective clients submitting an inquiry.
 * Requires NO authentication.
 */

// POST /api/enquiries - Submit a new prospective client enquiry (Public)
router.post('/', createEnquiry);

module.exports = router;
