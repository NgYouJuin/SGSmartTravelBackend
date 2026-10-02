import express from 'express';
import { createHash } from 'node:crypto';
import {
    fetchBusLoad,
    fetchPlatformCrowdDensityForecast,
    fetchPlatformCrowdDensityRealtime,
    fetchTrainAlerts,
    injectDemoDisruption
} from '../services/ltaService.js';
import { parseAlertText, parseAlertTextFallback } from '../services/aiService.js';
import { fetchRoute } from '../services/routingService.js';

const router = express.Router();

function isCoordinatePair(value) {
    const parts = String(value || '').split(',').map(Number);
    return parts.length === 2 && parts.every(Number.isFinite)
        && parts[0] >= -90 && parts[0] <= 90 && parts[1] >= -180 && parts[1] <= 180;
}

function sendCacheableJson(req, res, payload, maxAgeSeconds) {
    const etag = `"${createHash('sha256').update(JSON.stringify(payload)).digest('base64url')}"`;
    res.set({
        'Cache-Control': `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 5}`,
        ETag: etag
    });
    if (req.headers['if-none-match'] === etag) return res.status(304).end();
    return res.json(payload);
}

function hasCurrentStateSince(value, updatedAt) {
    const since = Date.parse(String(value || ''));
    const updated = Date.parse(updatedAt);
    return Number.isFinite(since) && Number.isFinite(updated) && since >= updated;
}

router.get('/commute/status', async (req, res) => {
    const alerts = await fetchTrainAlerts();
    if (hasCurrentStateSince(req.query.since, alerts.updatedAt)) {
        return sendCacheableJson(req, res, { unchanged: true, updatedAt: alerts.updatedAt }, 15);
    }
    let structuredAdvice = null;

    // if (alerts.availability === 'LIVE' && alerts.status === 2) {
    //     const latestMessage = alerts.messages.find(message => message?.Content)?.Content;
    //     if (latestMessage) structuredAdvice = await parseAlertText(latestMessage);
    // }

    const latestMessage = alerts.busDiversions[0]?.content;
    if (latestMessage) structuredAdvice = await parseAlertText(latestMessage);

    const networkStatus = alerts.availability !== 'LIVE' ? 'UNKNOWN'
        : alerts.status === 1 ? 'NORMAL' : alerts.status === 2 ? 'DISRUPTED' : 'UNKNOWN';
    const payload = {
        networkStatus,
        dataFreshness: alerts.availability,
        updatedAt: alerts.updatedAt,
        segments: alerts.affectedSegments,
        rawMessages: alerts.messages,
        busDiversions: alerts.busDiversions,
        aiDecisionSupport: structuredAdvice,
        ...(alerts.error ? { message: alerts.error } : {})
    };
    res.status(alerts.availability === 'LIVE' ? 200 : 503);
    return sendCacheableJson(req, res, payload, 15);
});

// Proxy OneMap to hide the token and format the response for the frontend
router.get('/routing', async (req, res) => {
    const { start, end, routeType, date, time, mode } = req.query;
    if (!isCoordinatePair(start) || !isCoordinatePair(end)) {
        return res.status(400).json({ error: 'start and end must be latitude,longitude coordinate pairs.' });
    }
    if (!process.env.ONEMAP_API_TOKEN) {
        return res.status(503).json({ error: 'Routing service is not configured.' });
    }
    
    try {
        const routeData = await fetchRoute({ start, end, routeType, date, time, mode });
        return sendCacheableJson(req, res, routeData, 300);
    } catch (error) {
        console.error('Routing Error:', error.message);
        res.status(502).json({ error: 'Routing provider is temporarily unavailable.' });
    }
});

router.get('/crowding/platform/realtime', async (req, res) => {
    const { trainLine, station } = req.query;
    if (!trainLine || !station) return res.status(400).json({ error: 'trainLine and station are required.' });
    const result = await fetchPlatformCrowdDensityRealtime({ trainLine, station });
    return res.status(result.availability === 'LIVE' ? 200 : 503).json(result);
});

router.get('/crowding/platform/forecast', async (req, res) => {
    const { trainLine, station, startDate, endDate } = req.query;
    if (!trainLine || !station) return res.status(400).json({ error: 'trainLine and station are required.' });
    const result = await fetchPlatformCrowdDensityForecast({ trainLine, station, startDate, endDate });
    return res.status(result.availability === 'LIVE' ? 200 : 503).json(result);
});

router.get('/crowding/bus-load', async (req, res) => {
    const { busStopCode, serviceNo } = req.query;
    if (!busStopCode) return res.status(400).json({ error: 'busStopCode is required.' });
    const result = await fetchBusLoad({ busStopCode, serviceNo });
    return res.status(result.availability === 'LIVE' ? 200 : 503).json(result);
});

// A deterministic judging/demo scenario; no external incident is required.
router.post('/demo/inject-disruption', async (req, res) => {
    const alerts = injectDemoDisruption();
    const latestMessage = alerts.busDiversions[0]?.content;
    res.status(201).json({
        injected: true,
        updatedAt: alerts.updatedAt,
        segments: alerts.affectedSegments,
        busDiversions: alerts.busDiversions,
        aiDecisionSupport: latestMessage ? parseAlertTextFallback(latestMessage) : null
    });
});

// Proxy a self-hosted Valhalla server for routes not supplied by OneMap.
// router.get('/routing/valhalla', async (req, res) => {
//     const { start, end, costing } = req.query;
//     if (!isCoordinatePair(start) || !isCoordinatePair(end)) {
//         return res.status(400).json({ error: 'start and end must be latitude,longitude coordinate pairs.' });
//     }

//     try {
//         const routeData = await fetchValhallaRoute({ start, end, costing });
//         res.json(routeData);
//     } catch (error) {
//         console.error('Valhalla Routing Error:', error.message);
//         res.status(502).json({ error: 'Valhalla routing provider is temporarily unavailable.' });
//     }
// });

export default router;
