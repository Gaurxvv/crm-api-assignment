const router = require('express').Router();
const { register, login } = require('../controllers/authController');

/**
 * Authentication Routes (Public)
 */

// POST /api/auth/register - Register a new counselor account
router.post('/register', register);

// POST /api/auth/login - Authenticate counselor and receive JWT token
router.post('/login', login);

module.exports = router;
