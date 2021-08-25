const NetworkCluster = require('../index.js');

const PROVIDER = new NetworkCluster.Provider({
    port: 8080,
    auth: {
        headers: {
            'x-key': 'hello-world',
        },
    },
    heartbeat: {
        interval: 2500,
    },
});

PROVIDER.set_debug_logger(console.log);
PROVIDER.on('open', console.log);
PROVIDER.on('close', console.log);
PROVIDER.on('message', console.log);

const CONSUMER = new NetworkCluster.Consumer({
    ip: 'localhost',
    port: 8080,
    headers: {
        'x-key': 'hello-world',
    },
});

CONSUMER.connect()
    .then(() => console.log('Sucessfully Connected!'))
    .catch((error) => console.log(error));
