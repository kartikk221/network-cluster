const EventEmitter = require('events');
const UUID = require('uuid');
const HyperExpress = require('hyper-express');
const { wrap_object } = require('../shared/operators.js');

class Provider {
    #server;
    #route;
    #heartbeat_interval;
    #connections = {};
    #emitter = new EventEmitter();
    #handlers = {
        log: (message) => {},
        error: (error) => {
            throw error;
        },
    };

    #options = {
        port: 8080,
        path: '/connect',
        ws: {
            compressor: HyperExpress.compressors.DISABLED,
            max_backpressure: 1024 * 1024,
            max_payload_length: 32 * 1024,
        },
        auth: {
            parameters: null,
            handler: null,
        },
        ssl: {
            key: '',
            cert: '',
            passphrase: '',
            dh_params: '',
            prefer_low_memory_usage: false,
        },
        heartbeat: {
            interval: 1000 * 30, // By default check every 15 seconds
            max_strikes: 2,
        },
    };

    /**
     * Creates a new NetworkCluster.Provider instance.
     *
     * @param {Object} options Provider Options
     * @param {Number} options.port Port on which websocket server will listen for consumer connections
     * @param {String} options.path Path on which consumer websockets will connect to join cluster
     * @param {Object} options.ws Websocket server options
     * @param {Number} options.ws.compressor Per message deflate compression. Provide one of prests from NetworkCluster.COMPRESSORS
     * @param {Number} options.ws.max_backpressure Max length of backpressure content
     * @param {Number} options.ws.max_payload_length Max incoming payload length
     * @param {Object} options.auth Incoming connection authentication conditions
     * @param {Object} options.auth.parameters Request parameters parameters to authenticate for incoming consumer connections
     * @param {Function} options.auth.handler Upgrade Handler for incoming consumer connections to authenticate. Example: (request, response, upgrade) => upgrade(true)
     * @param {Object} options.ssl SSL Options [Both ssl.key and ssl.cert are REQUIRED]
     * @param {String} options.ssl.key Path to SSL Key file [REQUIRED]
     * @param {String} options.ssl.cert Path to SSL Cert file [REQUIRED]
     * @param {String} options.ssl.passphrase Secret passphrase for SSL [OPTIONAL]
     * @param {String} options.ssl.dh_params Path to SSL DH Params file [OPTIONAL]
     * @param {Boolean} options.ssl.prefer_low_memory_usage Specifies whether to prefer lower SSL usage for uWebsockets.js
     * @param {Object} options.heartbeat Heartbeat (Ping Pong) cycle policy options
     * @param {Number} options.heartbeat.interval Interval in milliseconds to perform Ping/Pong cycle
     * @param {Number} options.heartbeat.max_strikes Max number of inactive ping responses before disconnection and cleanup
     */
    constructor(options = this.#options) {
        // Enforce option type
        if (options === null || typeof options !== 'object')
            throw new Error('options must be an object.');

        // Wrap options object with user options
        wrap_object(this.#options, options);

        // Initiate server and heartbeat cycle
        this._initiate_server();
        this._initiate_heartbeat_cycle();
    }

    /**
     * Initiates HyperExpress server for connections.
     */
    _initiate_server() {
        // Spread option values
        const { port, ssl } = this.#options;
        const { key, cert, passphrase, dh_params, prefer_low_memory_usage } = ssl;

        // Create a new HyperExpress.Server instance
        if (key && cert && passphrase) {
            this.#server = new HyperExpress.Server({
                key_file_name: key,
                cert_file_name: cert,
                passphrase: passphrase,
                dh_params_file_name: dh_params,
                ssl_prefer_low_memory_usage: prefer_low_memory_usage,
            });
        } else {
            this.#server = new HyperExpress.Server();
        }

        this.#server.get('/alive', (request, response) =>
            response.send('Hello World @ ' + Date.now())
        );

        // Bind server error handler to emitter
        let reference = this;
        this.#server.set_error_handler((request, response, error) => {
            reference.#handlers.error(error);
            return response.status(500).send();
        });

        // Bind listener route
        this._bind_listener_route();

        // Listen on specified user port
        this.#server
            .listen(port)
            .then(() => this.#handlers.log('SERVER_ACTIVE|' + port))
            .catch((error) => this.#handlers.error(error));
    }

    /**
     * Binds listener route for incoming consumer connections.
     */
    _bind_listener_route() {
        const { path, ws, heartbeat } = this.#options;

        // Create a new websocketRoute for listener path
        this.#route = this.#server.ws(path, {
            compression: ws.compressor,
            idleTimeout: Math.max(Math.round(heartbeat.interval / 1000 / 4) * 4, 8),
            maxBackpressure: ws.max_backpressure,
            maxPayloadLength: ws.max_payload_length,
        });

        // Bind websocket route handlers
        this.#route.handle('upgrade', (a, b) => this._on_connection_upgrade(a, b));
        this.#route.handle('open', (a) => this._on_connection_open(a));
        this.#route.handle('message', (a, b, c) => this._on_connection_message(a, b, c));
        this.#route.handle('close', (a, b, c) => this._on_connection_close(a, b, c));
    }

    /**
     * Rejects incoming HyperExpress Request with specified HTTP response code.
     *
     * @param {Response} response
     * @param {Number} code HTTP response code
     */
    _reject_upgrade(request, response, code = 403) {
        this.#handlers.log('REJECT_CONNECTION|' + request.ip + '|' + request.url);
        return response.status(code).send('Unauthorized');
    }

    /**
     * Handles incoming connection upgrade events from websocket route.
     *
     * @param {Request} request
     * @param {Response} response
     */
    async _on_connection_upgrade(request, response) {
        const { parameters, handler } = this.#options.auth;

        // Verify parameters from incoming request if specified as required
        if (parameters) {
            // Match incoming request parameters against required parameters
            let verdict = true;
            let request_parameters = request.query_parameters;
            Object.keys(parameters).forEach((key) => {
                if (request_parameters[key] !== parameters[key]) verdict = false;
            });

            // Reject upgrade request if verdict is to decline upgrade
            if (!verdict) return this._reject_upgrade(request, response);
        }

        // Verify incoming upgrade request using handler if provided by user
        if (typeof handler == 'function') {
            try {
                let result = await handler(request, request.query_parameters);
                if (result !== true) return this._reject_upgrade(request, response);
            } catch (error) {
                this.#handlers.error(error);
                return this._reject_upgrade(request, response);
            }
        }

        return this._upgrade_connection(request, response);
    }

    /**
     * Upgrades pending request from websocket route to a consumer websocket connection.
     *
     * @param {Request} request
     * @param {Response} response
     */
    _upgrade_connection(request, response) {
        const id = UUID.v4();
        this.#handlers.log('CONNECTION_UPGRADE|' + id + '|' + request.ip);
        return response.upgrade({
            id: id,
            ip: request.ip,
            parameters: request.query_parameters,
            alive: true,
            strikes: 0,
            last_ping: Date.now(),
        });
    }

    /**
     * Handles new opened websocket connections from websocket route.
     *
     * @param {uWS.Websocket} ws Websocket connection
     */
    _on_connection_open(ws) {
        // Store connection to connections pool
        this.#connections[ws.id] = ws;
        this.#handlers.log('CONNECTION_OPEN|' + ws.id);

        // Emit 'open' event on Provider emitter
        this.#emitter.emit('open', ws);

        // Send heartbeat interval from provider
        ws.send('PROVIDER_HEARTBEAT|' + this.#options.heartbeat.interval);
    }

    /**
     * Handles incoming messages from websocket connections.
     *
     * @param {uWS.Websocket} ws Websocket connection
     * @param {String} message Message
     * @param {Boolean} is_binary
     */
    _on_connection_message(ws, message, is_binary) {
        // Handle pong mesages to mark connections as active
        if (message === 'PONG') {
            this.#handlers.log('HEARTBEAT_ALIVE|' + ws.id);
            ws.strikes = 0;
            ws.last_ping = Date.now();
            return (ws.alive = true);
        }

        // Log connection message
        this.#handlers.log('CONNECTION_MESSAGE|' + ws.id + '|' + message);

        // Emit 'message' event on Provider emitter
        this.#emitter.emit('message', ws, message);
    }

    _on_connection_close(ws, code, message) {
        // Delete connection from connection pool
        delete this.#connections[ws.id];
        this.#handlers.log('CONNECTION_CLOSE|' + ws.id + '|' + code + '|' + message);

        // Emit 'message' event on Provider emitter
        this.#emitter.emit('close', ws, code, message);
    }

    /**
     * Initiates heartbeat cycle based on heartbeat interval.
     */
    _initiate_heartbeat_cycle() {
        const { interval } = this.#options.heartbeat;
        this.#heartbeat_interval = setInterval(() => this._perform_heartbeat_cycle(), interval);
    }

    /**
     * Performs a heartbeat cycle to cleanup inactive connections
     */
    _perform_heartbeat_cycle() {
        let reference = this;
        let connections = Object.keys(this.#connections);

        this.#handlers.log('HEARTBEAT_CYCLE|' + connections.length);
        if (connections.length == 0) return;

        connections.forEach((id) => {
            let connection = reference.#connections[id];
            if (connection.alive === false) {
                if (connection.strikes < reference.#options.heartbeat.max_strikes) {
                    reference.#handlers.log('HEARTBEAT_STRIKE|' + id);
                    reference.#connections[id].strikes++;
                } else {
                    reference.#handlers.log('HEARTBEAT_KILL|' + id);
                    connection.end();
                }
            } else {
                reference.#handlers.log('HEARTBEAT_SEND|' + id);
                reference.#connections[id].alive = false;
                connection.send('PING');
            }
        });
    }

    /**
     * Sets error handler for Provider instance.
     *
     * @param {Function} handler
     */
    set_error_handler(handler) {
        if (typeof handler !== 'function')
            throw new Error('set_error_handler(handler) -> handler must be a Function');
        this.#handlers.error = handler;
    }

    /**
     * Sets debug logger for Provider instance.
     *
     * @param {Function} handler
     */
    set_debug_logger(handler) {
        if (typeof handler !== 'function')
            throw new Error('set_debug_logger(handler) -> handler must be a Function');
        this.#handlers.log = handler;
    }

    /**
     * Alias for Provider.emitter.on method to bind event handlers.
     *
     * @param {String} event
     * @param {Function} handler
     */
    on(event, handler) {
        this.#emitter.on(event, handler);
    }

    /**
     * Destroys Provider instance and disconnects all connected workers.
     */
    destroy() {
        // Close all active connections
        Object.keys(this.#connections).forEach((id) => this.#connections[id].end());

        // Destroy HyperExpress Webserver
        this.#server.close();

        // Destroy heartbeat interval
        clearInterval(this.#heartbeat_interval);

        // Destroy Event Emitter
        this.#emitter.removeAllListeners();
    }

    /* Server Getters */
    get connections() {
        return this.#connections;
    }

    get port() {
        return this.#options.port;
    }

    get path() {
        return this.#options.path;
    }

    get events() {
        return this.#emitter;
    }

    get server() {
        return this.#server;
    }
}

module.exports = Provider;
