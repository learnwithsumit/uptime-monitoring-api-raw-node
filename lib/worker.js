/*
 * Title: Workers library
 * Description: Worker related files
 * Author: Sumit Saha ( Learn with Sumit )
 * Date: 12/27/2020
 *
 */
// dependencies
const url = require('url');
const http = require('http');
const https = require('https');
const data = require('./data');
const { parseJSON } = require('../helpers/utilities');
const { sendTwilioSms } = require('../helpers/notifications');

// worker object - module scaffolding
const worker = {};

// lookup all the checks
worker.gatherAllChecks = () => {
    // get all the checks
    data.list('checks', (err1, checks) => {
        if (!err1 && checks && checks.length > 0) {
            checks.forEach((check) => {
                // read the checkData
                data.read('checks', check, (err2, originalCheckData) => {
                    if (!err2 && originalCheckData) {
                        // pass the data to the check validator
                        worker.validateCheckData(parseJSON(originalCheckData));
                    } else {
                        console.log('Error: reading one of the checks data!');
                    }
                });
            });
        } else {
            console.log('Error: could not find any checks to process!');
        }
    });
};

// validate individual check data
worker.validateCheckData = (originalCheckData) => {
    const originalData = originalCheckData;
    if (originalCheckData && originalCheckData.id) {
        originalData.state =
            typeof originalCheckData.state === 'string' &&
            ['up', 'down'].indexOf(originalCheckData.state) > -1
                ? originalCheckData.state
                : 'down';

        originalData.lastChecked =
            typeof originalCheckData.lastChecked === 'number' && originalCheckData.lastChecked > 0
                ? originalCheckData.lastChecked
                : false;

        // pass to the next process
        worker.performCheck(originalData);
    } else {
        console.log('Error: check was invalid or not properly formatted!');
    }
};

// perform check
worker.performCheck = (originalCheckData) => {
    // prepare the initial check outcome
    let checkOutCome = {
        error: false,
        responseCode: false,
    };
    // mark the outcome has not been sent yet
    let outcomeSent = false;

    // parse the hostname & full url from original data
    const parsedUrl = url.parse(`${originalCheckData.protocol}://${originalCheckData.url}`, true);
    const hostName = parsedUrl.hostname;
    const { path } = parsedUrl;

    // construct the request
    const requestDetails = {
        protocol: `${originalCheckData.protocol}:`,
        hostname: hostName,
        method: originalCheckData.method.toUpperCase(),
        path,
        timeout: originalCheckData.timeoutSeconds * 1000,
    };

    const protocolToUse = originalCheckData.protocol === 'http' ? http : https;

    const req = protocolToUse.request(requestDetails, (res) => {
        // grab the status of the response
        const status = res.statusCode;
        // update the check outcome and pass to the next process
        checkOutCome.responseCode = status;
        if (!outcomeSent) {
            worker.processCheckOutcome(originalCheckData, checkOutCome);
            outcomeSent = true;
        }
    });

    req.on('error', (e) => {
        checkOutCome = {
            error: true,
            value: e,
        };
        // update the check outcome and pass to the next process
        if (!outcomeSent) {
            worker.processCheckOutcome(originalCheckData, checkOutCome);
            outcomeSent = true;
        }
    });

    req.on('timeout', () => {
        checkOutCome = {
            error: true,
            value: 'timeout',
        };
        // update the check outcome and pass to the next process
        if (!outcomeSent) {
            worker.processCheckOutcome(originalCheckData, checkOutCome);
            outcomeSent = true;
        }
    });

    // req send
    req.end();
};

// save check outcome to database and send to next process
worker.processCheckOutcome = (originalCheckData, checkOutCome) => {
    // check if check outcome is up or down
    const state =
        !checkOutCome.error &&
        checkOutCome.responseCode &&
        originalCheckData.successCodes.indexOf(checkOutCome.responseCode) > -1
            ? 'up'
            : 'down';

    // decide whether we should alert the user or not
    const alertWanted = !!(originalCheckData.lastChecked && originalCheckData.state !== state);

    // update the check data
    const newCheckData = originalCheckData;

    newCheckData.state = state;
    newCheckData.lastChecked = Date.now();

    // update the check to disk
    data.update('checks', newCheckData.id, newCheckData, (err) => {
        if (!err) {
            if (alertWanted) {
                // send the checkdata to next process
                worker.alertUserToStatusChange(newCheckData);
            } else {
                console.log('Alert is not needed as there is no state change!');
            }
        } else {
            console.log('Error trying to save check data of one of the checks!');
        }
    });
};

// send notification sms to user if state changes
worker.alertUserToStatusChange = (newCheckData) => {
    const msg = `Alert: Your check for ${newCheckData.method.toUpperCase()} ${
        newCheckData.protocol
    }://${newCheckData.url} is currently ${newCheckData.state}`;

    sendTwilioSms(newCheckData.userPhone, msg, (err) => {
        if (!err) {
            console.log(`User was alerted to a status change via SMS: ${msg}`);
        } else {
            console.log('There was a problem sending sms to one of the user!');
        }
    });
};

// timer to execute the worker process once per minute
worker.loop = () => {
    setInterval(() => {
        worker.gatherAllChecks();
    }, 1000 * 60);
};

// start the workers
worker.init = () => {
    // execute all the checks
    worker.gatherAllChecks();

    // call the loop so that checks continue
    worker.loop();
};

// export
module.exports = worker;
