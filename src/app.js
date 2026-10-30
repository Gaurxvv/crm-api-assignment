const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');

const app = express();

// Security middleware: sets HTTP headers for enhanced security
app.use(helmet());

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse incoming JSON request bodies (capped at 100kb)
app.use(express.json({ limit: '100kb' }));

// Health check endpoint
app.get('/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/enquiries', enquiryRoutes); // Public enquiry intake
app.use('/api/leads', leadRoutes);        // Counselor-authenticated leads management

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

/**
 * Central Error Handler
 * 
 * Intercepts uncaught exceptions and errors:
 * - 400 for malformed JSON bodies or Mongoose validation errors
 * - 409 for duplicate unique key violations (e.g. duplicate email)
 * - 500 for unexpected internal server errors
 */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (
    err.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && err.status === 400 && 'body' in err)
  ) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value already exists' });
  }
  console.error('[Error Handler]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;
