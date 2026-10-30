const mongoose = require('mongoose');
const Lead = require('../models/Lead');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/enquiries
 *
 * Public enquiry intake form.
 * Rules:
 * - NO AUTHENTICATION REQUIRED (accessible by prospective clients).
 * - Field whitelisting: Only approved fields (name, email, courseInterest, phone, message)
 *   are extracted. Clients cannot inject `claimedBy` or `claimedAt`.
 * - Validates required fields and email format.
 * - Created with default `claimedBy: null` (public status).
 * - Returns 201 Created with the created lead.
 */
exports.createEnquiry = async (req, res, next) => {
  try {
    const { name, email, phone, courseInterest, message } = req.body || {};

    if (!name || !email || !courseInterest) {
      return res.status(400).json({
        success: false,
        message: 'name, email and courseInterest are required',
      });
    }

    const trimmedName = String(name).trim();
    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedCourse = String(courseInterest).trim();

    if (!trimmedName || !trimmedCourse) {
      return res.status(400).json({
        success: false,
        message: 'name and courseInterest cannot be empty',
      });
    }

    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
      });
    }

    // Whitelist approved fields only
    const lead = await Lead.create({
      name: trimmedName,
      email: normalizedEmail,
      courseInterest: trimmedCourse,
      phone: phone ? String(phone).trim() : undefined,
      message: message ? String(message).trim() : undefined,
    });

    res.status(201).json({
      success: true,
      message: 'Enquiry submitted successfully',
      data: lead,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leads/unclaimed
 *
 * List unclaimed (public) leads.
 * Rules:
 * - Requires counselor JWT authentication.
 * - Only leads where `claimedBy: null`.
 * - Sorted newest first (`createdAt: -1`).
 * - Supports pagination with `?page=&limit=`.
 * - Max limit is capped at 100 to prevent excessive payloads.
 */
exports.getUnclaimed = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const filter = { claimedBy: null };
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/leads/:id/claim
 *
 * Claim a lead.
 * Rules:
 * - Requires counselor JWT authentication.
 * - Atomic execution: Prevents race conditions when multiple counselors claim concurrently.
 *   Uses a single atomic findOneAndUpdate with `{ _id: id, claimedBy: null }`.
 * - If ID is not a valid MongoDB ObjectId: returns 400 Bad Request.
 * - If lead is updated: returns 200 OK with the updated lead document.
 * - If lead was already claimed by another counselor: returns 409 Conflict.
 * - If lead does not exist in the database: returns 404 Not Found.
 */
exports.claimLead = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid lead id',
      });
    }

    // Atomic conditional update: matches only if lead exists AND is still unclaimed.
    const lead = await Lead.findOneAndUpdate(
      { _id: id, claimedBy: null },
      { claimedBy: req.user._id, claimedAt: new Date() },
      { new: true }
    );

    if (!lead) {
      // Disambiguate between non-existent lead vs already claimed lead
      const exists = await Lead.exists({ _id: id });
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: 'Lead not found',
        });
      }
      return res.status(409).json({
        success: false,
        message: 'Lead already claimed',
      });
    }

    res.json({
      success: true,
      message: 'Lead claimed successfully',
      data: lead,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/leads/my
 *
 * List leads claimed by the logged-in counselor.
 * Rules:
 * - Requires counselor JWT authentication.
 * - Only leads where `claimedBy` equals `req.user._id`.
 * - Sorted newest claimed first (`claimedAt: -1`).
 * - Supports pagination with `?page=&limit=` (limit capped at 100).
 */
exports.getMyLeads = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const filter = { claimedBy: req.user._id };
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .sort({ claimedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lead.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
};
