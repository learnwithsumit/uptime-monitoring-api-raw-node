/*
 * Title: Server library
 * Description: Server related files
 * Author: Sumit Saha ( Learn with Sumit )
 * Date: 12/27/2020
 *
 */
// dependencies
const http = require('http');
const { handleReqRes } = require('../helpers/handleReqRes');

// server object - module scaffolding
const server = {};

// configuration
server.config = {
    port: 3000,
};

// create server
server.createServer = () => {
    const createServerVariable = http.createServer(server.handleReqRes);
    createServerVariable.listen(server.config.port, () => {
        console.log(`listening to port ${server.config.port}`);
    });
};

// handle Request Response
server.handleReqRes = handleReqRes;

// start the server
server.init = () => {
    server.createServer();
};

// export
module.exports = server;
