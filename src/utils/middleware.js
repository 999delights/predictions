const bodyParser = require('body-parser');
const express = require('express');

const setupMiddleware = (app) => {
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(express.static('public'));
};

module.exports = setupMiddleware;
