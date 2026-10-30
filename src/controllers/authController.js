const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generate a signed JWT token for the user.
 *
 * @param {Object} user - The user mongoose document
 * @returns {string} Signed JWT token
 */
const signToken = (user) =>
  jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET || 'crm_jwt_default_secret_dev_key',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );

/**
 * POST /api/auth/register
 * 
 * Register a new counselor.
 * Rules:
 * - Validates name, email, and password.
 * - Enforces minimum 6 characters for password.
 * - Lowercases and validates email format.
 * - Rejects duplicates with 409 Conflict.
 * - Password is encrypted with bcrypt (10 rounds).
 * - Returns 201 with JWT token and user info (password is NEVER returned).
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    if (!name || !email || !password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'name, email and password are required',
      });
    }

    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();

    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        message: 'name cannot be empty',
      });
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters',
      });
    }

    // Check if email is already in use
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered',
      });
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: 'Registered successfully',
      data: {
        token: signToken(user),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * 
 * Login an existing counselor.
 * Rules:
 * - Validates presence of email and password.
 * - Compares password hash via bcrypt.
 * - Returns 401 with a generic error message on invalid credentials.
 * - Returns 200 with JWT token and user details on success.
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email and password are required',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Include '+password' because userSchema sets select: false by default
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    const isValid = user && (await bcrypt.compare(String(password), user.password));

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: signToken(user),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};
