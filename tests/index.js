const { log } = require('./operators.js');
const provider_test = require('./scenarios/provider_test.js');
const consumer_test = require('./scenarios/consumer_test.js');

async function perform_tests() {
    log('TESTS', 'Performing NetworkCluster Tests...\n');

    await provider_test();
    await consumer_test();

    log('TESTS', 'Finished Testing NetworkCluster Components!');
    process.exit();
}

setInterval(() => {
    console.log('active');
}, 10000);

perform_tests().catch((error) => {
    console.log('Top Level Error: ');
    console.log(error);
    // process.exit();
});
