import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import apiRoutes from './routes/api.js';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json({ limit: '100kb' }));
app.use('/geospatial', express.static(fileURLToPath(new URL('./public/geospatial/', import.meta.url)), {
    maxAge: '7d',
    immutable: true
}));

// Mount the commuter API routes
app.use('/api/v1', apiRoutes);

// Graceful fallback for underground signal loss (PWA health check)
app.get('/health', (req, res) => res.status(200).json({
    status: 'ok',
    service: 'smart-commuter-companion',
    timestamp: new Date().toISOString()
}));

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && 'body' in error) {
        return res.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    console.error('Unhandled API error:', error);
    res.status(500).json({ error: 'Unexpected server error.' });
});

if (process.argv[1]?.endsWith('server.js')) {
    app.listen(PORT, () => {
        console.log(`Smart Commuter Companion API running on port ${PORT}`);
    });
}
