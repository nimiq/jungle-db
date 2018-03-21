class Stats {
    constructor() {
        this.reset();
    }

    reset() {
        this._runs = 1;
        this._writes = 0;
        this._reads = 0;
        this._bytesWritten = 0;
        this._bytesRead = 0;
        this._readTime = 0;
        this._writeTime = 0;
    }

    get writes() {
        return this._writes;
    }

    get bytesWritten() {
        return this._bytesWritten;
    }

    get writeTime() {
        return this._writeTime;
    }

    get writesPerRun() {
        return this._writes / this._runs;
    }

    get bytesWrittenPerRun() {
        return this._bytesWritten / this._runs;
    }

    get writeTimePerRun() {
        return this._writeTime / this._runs;
    }

    get averageTimePerWrite() {
        return this.writeTime / this.writes;
    }

    get writingSpeed() {
        return this.bytesWritten / (this.writeTime / 1000); // divided by 1000 to convert ms to s
    }

    get reads() {
        return this._reads;
    }

    get bytesRead() {
        return this._bytesRead;
    }

    get readTime() {
        return this._readTime;
    }

    get readsPerRun() {
        return this._reads / this._runs;
    }

    get bytesReadPerRun() {
        return this._bytesRead / this._runs;
    }

    get readTimePerRun() {
        return this._readTime / this._runs;
    }

    get averageTimePerRead() {
        return this.readTime / this.reads;
    }

    get readingSpeed() {
        return this.bytesRead / (this.readTime / 1000); // divided by 1000 to convert ms to s
    }

    addRun() {
        this._runs++;
    }

    addWrite(bytesWritten, writeTime) {
        this._writes++;
        if (bytesWritten) {
            this._bytesWritten += bytesWritten;
        }
        if (writeTime) {
            this._writeTime += writeTime;
        }
    }

    addRead(bytesRead, readTime) {
        this._reads++;
        if (bytesRead) {
            this._bytesRead += bytesRead;
        }
        if (readTime) {
            this._readTime += readTime;
        }
    }

    addWrites(writes, totalBytes, totalTime) {
        this._writes += writes;
        if (totalBytes) {
            this._bytesWritten += totalBytes;
        }
        if (totalTime) {
            this._writeTime += totalTime;
        }
    }

    addReads(reads, totalBytes, totalTime) {
        this._reads += reads;
        if (totalBytes) {
            this._bytesRead += totalBytes;
        }
        if (totalTime) {
            this._readTime += totalTime;
        }
    }

    addWriteTime(writeTime) {
        this._writeTime += writeTime;
    }

    addReadTime(readTime) {
        this._readTime += readTime;
    }

    add(type, count, totalBytes, totalTime) {
        if (type === Stats.TYPE_WRITE) {
            this._writes += count;
            if (totalBytes) {
                this._bytesWritten += totalBytes;
            }
            if (totalTime) {
                this._writeTime += totalTime;
            }
        } else {
            this._reads += count;
            if (totalBytes) {
                this._bytesRead += totalBytes;
            }
            if (totalTime) {
                this._readTime += totalTime;
            }
        }
    }

    static averageStats(statsArray) {
        const averageStats = new Stats();
        averageStats._runs = statsArray.length;
        for (const stats of statsArray) {
            averageStats._writes += stats._writes;
            averageStats._reads += stats._reads;
            averageStats._bytesWritten += stats._bytesWritten;
            averageStats._bytesRead += stats._bytesRead;
            averageStats._readTime += stats._readTime;
            averageStats._writeTime += stats._writeTime;
        }
        return averageStats;
    }

    static _convertUnit(value, units, factor) {
        for (const unit of units) {
            if (value / factor > 1) {
                value /= factor;
            } else {
                return `${value.toFixed(3)}${unit}`;
            }
        }
        return `${value.toFixed(3)}${units[units.length-1]}`;
    }

    static _getByteString(bytes) {
        const factor = 1e3;
        const units = ['Bytes', 'KB', 'MB', 'GB'];
        return Stats._convertUnit(bytes, units, factor);
    }

    static _getTimeString(millis) {
        const oneMinute = 60 * 1000;
        if (millis < oneMinute) {
            // display the time as number + unit
            const micros = millis * 1000;
            const factor = 1e3;
            const units = ['µs', 'ms', 's'];
            return Stats._convertUnit(micros, units, factor);
        } else {
            // display the time as minutes:seconds.millis
            const minutes = Math.floor(millis / oneMinute);
            const seconds = ((millis / 1000) % 60).toFixed(3);
            return `${minutes}:${seconds<10? '0'+seconds : seconds}`;
        }
    }

    totalTime() {
        return `${this.writeTimePerRun + this.readTimePerRun},${Stats._getTimeString(this.writeTimePerRun + this.readTimePerRun)}`;
    }

    toString() {
        let result = '';
        if (this.writes > 0) {
            result += `Written: ${this.writesPerRun} entries, ${Stats._getByteString(this.bytesWrittenPerRun)}. `
                + `Total time ${Stats._getTimeString(this.writeTimePerRun)}, `
                + `time per entry ${Stats._getTimeString(this.averageTimePerWrite)}, `
                + `${Stats._getByteString(this.writingSpeed)}/s.`;
        }
        if (this.reads > 0) {
            result += (result? '\n' : '') + `Read: ${this.readsPerRun} entries, ${Stats._getByteString(this.bytesReadPerRun)}. `
                + `Total time ${Stats._getTimeString(this.readTimePerRun)}, `
                + `time per entry ${Stats._getTimeString(this.averageTimePerRead)}, `
                + `${Stats._getByteString(this.readingSpeed)}/s.`;
        }
        return (this._runs>1? `Average over ${this._runs} runs:\n` : '') + (result || 'No statistics collected');
    }
}
Stats.TYPE_READ = 0;
Stats.TYPE_WRITE = 1;

if (typeof(module) !== 'undefined') {
    module.exports = Stats;
}
