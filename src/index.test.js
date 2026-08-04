const request = require('supertest');
const app = require('./index');

describe('GET /echo', () => {
  it('returns 200 with message when message param is provided', async () => {
    const res = await request(app).get('/echo?message=hello');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'hello' });
  });

  it('returns 400 with error when message param is missing', async () => {
    const res = await request(app).get('/echo');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
