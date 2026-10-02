# Self-hosted geospatial layers

Place deployment-owned GeoJSON, vector tiles, or other static map extracts in this directory. They are served from `/geospatial` with a seven-day immutable cache policy.

Do not configure clients to fall back to `tile.openstreetmap.org`. Obtain and bundle only the extracts required by the application, respecting their source licences and attribution requirements.
