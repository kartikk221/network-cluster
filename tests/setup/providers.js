const NetworkCluster = require('../../index.js');
const { port_start, host } = require('../env.json');
const { log, random_string } = require('../operators.js');

const MAIN_PROVIDER_PORT = port_start;
const MAIN_PROVIDER = new NetworkCluster.Provider({
    port: MAIN_PROVIDER_PORT,
});

MAIN_PROVIDER.set_error_handler((error) => {
    log('ERRORS', 'Logged Error From Main Provider: ');
    console.log(error);
});

log('SETUP', 'Started Main Provider With No Authentication');

const HANDLER_PROVIDER_PORT = port_start + 1;
const HANDLER_PROVIDER_HEADER = `x-${random_string(10)}`;
const HANDLER_PROVIDER_VALUE = random_string(10);
const HANDLER_PROVIDER = new NetworkCluster.Provider({
    port: HANDLER_PROVIDER_PORT,
    auth: {
        handler: async (request, response) => {
            return request.headers[HANDLER_PROVIDER_HEADER] === HANDLER_PROVIDER_VALUE;
        },
    },
    heartbeat: {
        interval: 100,
        max_strikes: 2,
    },
});

HANDLER_PROVIDER.set_error_handler((error) => {
    log('ERRORS', 'Logged Error From Handler Provider: ');
    console.log(error);
});

log(
    'SETUP',
    `Started Handler Provider With Header ${HANDLER_PROVIDER_HEADER}[${HANDLER_PROVIDER_VALUE}] On Port ${HANDLER_PROVIDER_PORT}`
);

module.exports = {
    HOST: host,
    MAIN_PROVIDER_PORT,
    MAIN_PROVIDER,
    HANDLER_PROVIDER_PORT,
    HANDLER_PROVIDER_HEADER,
    HANDLER_PROVIDER_VALUE,
    HANDLER_PROVIDER,
};
