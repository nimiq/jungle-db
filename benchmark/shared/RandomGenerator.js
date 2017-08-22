class RandomGenerator {
    /**
     * @param {number} length
     * @returns {ArrayBuffer}
     */
    static generateRandomData(length) {
        // fill length bytes with random data. If applicable, write multiple bytes at once.
        let buffer;
        let maxNumber;
        let count;
        if (length % RandomGenerator.UINT32_BYTES === 0) {
            maxNumber = RandomGenerator.UINT32_MAX;
            count = length / RandomGenerator.UINT32_BYTES;
            buffer = new Uint32Array(count);
        } else if (length % RandomGenerator.UINT16_BYTES === 0) {
            maxNumber = RandomGenerator.UINT16_MAX;
            count = length / RandomGenerator.UINT16_BYTES;
            buffer = new Uint16Array(count);
        } else {
            maxNumber = RandomGenerator.UINT8_MAX;
            count = length / RandomGenerator.UINT8_BYTES;
            buffer = new Uint8Array(count);
        }
        for (let i=0; i<count; ++i) {
            buffer[i] = Math.round(Math.random() * maxNumber);
        }
        return buffer.buffer;
    }


    /**
     * @param {number} length
     * @returns {string}
     */
    static generateRandomString(length = 16) {
        return Array.from(new Uint8Array(RandomGenerator.generateRandomData(length)))
            .map(entry => RandomGenerator.VALID_CHARS.charAt(entry % RandomGenerator.VALID_CHARS.length))
            .join('');
    }


    /**
     * @param {Array} arr
     */
    static shuffle(arr) {
        for (let i = arr.length; i; i--) {
            let j = Math.floor(Math.random() * i);
            [arr[i - 1], arr[j]] = [arr[j], arr[i - 1]];
        }
    }


    /**
     * @param {Array} arr
     * @returns {*}
     */
    static getRandomEntry(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
}
RandomGenerator.UINT8_MAX = 255;
RandomGenerator.UINT8_BYTES = 1;
RandomGenerator.UINT16_MAX = 65535;
RandomGenerator.UINT16_BYTES = 2;
RandomGenerator.UINT32_MAX = 4294967295;
RandomGenerator.UINT32_BYTES = 4;
RandomGenerator.VALID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

if (typeof(module) !== 'undefined') {
    module.exports = RandomGenerator;
}
