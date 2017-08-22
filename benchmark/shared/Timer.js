class Timer {
    /**
     * Get the current time in milliseconds including fractions of milliseconds
     * @returns {number}
     */
    static currentTimeMillis() {
        if (Timer.CONTEXT === Timer.Contexts.BROWSER) {
            return performance.now();
        } else {
            const [seconds, nanos] = process.hrtime();
            return seconds * Timer.MILLIS_PER_SECONDS + nanos / Timer.NANOS_PER_MILLI;
        }
    }

    static elapsedMillis(startTime) {
        return Timer.currentTimeMillis() - startTime;
    }
}
Timer.Contexts = {
    BROWSER: 0,
    NODEJS: 1
};
Timer.CONTEXT = typeof(window)!=='undefined'? Timer.Contexts.BROWSER : Timer.Contexts.NODEJS;
Timer.NANOS_PER_MILLI = 1e6;
Timer.MILLIS_PER_SECONDS = 1e3;

if (typeof(module) !== 'undefined') {
    module.exports = Timer;
}
