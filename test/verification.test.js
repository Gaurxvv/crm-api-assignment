const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../src/app');

process.env.JWT_SECRET = 'test_secret_key_12345';
process.env.JWT_EXPIRES_IN = '1h';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('CRM Backend Verification Checklist', () => {
  let tokenA;
  let userAId;
  let tokenB;
  let userBId;
  let createdLeadId;

  // 1. Register user A, get token
  test('1. Register user A, get token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Counselor Alice',
        email: 'alice@counselors.com',
        password: 'password123',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('alice@counselors.com');
    expect(res.body.data.user.password).toBeUndefined();

    tokenA = res.body.data.token;
    userAId = res.body.data.user.id;
  });

  // 2. POST a public enquiry with no token. It succeeds.
  test('2. POST a public enquiry with no token. It succeeds.', async () => {
    const res = await request(app)
      .post('/api/enquiries')
      .send({
        name: 'John Prospect',
        email: 'john@example.com',
        phone: '1234567890',
        courseInterest: 'Full Stack Engineering',
        message: 'Interested in the upcoming cohort.',
        claimedBy: 'hacker_attempt', // should be ignored
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    createdLeadId = res.body.data._id || res.body.data.id;
    expect(createdLeadId).toBeDefined();
  });

  // 3. GET unclaimed with A\'s token. The enquiry appears.
  test('3. GET unclaimed with A\'s token. The enquiry appears.', async () => {
    const res = await request(app)
      .get('/api/leads/unclaimed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find(
      (l) => (l._id || l.id).toString() === createdLeadId.toString()
    );
    expect(found).toBeDefined();
    expect(found.name).toBe('John Prospect');
    expect(found.claimedBy).toBeNull();
  });

  // 4. Claim it as A. 200.
  test('4. Claim it as A. 200.', async () => {
    const res = await request(app)
      .post(`/api/leads/${createdLeadId}/claim`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.claimedBy.toString()).toBe(userAId.toString());
    expect(res.body.data.claimedAt).toBeDefined();
  });

  // 5. GET unclaimed again. It is gone.
  test('5. GET unclaimed again. It is gone.', async () => {
    const res = await request(app)
      .get('/api/leads/unclaimed')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find(
      (l) => (l._id || l.id).toString() === createdLeadId.toString()
    );
    expect(found).toBeUndefined();
  });

  // 6. GET my leads as A. It appears.
  test('6. GET my leads as A. It appears.', async () => {
    const res = await request(app)
      .get('/api/leads/my')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const found = res.body.data.find(
      (l) => (l._id || l.id).toString() === createdLeadId.toString()
    );
    expect(found).toBeDefined();
    expect(found.claimedBy.toString()).toBe(userAId.toString());
  });

  // 7. Register user B and try to claim the same lead. 409.
  test('7. Register user B and try to claim the same lead. 409.', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Counselor Bob',
        email: 'bob@counselors.com',
        password: 'password456',
      });

    expect(regRes.status).toBe(201);
    tokenB = regRes.body.data.token;
    userBId = regRes.body.data.user.id;

    const claimRes = await request(app)
      .post(`/api/leads/${createdLeadId}/claim`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(claimRes.status).toBe(409);
    expect(claimRes.body.success).toBe(false);
    expect(claimRes.body.message).toMatch(/already claimed/i);
  });

  // 8. GET unclaimed and my leads with no token. 401.
  test('8. GET unclaimed and my leads with no token. 401.', async () => {
    const unclaimedRes = await request(app).get('/api/leads/unclaimed');
    expect(unclaimedRes.status).toBe(401);
    expect(unclaimedRes.body.success).toBe(false);

    const myRes = await request(app).get('/api/leads/my');
    expect(myRes.status).toBe(401);
    expect(myRes.body.success).toBe(false);

    const invalidTokenRes = await request(app)
      .get('/api/leads/unclaimed')
      .set('Authorization', 'Bearer invalid_token_here');
    expect(invalidTokenRes.status).toBe(401);
  });

  // 9. Fire two claims concurrently as A and B. Exactly one succeeds.
  test('9. Fire two claims concurrently as A and B. Exactly one succeeds.', async () => {
    // Create a new fresh unclaimed enquiry
    const enqRes = await request(app)
      .post('/api/enquiries')
      .send({
        name: 'Concurrent Prospect',
        email: 'concurrent@example.com',
        courseInterest: 'Data Science',
      });

    expect(enqRes.status).toBe(201);
    const concurrentLeadId = enqRes.body.data._id || enqRes.body.data.id;

    // Fire two claims simultaneously
    const [resClaimA, resClaimB] = await Promise.all([
      request(app)
        .post(`/api/leads/${concurrentLeadId}/claim`)
        .set('Authorization', `Bearer ${tokenA}`),
      request(app)
        .post(`/api/leads/${concurrentLeadId}/claim`)
        .set('Authorization', `Bearer ${tokenB}`),
    ]);

    const statuses = [resClaimA.status, resClaimB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const successfulRes = resClaimA.status === 200 ? resClaimA : resClaimB;
    const failedRes = resClaimA.status === 409 ? resClaimA : resClaimB;

    expect(successfulRes.body.success).toBe(true);
    expect(successfulRes.body.data).toBeDefined();
    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.message).toMatch(/already claimed/i);
  });

  describe('Edge cases and error handling', () => {
    test('Claim with invalid ObjectId returns 400', async () => {
      const res = await request(app)
        .post('/api/leads/not-a-valid-id/claim')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid lead id/i);
    });

    test('Claim with non-existent ObjectId returns 404', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .post(`/api/leads/${fakeId}/claim`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/lead not found/i);
    });

    test('Register duplicate email returns 409', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice Duplicate',
          email: 'alice@counselors.com',
          password: 'password123',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already registered/i);
    });

    test('Register validation: short password returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Pass',
          email: 'short@counselors.com',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });

    test('Register validation: invalid email returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Bad Email',
          email: 'not-an-email',
          password: 'password123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Login with wrong password returns 401 generic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'alice@counselors.com',
          password: 'wrong_password',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('Login with non-existent user returns 401 generic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@counselors.com',
          password: 'password123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('Public enquiry validation: missing required field returns 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .send({
          name: 'Incomplete Enquiry',
          email: 'incomplete@example.com',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Unknown route returns 404', async () => {
      const res = await request(app).get('/api/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Route not found');
    });

    test('Malformed JSON returns 400', async () => {
      const res = await request(app)
        .post('/api/enquiries')
        .set('Content-Type', 'application/json')
        .send('{ "invalidJson": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid JSON body');
    });

    test('Pagination limits max limit to 100', async () => {
      const res = await request(app)
        .get('/api/leads/unclaimed?limit=500')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });
  });
});
