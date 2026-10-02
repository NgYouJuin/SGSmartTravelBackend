const ONEMAP_ROUTING_URL = 'https://www.onemap.gov.sg/api/public/routingsvc/route';
// const DEFAULT_VALHALLA_URL = 'http://localhost:8002';

function currentDateAndTime() {
    const now = new Date();
    return {
        date: new Intl.DateTimeFormat('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric'
        }).format(now).replace(/\//g, '-'),
        time: now.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
}

/** Retrieves a route from OneMap without exposing its token to clients. */
export async function fetchRoute({ start, end, routeType, date, time, mode }) {
    const current = currentDateAndTime();
    const params = new URLSearchParams({
        start: String(start),
        end: String(end),
        routeType: String(routeType || 'pt'),
        date: String(date || current.date),
        time: String(time || current.time),
        mode: String(mode || 'TRANSIT')
    });
    const response = await fetch(`${ONEMAP_ROUTING_URL}?${params}`, {
        headers: { Authorization: process.env.ONEMAP_API_TOKEN },
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) throw new Error(`OneMap returned ${response.status}`);
    return response.json();
}

// function toValhallaLocation(coordinatePair) {
//     const [lat, lon] = coordinatePair.split(',').map(Number);
//     return { lat, lon };
// }

// /** Retrieves a route from a Valhalla server configured by VALHALLA_URL. */
// export async function fetchValhallaRoute({ start, end, costing = 'multimodal' }) {
//     const baseUrl = (process.env.VALHALLA_URL || DEFAULT_VALHALLA_URL).replace(/\/$/, '');
//     const request = {
//         locations: [toValhallaLocation(String(start)), toValhallaLocation(String(end))],
//         costing: String(costing),
//         directions_options: { units: 'kilometers' }
//     };
//     const params = new URLSearchParams({ json: JSON.stringify(request) });
//     console.log(`${baseUrl}/route?${params}`)
//     const response = await fetch(`${baseUrl}/route?${params}`, {
//         signal: AbortSignal.timeout(10000)
//     });

//     if (!response.ok) throw new Error(`Valhalla returned ${response.status}`);
//     return response.json();
// }
