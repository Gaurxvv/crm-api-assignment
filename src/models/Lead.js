const mongoose = require('mongoose');

/**
 * Lead Schema (Prospective Client Enquiry)
 *
 * Lifecycle:
 * 1. Created via public enquiry form without authentication.
 * 2. Starts as PUBLIC with `claimedBy: null`. Visible to all logged-in counselors.
 * 3. A counselor claims the lead atomically:
 *    - `claimedBy` is set to the counselor's User ObjectId.
 *    - `claimedAt` is set to the timestamp of the claim.
 * 4. Once claimed, the lead becomes PRIVATE to that counselor and disappears
 *    from the unclaimed leads list.
 */
const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Prospective client name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Prospective client email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    courseInterest: {
      type: String,
      required: [true, 'Course of interest is required'],
      trim: true,
    },
    message: {
      type: String,
      trim: true,
    },
    // null => public (unclaimed). When populated => private to that counselor.
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

module.exports = mongoose.model('Lead', leadSchema);
