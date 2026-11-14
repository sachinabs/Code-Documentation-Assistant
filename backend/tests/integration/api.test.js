import request from 'supertest';
import app from '../../src/app.js';

test('health endpoint', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('create repository rejects missing url', async () => {
  const res = await request(app).post('/api/repositories').send({});
  expect(res.status).toBe(400);
});

test('create repository rejects invalid url', async () => {
  const res = await request(app).post('/api/repositories').send({ url: 'https://example.com/x/y' });
  expect(res.status).toBe(500);
});