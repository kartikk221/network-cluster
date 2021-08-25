/**
 * Writes values from focus object onto base object.
 *
 * @param {Object} obj1 Base Object
 * @param {Object} obj2 Focus Object
 */
function wrap_object(obj1, obj2) {
    Object.keys(obj2).forEach((key) => {
        let value = obj2[key];
        if (typeof value == 'object') {
            if (obj1[key] === null || typeof obj1[key] !== 'object') obj1[key] = {};
            wrap_object(obj1[key], obj2[key]);
        } else {
            obj1[key] = value;
        }
    });
}

/**
 * This method can be used to create an asynchronous forEach loop which is throttled and only
 * iterates over the specified number of items synchronously before flushing event loop.
 *
 * @param {Array} items Example: ['some', 'word', 'word2']
 * @param {*} per_eloop The number of items to process sycnhronously before breaking for next event loop cycle.
 * @param {*} handler Example: (item) => { (Your Code); }
 * @returns {Promise} Resolves once looping is complete over all items.
 */
function throttled_for_each(items, per_eloop = 300, handler, cursor = 0, final) {
    // Return master promise on first call
    if (final == undefined)
        return new Promise((resolve, rej) =>
            throttled_for_each(items, per_eloop, handler, cursor, resolve)
        );

    // Determine upper bound and run a synchronous for loop to complete partial loop iteration
    let upper_bound = cursor + per_eloop >= items.length ? items.length : cursor + per_eloop;
    for (let i = cursor; i < upper_bound; i++) {
        handler(items[i]);
    }

    // Move cursor to upper bound and flush event loop by recalling self with adjusted cursor
    cursor = upper_bound;
    if (cursor < items.length)
        return setTimeout(
            (a, b, c, d, e) => throttled_for_each(a, b, c, d, e),
            0,
            items,
            per_eloop,
            handler,
            cursor,
            final
        );

    return final();
}

module.exports = {
    wrap_object,
    throttled_for_each,
};
