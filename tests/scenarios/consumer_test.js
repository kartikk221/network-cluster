const NetworkCluster = require('../../index.js');
const { log, assert_log, wait_until, async_wait, random_string } = require('../operators.js');
const { port, host } = require('../env.json');

const PROVIDER_HOST = host;
const PROVIDER_PORT = port;
const PROVIDER_HB_INTERVAL = 2500 + Math.floor(Math.random() * 1000);
const PROVIDER_AUTH = random_string(20);
const PROVIDER = new NetworkCluster.Provider({
    port: PROVIDER_PORT,
    auth: {
        handler: async (request, parameters) => {
            return parameters['auth'] === PROVIDER_AUTH;
        },
    },
    heartbeat: {
        interval: PROVIDER_HB_INTERVAL,
    },
});

async function consumer_test() {
    const GROUP = 'CONSUMER';
    const start_time = Date.now();
    log(GROUP, 'Performing Consumer Class Tests...');

    // Create a bad consumer without any authentication to test rejection
    const BAD_CONSUMER = new NetworkCluster.Consumer({
        host: PROVIDER_HOST,
        port: PROVIDER_PORT,
    });

    // Attempt to connect with bad consumer and ensure error is 403 rejection
    let consumer_error = {};
    try {
        await BAD_CONSUMER.connect();
    } catch (error) {
        consumer_error = error;
    }

    // Perform bad authentication assertion & destroy bad consumer after completion
    assert_log(GROUP, 'Bad Authentication Parameter(s) Rejection', () => {
        return (
            BAD_CONSUMER.connected === false &&
            consumer_error.message === 'Unexpected server response: 403'
        );
    });
    BAD_CONSUMER.destroy();

    // Create a good consumer with valid authentication to connect
    const GOOD_CONSUMER = new NetworkCluster.Consumer({
        host: PROVIDER_HOST,
        port: PROVIDER_PORT,
        parameters: {
            auth: PROVIDER_AUTH,
        },
    });

    GOOD_CONSUMER.on('error', (error) => {
        console.log('Good Consumer Error: ');
        console.log(error);
    });

    // Connect and wait 10ms to let provider send heartbeat data to consumer
    await GOOD_CONSUMER.connect();
    await async_wait(5);

    // Perform good authentication assertion and ensure heartbeat interval is communicated properly
    assert_log(GROUP, 'Good Authentication Connection & Heartbeat Data Transport', () => {
        return (
            GOOD_CONSUMER.connected === true &&
            GOOD_CONSUMER.heartbeat_duration === PROVIDER_HB_INTERVAL
        );
    });

    // Check connected 'ready' promise resolver\
    let ready_error;
    try {
        await GOOD_CONSUMER.ready();
    } catch (error) {
        ready_error = error;
    }
    assert_log(GROUP, 'Connected Ready Resolver', () => ready_error === undefined);

    // Destroy provider to free up port
    PROVIDER.destroy();

    log(GROUP, `Finished Testing Consumer Class In ${Date.now() - start_time}ms\n`);
}

module.exports = consumer_test;
