const mongoose = require('mongoose');

/**
 * User Schema (Counselor Account)
 * 
 * - Each counselor has an account identified by a unique, lowercased email.
 * - Passwords are hashed with bcrypt before storing.
 * - `select: false` ensures password hash is omitted from default queries.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Never return password hash in regular queries
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
