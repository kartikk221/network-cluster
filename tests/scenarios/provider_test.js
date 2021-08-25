const NetworkCluster = require('../../index.js');
const { log, assert_log, wait_until, async_wait } = require('../operators.js');
const { HOST, MAIN_PROVIDER_PORT, MAIN_PROVIDER } = require('../setup/providers.js');

async function provider_test() {
    const GROUP = 'PROVIDER';
    const start_time = Date.now();
    log(GROUP, 'Performing Provider Class Tests...');

    // Check initial connections state
    assert_log(GROUP, 'Initial Connections @ 0 Connections', () => {
        return Object.keys(MAIN_PROVIDER.connections).length === 0;
    });

    // Create test consumer
    const CONSUMER = new NetworkCluster.Consumer({
        host: HOST,
        port: MAIN_PROVIDER_PORT,
    });

    // Connect Test Consumer To Main Provider
    log(GROUP, 'Spawing Test Consumer...');
    await CONSUMER.connect();
    log(GROUP, 'Test Consumer Connected! Performing Two-Way Messaging Test...');

    // Check connections state after net connection
    assert_log(GROUP, 'Provider Connections @ 1 Connections', () => {
        return Object.keys(MAIN_PROVIDER.connections).length === 1;
    });

    // Perform Two Way Messaging Test
    let max_messages = 10;
    let provider_log = [];
    let consumer_log = [];

    // Main provider responds with [message + 1] value
    MAIN_PROVIDER.on('message', (ws, message) => {
        // Break back and forth chain at 5 communications
        if (provider_log.length >= max_messages) return;

        let parsed = +message;
        provider_log.push(parsed);
        ws.send((parsed + 1).toString());
    });

    // Consumer also responds same as main provider
    CONSUMER.on('message', (message) => {
        let parsed = +message;
        consumer_log.push(parsed);
        CONSUMER.send((parsed + 1).toString());
    });

    // Send initial message from consumer to provider
    assert_log(GROUP, 'Initial Chain Message Delivery', () => {
        return CONSUMER.send('0');
    });

    // Wait until chain resolves
    await wait_until(() => provider_log.length >= max_messages, 100, 2000);

    // Check two-message chain to validate numbers from both sides
    assert_log(GROUP, `Two-Message Chain Validity Over ${max_messages} Messages`, () => {
        let result = true;
        for (let i = 0; i < max_messages; i++) {
            let a = provider_log[i];
            let b = consumer_log[i];

            if (a !== 2 * i) result = false;
            if (b !== 2 * i + 1) result = false;
        }
        return result;
    });

    // Perform Heartbeat cycle accuracy check
    const sample_time = 1000;
    log(GROUP, `Performing Heartbeat Cycle Accuracy Check Over ${sample_time}ms`);
    await async_wait(sample_time);
    assert_log(GROUP, 'Provider Heartbeat Cycle Accuracy', () => {
        return Object.keys(MAIN_PROVIDER.connections).length === 1;
    });

    // Destroy test consumer and wait 10ms
    log(GROUP, 'Destroying Test Consumer...');
    CONSUMER.destroy();
    await async_wait(10);

    // Verify provider successfully cleaned up consumer connection
    assert_log(GROUP, 'Test Consumer Connection Cleanup', () => {
        return Object.keys(MAIN_PROVIDER.connections).length === 0;
    });

    log(GROUP, `Finished Testing Provider Class In ${Date.now() - start_time}ms\n`);
}

module.exports = provider_test;
