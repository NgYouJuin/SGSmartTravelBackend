# Smart Commuter Companion API

Express backend for the hackathon's commuter-facing app. It keeps credentials server-side, normalises LTA's inconsistent rail-line codes, caches live status for 60 seconds, and makes data outages explicit instead of presenting them as a normal network.

## Run

```sh
npm install
npm start
```

Create `.env` from the values supplied by the relevant providers:

```env
PORT=3000
LTA_DATAMALL_KEY=...
ONEMAP_API_TOKEN=...
VALHALLA_URL=http://localhost:8002 # optional; this is the default
GEMINI_API_KEY=... # optional; used only for disruption decision support
ENABLE_GENERATIVE_AI=true # optional; opt in to Gemini instead of the free local fallback
CORS_ORIGIN=http://localhost:5173
```

`npm test` runs offline-safe endpoint and normalisation tests.

## Endpoints

`GET /health` returns service health without calling third parties.

`GET /api/v1/commute/status` returns the official TrainServiceAlerts state. `networkStatus` is `NORMAL`, `DISRUPTED`, or `UNKNOWN`; `dataFreshness` is `LIVE` or `UNAVAILABLE`. Clients should preserve the last usable journey and show it as stale when the status is `UNKNOWN` (for example, underground), rather than treating unavailable data as normal service.

`GET /api/v1/routing?start=1.3521,103.8198&end=1.2903,103.8519&routeType=pt` validates coordinate pairs and proxies OneMap routing without exposing its token. It also accepts `date`, `time`, and `mode`.

`GET /api/v1/routing/valhalla?start=1.3521,103.8198&end=1.2903,103.8519&costing=multimodal` proxies the configured Valhalla server. `VALHALLA_URL` is its base URL and defaults to `http://localhost:8002`.

Route responses include `ETag` and `Cache-Control` headers for offline clients. Send `If-None-Match` to validate a cached route without transferring it again. `GET /api/v1/commute/status?since=<ISO-8601 timestamp>` returns only `{ unchanged: true, updatedAt }` when the client already has the latest state.

The crowding streams are deliberately separate: `GET /api/v1/crowding/platform/realtime`, `GET /api/v1/crowding/platform/forecast`, and `GET /api/v1/crowding/bus-load`. Each accepts the matching DataMall query parameters and is cached independently for 60 seconds.

`POST /api/v1/demo/inject-disruption` enables a deterministic East West Line disruption for judging. AI parsing uses a deterministic local fallback by default; Gemini requires both `GEMINI_API_KEY` and `ENABLE_GENERATIVE_AI=true`. Keys remain in the ignored `.env` file.

This backend does not make Overpass or public OSM tile requests. Place deployment-owned extracts in `public/geospatial`; they are served as `/geospatial/*` with long-lived immutable caching. Keep map tiles and geospatial extracts self-hosted rather than adding calls to public instances.

## Product boundary

This repository is the backend, not the complete mobile web app. To meet the specification end to end, the frontend must render the returned door-to-door route on an **OpenStreetMap-based** map, display OSM attribution, distinguish affected route legs from alternatives, and retain the latest journey for offline/stale display. OneMap routing is a route-data provider; it does not remove the required OSM visual base or attribution.

Live disruption advice is deliberately optional: if Gemini is unavailable, the raw official message remains available and the API still functions. A demo disruption should be explicitly labelled as replayed or injected when it is not live.
