import NodeCache from 'node-cache';

// The DataMall APIs use different aliases for the same MRT line. Keep all
// conversion at this boundary so routing never needs to reconcile line codes.
export const LINE_CODE_ALIASES = Object.freeze({
    EW: 'EWL', EWL: 'EWL', 'EAST WEST': 'EWL', 'EAST WEST LINE': 'EWL',
    NS: 'NSL', NSL: 'NSL', 'NORTH SOUTH': 'NSL', 'NORTH SOUTH LINE': 'NSL',
    NE: 'NEL', NEL: 'NEL', 'NORTH EAST': 'NEL', 'NORTH EAST LINE': 'NEL',
    CC: 'CCL', CCL: 'CCL', 'CIRCLE': 'CCL', 'CIRCLE LINE': 'CCL',
    DT: 'DTL', DTL: 'DTL', 'DOWNTOWN': 'DTL', 'DOWNTOWN LINE': 'DTL',
    TE: 'TEL', TEL: 'TEL', 'THOMSON EAST COAST': 'TEL', 'THOMSON EAST COAST LINE': 'TEL'
});

const cache = new NodeCache({ stdTTL: 60, useClones: true });
const DATAMALL_URL = 'https://datamall2.mytransport.sg/ltaodataservice';
let injectedDisruption = null;

/** Reconciles inconsistent LTA line codes into a standard format. */
export function standardizeLineCode(rawLine) {
    if (!rawLine) return null;
    const normalized = String(rawLine).toUpperCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    return LINE_CODE_ALIASES[normalized] || normalized;
}

function unavailable(reason) {
    return {
        availability: 'UNAVAILABLE', status: null, affectedSegments: [], messages: [],
        busDiversions: [], updatedAt: new Date().toISOString(), error: reason
    };
}

function parseDiversionMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
        .map(({ Content, CreatedDate }) => ({ content: Content || '', createdDate: CreatedDate || null }))
        .filter(({ content }) => content);
}

function normalizeTrainAlerts(value, updatedAt = new Date().toISOString()) {
    const messages = Array.isArray(value?.Message) ? value.Message : [];
    return {
        availability: 'LIVE',
        status: Number(value.Status), // 1 = normal; 2 = disrupted
        affectedSegments: (Array.isArray(value.AffectedSegments) ? value.AffectedSegments : []).map(segment => ({
            ...segment,
            Line: standardizeLineCode(segment.Line)
        })),
        messages,
        busDiversions: parseDiversionMessages(messages),
        updatedAt
    };
}

export function injectDemoDisruption() {
    const updatedAt = new Date().toISOString();
    injectedDisruption = normalizeTrainAlerts({
        Status: 2,
        AffectedSegments: [{ Line: 'EW', Direction: 'Towards Tuas Link', Stations: 'Bugis - Tanah Merah' }],
        Message: [{
            Content: 'East West Line: additional travelling time of 15 minutes between Bugis and Tanah Merah. Please use regular bus services where possible.',
            CreatedDate: updatedAt
        }]
    }, updatedAt);
    return injectedDisruption;
}

export function clearDemoDisruption() {
    injectedDisruption = null;
}

export async function fetchTrainAlerts() {
    if (injectedDisruption) return injectedDisruption;

    const cacheKey = 'train_alerts';
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (!process.env.LTA_DATAMALL_KEY) return unavailable('LTA DataMall is not configured.');

    try {
        const response = await fetch(`${DATAMALL_URL}/TrainServiceAlerts`, {
            headers: { AccountKey: process.env.LTA_DATAMALL_KEY, accept: 'application/json' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error(`DataMall returned ${response.status}`);

        const value = (await response.json())?.value;
        if (!value || !Number.isInteger(Number(value.Status))) {
            throw new Error('DataMall returned an invalid TrainServiceAlerts payload');
        }

        const normalizedData = normalizeTrainAlerts(value);
        cache.set(cacheKey, normalizedData);
        return normalizedData;
    } catch (error) {
        console.error('LTA Fetch Error:', error.message);
        return unavailable('Live train status is temporarily unavailable.');
    }
}

async function fetchCrowdingStream(name, path, query) {
    const cacheKey = `${name}:${JSON.stringify(query)}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (!process.env.LTA_DATAMALL_KEY) {
        return { availability: 'UNAVAILABLE', stream: name, data: [], error: 'LTA DataMall is not configured.' };
    }

    try {
        
        const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value != null && value !== ''));
        console.log(`${DATAMALL_URL}/${path}?${params}`)
        const response = await fetch(`${DATAMALL_URL}/${path}?${params}`, {
            headers: { AccountKey: process.env.LTA_DATAMALL_KEY, accept: 'application/json' },
            signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error(`DataMall returned ${response.status}`);
        const data = { availability: 'LIVE', stream: name, data: (await response.json())?.value || [], updatedAt: new Date().toISOString() };
        cache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`${name} Fetch Error:`, error.message);
        return { availability: 'UNAVAILABLE', stream: name, data: [], error: `${name} is temporarily unavailable.` };
    }
}

// These remain separate because each stream answers a different commuter question.
export const fetchPlatformCrowdDensityRealtime = ({ trainLine, station }) =>
    fetchCrowdingStream('PLATFORM_REALTIME', 'PCDRealTime', { TrainLine: standardizeLineCode(trainLine), Station: station });

export const fetchPlatformCrowdDensityForecast = ({ trainLine, station, startDate, endDate }) =>
    fetchCrowdingStream('PLATFORM_FORECAST', 'PCDForecast', {
        TrainLine: standardizeLineCode(trainLine), Station: station, StartDate: startDate, EndDate: endDate
    });

export const fetchBusLoad = ({ busStopCode, serviceNo }) =>
    fetchCrowdingStream('BUS_LOAD', 'BusArrival/v3', { BusStopCode: busStopCode, ServiceNo: serviceNo });
