const HyperExpress = require('hyper-express');
const Provider = require('./src/components/Provider.js');
const Consumer = require('./src/components/Consumer.js');

module.exports = {
    Provider: Provider,
    Consumer: Consumer,
    COMPRESSORS: HyperExpress.compressors,
};
