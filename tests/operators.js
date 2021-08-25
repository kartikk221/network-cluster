function log(logger = 'SYSTEM', message) {
    let dt = new Date();
    let timeStamp = dt
        .toLocaleString([], { hour12: true, timeZone: 'America/New_York' })
        .replace(', ', ' ')
        .split(' ');
    timeStamp[1] += ':' + dt.getMilliseconds().toString().padStart(3, '0') + 'ms';
    timeStamp = timeStamp.join(' ');
    console.log(`[${timeStamp}][${logger}] ${message}`);
}

function random_string(length = 7) {
    var result = [];
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
    }
    return result.join('');
}

function assert_log(category, assertion_name, assertion) {
    try {
        if (assertion() === true) {
            log(category, 'Verified ' + assertion_name);
        } else {
            throw new Error(
                `Failed To Verify ${assertion_name} @ ${category} -> ${assertion.toString()}`
            );
        }
    } catch (error) {
        console.log(error);
        throw new Error(
            `Error Verifying ${assertion_name} @ ${category} -> ${assertion.toString()}`
        );
    }
}

function async_wait(delay = 0) {
    return new Promise((res, rej) => setTimeout(res, delay));
}

function wait_until(condition, check_interval = 100, timeout = Infinity, res, rej) {
    // Wrap initial call in a promise
    if (res == undefined || rej == undefined)
        return new Promise((resolve, reject) =>
            wait_until(condition, check_interval, timeout, resolve, reject)
        );

    // Perform condition check
    let check_attempt = condition();
    if (check_attempt) return res(check_attempt);

    timeout -= check_interval;

    if (timeout > 0) {
        setTimeout(
            (a, b, c, d, e) => wait_until(a, b, c, d, e),
            check_interval,
            condition,
            check_interval,
            timeout,
            res,
            rej
        );
    } else {
        return rej('TIMED_OUT');
    }
}

module.exports = {
    log,
    random_string,
    assert_log,
    async_wait,
    wait_until,
};
