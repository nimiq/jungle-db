class BufferUtils {
     /**
     * @param {*} buffer
     * @return {string}
     */
    static toBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    /**
     * @param {string} base64
     * @return {SerialBuffer}
     */
    static fromBase64(base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }
}

Class.register(BufferUtils);
