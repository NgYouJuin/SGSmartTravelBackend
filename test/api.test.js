import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { app } from '../server.js';
import { standardizeLineCode } from '../services/ltaService.js';
import { parseAlertTextFallback } from '../services/aiService.js';

async function request(path, options) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    try {
        return await fetch(`http://127.0.0.1:${port}${path}`, options);
    } finally {
        server.close();
    }
}

test('normalizes DataMall line-code variants', () => {
    assert.equal(standardizeLineCode('EW'), 'EWL');
    assert.equal(standardizeLineCode('north south line'), 'NSL');
    assert.equal(standardizeLineCode('TE'), 'TEL');
});

test('health endpoint is available without external services', async () => {
    const response = await request('/health');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
});

test('routing rejects malformed coordinates before contacting OneMap', async () => {
    const response = await request('/api/v1/routing?start=not-a-coordinate&end=1.3,103.8');
    assert.equal(response.status, 400);
});

test('normalizes DataMall line-code punctuation variants', () => {
    assert.equal(standardizeLineCode('Thomson-East Coast Line'), 'TEL');
});

test('AI fallback produces deterministic disruption advice', () => {
    assert.deepEqual(parseAlertTextFallback('EWL has a 15 minute delay'), {
        affectedLine: 'EWL',
        delayMinutes: 15,
        recommendedAction: 'Check station announcements and allow at least 15 extra minutes before travelling on EWL services.'
    });
});

test('demo disruption provides a reproducible disruption response', async () => {
    const response = await request('/api/v1/demo/inject-disruption', { method: 'POST' });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.injected, true);
    assert.equal(body.segments[0].Line, 'EWL');
});

test('commute status supports cache validation and timestamp deltas', async () => {
    const initial = await request('/api/v1/commute/status');
    assert.equal(initial.status, 200);
    assert.ok(initial.headers.get('etag'));
    assert.match(initial.headers.get('cache-control'), /stale-while-revalidate/);
    const { updatedAt } = await initial.json();

    const delta = await request(`/api/v1/commute/status?since=${encodeURIComponent(updatedAt)}`);
    assert.deepEqual(await delta.json(), { unchanged: true, updatedAt });
});
