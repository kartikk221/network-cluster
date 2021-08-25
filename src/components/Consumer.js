const EventEmitter = require('events');
const WebSocket = require('ws');
const { wrap_object } = require('../shared/operators.js');

class Consumer {
    #ws;
    #emitter = new EventEmitter();
    #ready_queue = [];
    #in_flight = false;
    #fatal_error;
    #connected = false;
    #last_ping = Date.now();
    #reconnect_attempts = 0;
    #heartbeat_interval;
    #heartbeat_margin = 2;
    #heartbeat_duration = 30 * 1000;
    #options = {
        ssl: false,
        host: null,
        port: 8080,
        path: '/cluster/connect',
        headers: null,
        metadata: null,
        reconnect: {
            interval: 1000,
            max_attempts: 10,
        },
        internal: {
            metadata: 'x-nc-metadata',
        },
    };

    /**
     * Creates a new NetworkCluster.Consumer instance.
     *
     * @param {Object} options Consumer Options
     * @param {Boolean} options.ssl Determines whether provider is operating on "http" or "https" url protocol
     * @param {String} options.host IP/Host of the Provider websocket access url
     * @param {Number} options.port Port of the Provider websocket access url
     * @param {String} options.path URL parth of the Provider websocket access url
     * @param {Object} options.headers Authentication headers
     * @param {String} options.metadata Connection metadata to make available on Provider connection instance
     * @param {Object} options.reconnect Reconnect policy options
     * @param {Number} options.reconnect.internal Number of milliseconds to wait for before retrying connection
     * @param {Number} options.reconnect.max_attempts Maximum number of attempts to retry before closing instance
     * @param {Object} options.internal Internal options
     * @param {String} options.internal.metadata Specifies header key on which metadata is sent with upgrade request
     */
    constructor(options = this.#options) {
        // Wrap user provided options over default
        wrap_object(this.#options, options);
    }

    /**
     * Initiates/Re-Initiates heartbeat duration check cycle
     *
     * @param {Number} delay
     */
    _initiate_check_cycle(delay = this.#heartbeat_duration) {
        // Clear old interval
        if (this.#heartbeat_interval) clearInterval(this.#heartbeat_interval);

        // Create new interval
        setInterval(() => this._check_heartbeat(), delay);
    }

    /**
     * Checks whether heartbeat duration is valid
     */
    _check_heartbeat() {
        let difference = Date.now() - this.#last_ping;
        let max_duration = this.#heartbeat_duration * this.#heartbeat_margin;
        if (difference > max_duration) this.#ws.close();
    }

    /**
     * Creates initial websocket connection for Consumer instance.
     */
    _create_ws_connection() {
        const { ssl, host, port, path, headers, metadata, internal } = this.#options;
        let request_headers = headers || {};

        // Add metadata to headers if specified
        if (typeof metadata == 'string' && metadata.length > 0)
            request_headers[internal.metadata] = metadata;

        // Mark instance as in flight
        this.#in_flight = true;

        // Create new WebSocket connection
        this.#ws = new WebSocket(`${ssl ? 'https' : 'http'}://${host}:${port}${path}`, {
            headers: request_headers,
        });

        // Bind WebSocket handlers for connection events
        this._bind_ws_handlers();
    }

    /**
     * Binds websocket handlers to websocket connection.
     */
    _bind_ws_handlers() {
        let reference = this;

        // Bind 'open' event handler
        this.#ws.once('open', () => {
            // Mark instance as not in flight and flush ready promise queue
            reference.#connected = true;
            reference.#in_flight = false;
            reference._flush_ready_queue();

            // Reset reconnection attempts to reset policy state
            reference.#reconnect_attempts = 0;

            // Emit 'open' event for user subscriptions
            reference.#emitter.emit('open');

            // Re-Initiate heartbeat check cycle
            reference._initiate_check_cycle(reference.#heartbeat_duration);
        });

        // Bind 'message' event handler
        this.#ws.on('message', (message) => {
            // Convert message to string type
            message = message.toString();

            // Respond with 'PONG' to pings from provider
            if (message === 'PING') {
                reference.#last_ping = Date.now();
                return reference.#ws.send('PONG');
            }

            // Process and store heartbeat duration from provider
            if (message.startsWith('PROVIDER_HEARTBEAT|')) {
                reference.#heartbeat_duration = +message.split('|')[1];
                return reference._initiate_check_cycle(reference.#heartbeat_duration);
            }

            // Emit 'message' event with message
            reference.#emitter.emit('message', message);
        });

        // Bind 'close' event handler
        this.#ws.once('close', (code, reason) => {
            reference.#connected = false;
            reference.#emitter.emit('disconnect', code, reason);

            // Execute reconnect policy if specified and sufficient attempts remaining
            const attempts = reference.#reconnect_attempts;
            const policy = reference.#options.reconnect;
            if (policy && typeof policy == 'object' && attempts < policy.max_attempts) {
                reference.#reconnect_attempts++;
                return setTimeout(() => reference._create_ws_connection(), policy.interval);
            }

            // Mark instance as closed as no reconnect policy specified
            reference.#emitter.emit('close');
        });

        // Bind 'error' event handler
        this.#ws.on('error', (error) => {
            // Internally handle error messages to change consumer state
            if (error.message) reference._handle_error_message(error);

            // Emit error over emitter
            this.#emitter.emit('error', error);
        });
    }

    /**
     * Flushes ready promises queue based on state.
     */
    _flush_ready_queue() {
        // Flush all queued promises with appropriate responses
        let reference = this;
        this.#ready_queue.forEach(([resolve, reject]) => {
            if (reference.#fatal_error) return reject(reference.#fatal_error);
            resolve();
        });

        // Re-instate ready promise queue
        this.#ready_queue = [];
    }

    /**
     * Handles errors from websocket connection for internal state changes.
     *
     * @param {Error} error
     */
    _handle_error_message(error) {
        let is_fatal = false;

        // Handle 403 Scenario (Means connection is rejected due to bad auth)
        if (error.message === 'Unexpected server response: 403') {
            is_fatal = true;
            this.#reconnect_attempts = Infinity;
        }

        // Store fatal error
        if (is_fatal) {
            this.#in_flight = false;
            this.#fatal_error = error;
            this._flush_ready_queue();
        }
    }

    /**
     * Resolves if consumer successfuly connects to provider. Rejects if consumer encounters a fatal error.
     *
     * @returns {Promise}
     */
    ready() {
        let reference = this;
        return new Promise((resolve, reject) => {
            // Resolve instantly if instance is connected
            if (reference.#connected === true) return resolve();

            // Reject instantly if instance has encountered fatal error
            if (reference.#fatal_error) return reject(reference.#fatal_error);

            // Reject instantly if instance is not in flight
            if (reference.#in_flight === false)
                return reject(
                    new Error('Instance is not in flight. Please call Consumer.connect() first.')
                );

            // Queue promise
            reference.#ready_queue.push([resolve, reject]);
        });
    }

    /**
     * Performs a connect attempt and initiates consumer instance.
     * @returns {Promise} Ready Promise
     */
    connect() {
        if (this.#in_flight === false) this._create_ws_connection();
        return this.ready();
    }

    /**
     * Alias of Consumer.emitter.on method.
     *
     * @param {String} event
     * @param {Function} handler
     */
    on(event, handler) {
        this.#emitter.on(event, handler);
    }

    /**
     * Alias of Consumer.emitter.once method.
     *
     * @param {String} event
     * @param {Function} handler
     */
    once(event, handler) {
        this.#emitter.once(event, handler);
    }

    /**
     * Sends a message to connected Provider.
     *
     * @param {String} message
     * @returns {Boolean} Returns true when message sent successfully
     */
    send(message) {
        // Ensure websocket is connected
        if (this.#connected === false) return false;

        // Ensure message is a string type
        if (typeof message == 'string') {
            // Send message through websocket connection
            this.#ws.send(message);
            return true;
        }

        // Throw error on invalid message type
        throw new Error('send(message) -> message must be a String');
    }

    /**
     * Destroys Consumer Instance
     */
    destroy() {
        // Destroy websocket connection and disable reconnection/state variables
        this.#reconnect_attempts = Infinity;
        this.#in_flight = false;
        this.#connected = false;
        this.#ws.close();

        // Cleanup heartbeat check interval
        if (this.#heartbeat_interval) clearInterval(this.#heartbeat_interval);

        // Flush ready promise queue to complete any pending promises
        this.#fatal_error = new Error('Instance Destroyed');
        this._flush_ready_queue();

        // Destroy Event Emitter
        this.#emitter.removeAllListeners();
        this.#emitter = null;
    }

    /* Consumer Getters */
    get ws() {
        return this.#ws;
    }

    get events() {
        return this.#emitter;
    }

    get in_flight() {
        return this.#in_flight;
    }

    get connected() {
        return this.#connected;
    }

    get last_ping() {
        return this.#last_ping;
    }
}

module.exports = Consumer;
