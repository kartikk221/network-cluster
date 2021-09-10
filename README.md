# NetworkCluster: Create Multi-Machine Network Clusters With A Simple-To-Use API
#### Powered by [`HyperExpress`](https://github.com/kartikk221/hyper-express)

<div align="left">

[![NPM version](https://img.shields.io/npm/v/network-cluster.svg?style=flat)](https://www.npmjs.com/package/network-cluster)
[![NPM downloads](https://img.shields.io/npm/dm/network-cluster.svg?style=flat)](https://www.npmjs.com/package/network-cluster)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/kartikk221/network-cluster.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/kartikk221/network-cluster/context:javascript)
[![GitHub issues](https://img.shields.io/github/issues/kartikk221/network-cluster)](https://github.com/kartikk221/network-cluster/issues)
[![GitHub stars](https://img.shields.io/github/stars/kartikk221/network-cluster)](https://github.com/kartikk221/network-cluster/stargazers)
[![GitHub license](https://img.shields.io/github/license/kartikk221/network-cluster)](https://github.com/kartikk221/network-cluster/blob/master/LICENSE)

</div>

## Motivation
NetworkCluster aims to simplify the process of creating scalable clusters with streamlined logic. This package uses websockets under the hood to allow for consistently low latency communication between multiple machines and processes.

## Installation
NetworkCluster can be installed using node package manager (`npm`)
```
npm i network-cluster
```

## Table Of Contents
- [NetworkCluster: Create Multi-Machine Network Clusters With A Simple-To-Use API](#networkcluster-create-multi-machine-network-clusters-with-a-simple-to-use-api)
      - [Powered by `HyperExpress`](#powered-by-hyperexpress)
  - [Motivation](#motivation)
  - [Installation](#installation)
  - [Table Of Contents](#table-of-contents)
  - [How To Use](#how-to-use)
      - [Example Provider Code](#example-provider-code)
      - [Example Consumer Code](#example-consumer-code)
  - [Provider](#provider)
      - [Provider Constructor Options](#provider-constructor-options)
      - [Provider Instance Properties](#provider-instance-properties)
      - [Provider Instance Methods](#provider-instance-methods)
  - [Consumer](#consumer)
      - [Consumer Constructor Options](#consumer-constructor-options)
      - [Consumer Properties](#consumer-properties)
      - [Consumer Methods](#consumer-methods)
  - [Connection](#connection)
      - [Connection Properties](#connection-properties)
      - [Connection Methods](#connection-methods)
  - [License](#license)

## How To Use
NetworkCluster makes use of two components called a Provider and a Consumer to faciliate communication. A Provider can provide and thus communicate with as many consumers as the hardware can support. On the other hand, a Consumer instance can only consume and communicate with one Provider. Below are two blocks of code which demonstrate how to create a simple cluster.

#### Example Provider Code
```javascript
const NetworkCluster = require('network-cluster');

// Create a provider instance to faciliate/manage a cluster
const Provider = new NetworkCluster.Provider({
   port: 8080,
   auth: {
       parameters: {
           key: 'SECRET_KEY' // This will authenticate incoming consumer connections
       }
   }
});

// Listen for incoming messages from connected consumers
Provider.on('message', (consumer, message) => {
   console.log(`Consumer ${consumer.id} Sent: ${message}`);
   
   // We can also send some message back
   if(some_condition) consumer.send('SOME_REPLY');
});
```

#### Example Consumer Code
```javascript
const NetworkCluster = require('network-cluster');

// Create a consumer instance to join a cluster
const Consumer = new NetworkCluster.Consumer({
    host: 'IP_OF_PROVIDER_MACHINE',
    port: 8080,
    parameters: {
        key: 'SECRET_KEY', // This is important as our provider above expects this parameter
        something1: 'Some Value 1',
        something2: 'Some Value 2' // You can also include other parameters as metadata
        // Note! Parameters are sent as URL Parameters thus use according to URL limits
    }
});

// Listen for incoming messages from provider
Consumer.on('message', (message) => {
    console.log(`Provider Sent: ${message}`);
    
    // We can also respond to the provider
    if(some_condition) Provider.send('SOME_REPLY');
});

// Connect to the provider instance to initiate communication
Consumer.connect()
.then(() => {
    console.log('Successfully Connected To Provider! Ready For Work!');
})
.catch((error) => {
    console.log('Failed To Connect To Provider! Reason: ');
    console.log(error);
});

// Send some message to provider to let it know we are ready
Provider.send('CONSUMER_READY');
```

## Provider
Below is a breakdown of the `Provider` object class generated while creating a new Provider instance.

#### Provider Constructor Options
* `port` [`Number`]: Port for websocket server to listen for incoming consumer connections.
    * **Default**: `8080`.
* `path` [`String`]: URL path on which consumers can connect.
    * **Default**: `/connect`.
* `ssl` [`Object`]: SSL options to use TLS for websocket connections.
    * `key` [`String`]: Path to SSL private key file to be used for SSL/TLS.
        * **Example**: `'misc/key.pm'`
        * **Required** for an SSL server.
    * `cert` [`String`]: Path to SSL certificate file.
        * **Example**: `'misc/cert.pm'`
        * **Required** for an SSL server.
    * `passphrase` [`String`]: Strong passphrase for SSL cryptographic purposes.
        * **Example**: `'SOME_RANDOM_PASSPHRASE'`
        * **Required** for an SSL server.
    * `dh_params` [`String`]: Path to SSL Diffie-Hellman parameters file.
        * **Example**: `'misc/dhparam4096.pm'`
        * **Optional** for an SSL server.
    * `prefer_low_memory_usage` [`Boolean`]: Specifies uWebsockets to prefer lower memory usage while serving SSL requests.
* `ws` [`Object`]: Websocket server options.
    * `compressor` [`Number`]: Must one of the presets from `NetworkCluster.COMPRESSORS`.
        * **Default**: `NetworkCluster.COMPRESSORS.DISABLED`
    * `max_backpressure` [`Number`]: Maximum length of backpressure before disconnecting connection.
        * **Default**: `1024 * 1024`
    * `max_payload_length` [`Number`]: Maximum payload length of incoming messages.
        * **Default**: `32 * 1024`
* `auth` [`Object`]: Authentication options/requirements for incoming connections.
    * `parameters` [`Object`]: URL parameters to send with connect/upgrade request.
    * `handler` [`Function`]: Upgrade request handler. This can be used in collaboration with `parameters`.
        * **Format**: `(HyperExpress.Request: request, Object: parameters) => {}`.
        * **See** [HyperExpress.Request](https://github.com/kartikk221/hyper-express#request) for all `request` object properties/methods.
        * **Note:** The handler can return a `Promise` which must resolve to a `Boolean` verdict value.
* `heartbeat` [`Object`]: Ping-Pong cycle configuration.
    * `interval` [`Number`]: Interval in milliseconds to cleanup inactive connections.
        * **Default**: `10 * 1000` (10 Seconds)
    * `max_strikes` [`Number`]: Maximum number of strikes before disconnecting inactive consumer.
        * **Default**: `2`

#### Provider Instance Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `connections` | `Object` | Consumer connections represented by their unique `id`. |
| `port` | `Number` | Port of underlying websocket server. |
| `path` | `String` | Path of websocket server connect route. |
| `events` | `EventEmitter` | Underlying instance event emitter. |
| `server` | `HyperExpress.Server` | Underlying instance HyperExpress server. |

#### Provider Instance Methods
* `on(String: event, Function: handler)`: Binds a handler to the underlying `EventEmitter` instance.
    * **`open`**: This event gets called whenever `Provider` receives a new consumer connection.
        * **Format**: `(Connection: consumer) => {}`
    * **`close`**: This event gets called whenever `Provider` loses a consumer connection.
        * **Format**: `(Connection: consumer, Number: code, String: reason) => {}`
    * **`message`**: This event gets called whenever a message is received from a consumer connection.
        * **Format**: `(Connection: consumer, String: message) => {}`
    * See [Connection](#connection) for properties and methods.
* `set_error_handler(Function: handler)`: Sets a error handler for `Provider` instance.
    * **Format**: `(Error: error) => {}`
* `set_debug_logger(Function: handler)`: Sets a debug logger for `Provider` instance.
    * **Format**: `(String: message) => {}`
    * **Note!** Using this logger is not recommended in production.
* `destroy()`: Destroys `Provider` instance and cleans up underlying components.

## Consumer
Below is a breakdown of the `Consumer` object class generated while creating a new Consumer instance.

#### Consumer Constructor Options
* `ssl` [`Boolean`]: Specifies whether `https` protocol should be used to create a secure SSL connection with the `Provider`.
    * **Default**: `false`.
* `host` [`String`]: Host/IP address of the `Provider` to connect.
* `port` [`Number`]: Port of the `Provider` to connect.
* `path` [`String`]: Address path of the `Provider` to connect.
  * **Default**: `/connect`
  * **Note!** This option should be left default unless the `Provider` was created on a different listening path.
* `parameters` [`Object`]: Parameters to specify when attempting to create a connection with `Provider`.
  * **Note!** Any authentication values or metadata should be sent as parameters.
* `reconnect` [`Object`]: Reconnect policy for connection dropouts.
  * `interval` [`Number`]: Time in milliseconds to wait before attempting a reconnect with the `Provider`.
  * `max_attempts` [`Number`]: Maximum number of failed reconnect attempts before marking `Consumer` instance as closed and unusable.

#### Consumer Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `ws` | `Websocket`  | Underlying WebSocket object. See [WebSocket](https://github.com/websockets/ws/blob/HEAD/doc/ws.md#class-websocket) for documentation. |
| `events` | `EventEmitter`  | Underlying EventEmitter for instance. |
| `in_flight` | `Boolean`  | Whether instance is currently connecting to Provider. |
| `connected` | `Boolean`  | Whether instance is connected to Provider. |
| `heartbeat_duration` | `Number`  | Expected interval between Provider heartbeat pings. |
| `heartbeat_cutoff` | `Number`  | Maximum time in milliseconds allowed since last heart beat ping before disconnect. |
| `last_heartbeat` | `Number`  | Timestamp in milliseconds of last heartbeat ping. |

#### Consumer Methods
* `connect()`: Initiates connection to `Provider` and automatically reconnects during dropouts.
    * **Returns** a `Promise` similar to `ready()` method below.
    * **Note!** This method must be called once to initialize the connection cycle.
* `ready()`: Returns a `Promise` which is resolved on successful connection or rejected with error on failure.
* `set_error_handler(Function: handler)`: Sets a error handler for `Consumer` instance.
    * **Format**: `(Error: error) => {}`
* `set_debug_logger(Function: handler)`: Sets a debug logger for `Consumer` instance.
    * **Format**: `(String: message) => {}`
    * **Note!** Using this logger is not recommended in production.
* `on(String: event, Function: handler)`: Binds a handler to the underlying `EventEmitter` instance.
    * **`open`**: This event gets emitted whenever `Consumer` connects to the `Provider`.
        * **Format**: `() => {}`
    * **`disconnect`**: This event gets emitted whenever `Consumer` gets disconnected from the `Provider`.
         * **Format**: `(Number: code, String: reason) => {}`
    * **`message`**: This event gets emitted whenever a message is received from the `Provider`.
        * **Format**: `(String: message) => {}`
    * **`close`**: This event gets emitted only once when `Consumer` instance has **permanently** disconnected/closed after exhausting reconnection policy.
* `once(String: event, Function: handler)`: Same as `on` except only gets called once.
* `send(String: message)`: Sends a message to the `Provider`.
    * **Returns** `Boolean` based on successful message delivery.
* `destroy()`: Destroys `Consumer` instance and all underlying components.

## Connection
Below is a breakdown of the `Connection` [(HyperExpress.Websocket)](https://github.com/kartikk221/hyper-express#websocket) object made available through event emitters.

#### Connection Properties
| Property  | Type     | Description                |
| :-------- | :------- | :------------------------- |
| `id` | `String`  | Unique connection identifier (uuid v4). |
| `ip` | `String`  | IP address of connection. |
| `parameters` | `Object`  | Consumer parameters of connection. |
| `last_ping` | `Number`  | Last heartbeat ping timestamp in milliseconds. |
| `strikes` | `Number`  | Number of strikes due to missed heartbeats (pings). |

#### Connection Methods
See [Websocket](https://github.com/kartikk221/hyper-express#websocket) for all available methods for each `Connection` instance.

## License
[MIT](./LICENSE)
