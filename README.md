# crm-api-assignment

> **Production-ready Node.js REST API for Counselor CRM Lead Management**  
> Features JWT authentication, public client intake, atomic lead claiming (preventing race conditions), and role-based privacy.

[![Test Suite](https://img.shields.io/badge/tests-20%20passed-brightgreen.svg)](#running-the-verification-test-suite)
[![Node.js](https://img.shields.io/badge/node->=18.0.0-blue.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 📋 Overview & Business Rules

A specialized CRM designed for counseling and educational organizations:
1. **Counselor Accounts**: Counselors are identified by unique email addresses. Accounts are created and authenticated with bcrypt-hashed passwords and JWTs.
2. **Public Enquiry Intake**: Prospective clients submit enquiries through an open endpoint (`POST /api/enquiries`) with zero authentication required.
3. **Public Lead Pool**: Every submitted enquiry begins with `claimedBy: null`. All authenticated counselors can view unclaimed leads.
4. **Atomic Lead Claiming**: Counselors can claim an unclaimed lead. The claim operation is strictly atomic (`findOneAndUpdate`), guaranteeing that if multiple counselors attempt to claim the same lead simultaneously, only one succeeds and the other receives a `409 Conflict`.
5. **Private Ownership**: Once claimed, a lead is excluded from the unclaimed pool and is visible exclusively to the counselor who claimed it under `GET /api/leads/my`.

---

## 🛠️ Tech Stack & Architecture

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose (with automated in-memory MongoDB fallback)
- **Authentication**: JSON Web Tokens (`jsonwebtoken`)
- **Password Security**: `bcryptjs` (salt rounds: 10)
- **Security Middleware**: `helmet`, `cors`
- **Testing**: Jest + Supertest + `mongodb-memory-server`

---

## ⚡ Quick Start (Zero-Config)

This repository includes an automatic in-memory MongoDB engine. You can clone and run it immediately without needing a local MongoDB daemon installed.

### 1. Clone & Install
```bash
git clone https://github.com/your-username/crm-api-assignment.git
cd crm-api-assignment
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` values:
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/crm
JWT_SECRET=change_this_to_a_long_random_string
JWT_EXPIRES_IN=1d
```
> **Note**: If `MONGO_URI` is not set or set to `memory`, the application automatically spins up an in-memory MongoDB instance. If set to a MongoDB URI (e.g., Atlas or local `27017`), it connects directly.

### 3. Run the Server
```bash
# Production start
npm start

# Development with file watching
npm run dev
```
The server will start listening at: `http://localhost:5000`

---

## 🧪 Running the Verification Test Suite

A comprehensive test suite is included in `test/verification.test.js`, testing all 9 assignment checklist criteria and 11 edge cases:

```bash
npm test
```

### ✅ Assignment Checklist Tested:
1. `POST /api/auth/register`: Register user A, obtain JWT token (password never returned).
2. `POST /api/enquiries`: Public prospective enquiry submitted with no token succeeds (`201 Created`).
3. `GET /api/leads/unclaimed`: With counselor A's token, the new enquiry appears in the public pool.
4. `POST /api/leads/:id/claim`: Claimed by counselor A, returns `200 OK` with claimed lead object.
5. `GET /api/leads/unclaimed`: Retrying fetch shows lead has disappeared from the public pool.
6. `GET /api/leads/my`: Fetching counselor A's leads shows the claimed lead.
7. `POST /api/leads/:id/claim`: Register user B and attempt to claim the already claimed lead — returns `409 Conflict`.
8. Auth checks: Calling `/api/leads/unclaimed` and `/api/leads/my` with no token returns `401 Unauthorized`.
9. Concurrency test: Two simultaneous claims by counselors A and B fired concurrently (`Promise.all`). Exactly one succeeds (`200 OK`) and the other fails (`409 Conflict`).

---

## 📡 API Endpoints Reference

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Service health check |
| `POST` | `/api/auth/register` | No | Register counselor `{name, email, password}` |
| `POST` | `/api/auth/login` | No | Login counselor `{email, password}` |
| `POST` | `/api/enquiries` | **No** | Public intake form `{name, email, courseInterest, phone?, message?}` |
| `GET` | `/api/leads/unclaimed` | Bearer Token | View public unclaimed leads (`?page=1&limit=20`) |
| `POST` | `/api/leads/:id/claim` | Bearer Token | Atomically claim an unclaimed lead |
| `GET` | `/api/leads/my` | Bearer Token | View leads claimed by logged-in counselor |

---

## 💡 Key Design Decisions

### 1. Atomic Claiming (Race Condition Prevention)
A naive approach would perform two operations:
```javascript
// ❌ WRONG (Vulnerable to race conditions)
const lead = await Lead.findById(id);
if (lead.claimedBy === null) {
  lead.claimedBy = userId;
  await lead.save();
}
```
If two requests arrive at the same millisecond, both read `claimedBy === null` and both overwrite each other.

**Our Atomic Solution:**
```javascript
// ✅ ATOMIC CONDITIONAL UPDATE
const lead = await Lead.findOneAndUpdate(
  { _id: id, claimedBy: null },
  { claimedBy: req.user._id, claimedAt: new Date() },
  { new: true }
);

if (!lead) {
  const exists = await Lead.exists({ _id: id });
  if (!exists) return res.status(404).json({ success: false, message: 'Lead not found' });
  return res.status(409).json({ success: false, message: 'Lead already claimed' });
}
```
MongoDB executes `findOneAndUpdate` with document-level locking. Only the first incoming operation matches `{ claimedBy: null }` and mutates the document. The subsequent operation finds no matching document and returns `null`, cleanly triggering the `409 Conflict` response.

### 2. Whitelisting on Public Intake
To prevent malicious request body tampering (e.g. an attacker attempting to mark an enquiry as claimed during submission), the controller strictly extracts allowed attributes:
```javascript
const { name, email, phone, courseInterest, message } = req.body || {};
```
Any injected keys such as `claimedBy` or `claimedAt` are dropped before document creation.

### 3. Route Precedence
Static routes (`/unclaimed` and `/my`) are declared before parameterized routes (`/:id/claim`) in `leadRoutes.js` to prevent route collision.

---

## 📬 Postman Collection

A ready-to-import Postman collection is located at [`crm-postman-collection.json`](./crm-postman-collection.json).

### Features:
- Automatically captures the JWT `token` on **Register** and **Login**.
- Automatically saves `leadId` on **Submit Public Enquiry**.
- Makes testing all endpoints in sequence seamless with zero manual copy-pasting.

---

## 💻 cURL Examples

### 1. Register a Counselor
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Counselor",
    "email": "jane@counselors.com",
    "password": "password123"
  }'
```

### 2. Login Counselor
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@counselors.com",
    "password": "password123"
  }'
```

### 3. Submit Public Enquiry (No Auth)
```bash
curl -X POST http://localhost:5000/api/enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Student",
    "email": "alex@example.com",
    "courseInterest": "Computer Science",
    "phone": "+1-555-0199",
    "message": "Interested in the Fall semester intake."
  }'
```

### 4. Get Unclaimed Leads
```bash
curl -X GET "http://localhost:5000/api/leads/unclaimed?page=1&limit=20" \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### 5. Claim a Lead
```bash
curl -X POST "http://localhost:5000/api/leads/<LEAD_ID>/claim" \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```

### 6. Get My Claimed Leads
```bash
curl -X GET "http://localhost:5000/api/leads/my?page=1&limit=20" \
  -H "Authorization: Bearer <YOUR_TOKEN>"
```
