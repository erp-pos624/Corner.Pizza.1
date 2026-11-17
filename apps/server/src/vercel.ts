import { createApp } from './app.js';

// Vercel detects this default export as the Express handler for the API
// service. Unlike `index.ts`, it neither probes the database nor listens on a
// port — the platform owns the request lifecycle.
export default createApp();
