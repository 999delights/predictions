const express = require('express');
const setupMiddleware = require('./utils/middleware');
const groupRoutes = require('./routes/groupRoutes');

const app = express();

setupMiddleware(app);

// Use group routes
app.use('/', groupRoutes);

module.exports = app;
