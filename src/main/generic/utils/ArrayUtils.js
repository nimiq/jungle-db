/**
 * Returns an iterator over an array in a specific direction.
 * It does *not* handle or reflect changes of the array while iterating it.
 * @memberOf Array
 * @param {boolean} ascending Whether to traverse the array in ascending direction.
 * @returns {{next:function():*, peek:function():*, hasNext:function():boolean}} An iterator.
 */
Object.defineProperty(Array.prototype, 'iterator', { value:
    function(ascending=true) {
        let nextIndex = ascending ? 0 : this.length-1;

        return {
            next: () => {
                return nextIndex >= 0 && nextIndex < this.length ?
                    this[ascending ? nextIndex++ : nextIndex--] : undefined;
            },
            hasNext: () => {
                return nextIndex >= 0 && nextIndex < this.length;
            },
            peek: () => {
                return nextIndex >= 0 && nextIndex < this.length ?
                    this[nextIndex] : undefined;
            }
        };
    }
});
