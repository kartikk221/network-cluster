const { log } = require('./operators.js');
const provider_test = require('./scenarios/provider_test.js');

async function perform_tests() {
    log('TESTS', 'Performing NetworkCluster Tests...\n');

    await provider_test();

    log('TESTS', 'Finished Testing NetworkCluster Components!');
}

perform_tests().catch((error) => {
    throw error;
});
