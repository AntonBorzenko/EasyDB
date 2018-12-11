'use strict';


/**
 * Module dependencies.
 */
const app = require('./app');
const debug = require('debug')('easy-db:server');
const config = require('../config');
const http = require('http');
const https = require('https');
const fs = require('fs');
const ExpressWs = require('express-ws');

/**
 * Get port from environment and store in Express.
 */

let port = normalizePort(process.env.PORT || config.app.port);
app.set('port', port);

/**
 * Create HTTP server.
 */
let server;
if (config.app.https) {
    let key = fs.readFileSync(config.app.privateKeyFile, 'utf8');
    let cert = fs.readFileSync(config.app.certificateFile, 'utf8');
    let credentials = { key, cert };
    server = https.createServer(credentials, app);
} else {
    server = http.createServer(app);
}
/**
 * Listen on provided port, on all network interfaces.
 */
ExpressWs(app, server);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
    let port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
    if (error.syscall !== 'listen') {
        throw error;
    }

    let bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
    let addr = server.address();
    let bind = typeof addr === 'string'
        ? 'pipe ' + addr
        : 'port ' + addr.port;
    debug('Listening on ' + bind);
}
