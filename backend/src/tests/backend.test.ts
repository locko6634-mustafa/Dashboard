import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDefaultDuration, calculateEndTime } from '../services/appointment.service.js';

describe('Appointment Service Logic Tests', () => {
  test('calculateDefaultDuration maps service names correctly', () => {
    assert.equal(calculateDefaultDuration('Lazer Epilasyon'), 45);
    assert.equal(calculateDefaultDuration('lazer'), 45);
    assert.equal(calculateDefaultDuration('Cilt Bakımı'), 60);
    assert.equal(calculateDefaultDuration('cilt bakimi'), 60);
    assert.equal(calculateDefaultDuration('Protez Tırnak'), 90);
    assert.equal(calculateDefaultDuration('Bölgesel İncelme'), 45);
    assert.equal(calculateDefaultDuration('bolgesel incelme'), 45);
    assert.equal(calculateDefaultDuration('Danışma'), 30);
    assert.equal(calculateDefaultDuration(''), 30);
    assert.equal(calculateDefaultDuration(null), 30);
  });

  test('calculateEndTime calculates correct finish time', () => {
    assert.equal(calculateEndTime('09:00', 30), '09:30:00');
    assert.equal(calculateEndTime('09:45', 45), '10:30:00');
    assert.equal(calculateEndTime('11:00', 60), '12:00:00');
    assert.equal(calculateEndTime('13:30', 90), '15:00:00');
    assert.equal(calculateEndTime('18:45', 30), '19:15:00');
  });

  test('calculateEndTime handles empty or invalid string gracefully', () => {
    assert.equal(calculateEndTime('', 30), '');
    assert.equal(calculateEndTime('invalid', 30), 'invalid');
  });
});

import { app } from '../app.js';
import type { Server } from 'http';

describe('HTTP API Endpoints Integration Tests', () => {
  let server: Server;
  let baseUrl: string;

  test('Start test HTTP server', async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
    assert.ok(baseUrl);
  });

  test('GET /health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'randevu-paneli-backend');
  });

  test('GET /api/v1/health returns status ok', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  });

  test('POST /webhook/kullanici-girisi rejects empty body', async () => {
    const res = await fetch(`${baseUrl}/webhook/kullanici-girisi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('POST /api/v1/auth/login rejects empty body', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('GET /api/v1/chatbot/available-slots validates date param', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/available-slots`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('GET /api/v1/chatbot/appointments validates phone param', async () => {
    const res = await fetch(`${baseUrl}/api/v1/chatbot/appointments`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('Close test HTTP server', async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });
});

