module.exports = {};

const atob = require('atob');
const btoa = require('btoa');

const Class = {
    register: clazz => {
        module.exports[clazz.prototype.constructor.name] = clazz;
    }
};

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

/*
 B+ Tree processing
 Version 2.0.0
 Based on code by Graham O'Neill, April 2013
 Modified by Pascal Berrang, July 2017

 ------------------------------------------------------------------------------

 Copyright (c) 2017 Graham O'Neill & Pascal Berrang

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

 ------------------------------------------------------------------------------

 */

/**
 * This abstract class describes a general Node within a B+Tree.
 * Each node owns an array of keys and has an id.
 */
class Node {
    /**
     * Creates a new node.
     * @param {Array.<*>} [keys] Optional array of keys (default is empty).
     */
    constructor(keys = []) {
        this._keys = keys;
    }

    /**
     * @type {Array.<*>} The array of keys.
     */
    get keys() {
        return this._keys;
    }
}
Class.register(Node);

/**
 * A Leaf Node in the B+Tree.
 * @extends Node
 */
class LeafNode extends Node {
    /**
     * Creates a new leaf node.
     * Leaf nodes store key value pairs,
     * hence the keys and records arrays are required to have the same length.
     * In an index, the keys array usually stores the secondary key,
     * while the records array stores the corresponding primary key.
     * The B+Tree ensures that the items in the keys array are ordered ascending.
     * @param {Array.<*>} [keys] Optional array of keys (default is empty).
     * @param {Array.<*>} [records] Optional array of records (default is empty).
     */
    constructor(keys=[], records=[]) {
        if (keys.length !== records.length) {
            throw new Error('Keys and records must have the same length');
        }
        super(keys);
        this._records = records;
        this.prevLeaf = null;
        this.nextLeaf = null;
    }

    /**
     * @type {Array.<*>} The list of records associated with the keys.
     */
    get records() {
        return this._records;
    }

    /**
     * Returns whether this is a leaf node.
     * @returns {boolean} True, since it is a leaf node.
     */
    isLeaf() {
        return true;
    }

    /**
     * Searches the node for a specific key and returns its position if found.
     * The near parameter allows to find either an exact match or the first key
     * greater/less or equal than the specified key.
     *
     * Since the B+tree limits the number of records per leaf node,
     * the complexity of this method is in O([order/2, order-1]).
     * @param {*} key The key to look for.
     * @param {BTree.NEAR_MODE} near
     * @returns {number} The index of the match if found, -1 otherwise.
     */
    getItem(key, near) {
        const keys = this._keys;
        // Find item matching the query.
        if (near === BTree.NEAR_MODE.GE) {
            for (let i=0, len=keys.length; i<len; ++i) {
                if (ComparisonUtils.compare(key, keys[i]) <= 0) return i;
            }
        } else if (near === BTree.NEAR_MODE.LE) {
            for (let i=keys.length - 1; i>=0; --i) {
                if (ComparisonUtils.compare(key, keys[i]) >= 0) return i;
            }
        } else {
            for (let i=0, len=keys.length; i<len; ++i) {
                if (ComparisonUtils.equals(key, keys[i])) return i;
            }
        }
        return -1;
    }

    /**
     * Adds a key, record pair to this leaf node.
     * By definition, the key is inserted into the keys of this leaf node,
     * such that the ascending order of the keys is maintained.
     * @param {*} key The key to insert.
     * @param {*} record The corresponding record to insert.
     * @returns {number} The position it was inserted at.
     */
    addKey(key, record) {
        let insertPos = this._keys.length;
        // Find position to insert.
        for (let i=0, len=insertPos; i<len; ++i) {
            // Key already exists.
            if (ComparisonUtils.equals(key, this._keys[i])) {
                return -1;
            }
            // Update potential position.
            if (ComparisonUtils.compare(key, this._keys[i]) <= 0) {
                insertPos = i;
                break;
            }
        }
        // Insert key/record.
        this._keys.splice(insertPos, 0, key);
        this._records.splice(insertPos, 0, record);
        return insertPos;
    }

    /**
     * Splits the leaf node into two nodes (this + one new node).
     * The resulting nodes should have almost equal sizes.
     * The new node will return the upper half of the previous entries.
     * @returns {LeafNode} The new leaf node containing the upper half of entries.
     */
    split() {
        const mov = Math.floor(this._keys.length/2);
        const newKeys = [], newRecords = [];
        for (let i = 0; i < mov; ++i) {
            newKeys.unshift(this._keys.pop());
            newRecords.unshift(this._records.pop());
        }
        const newL = new LeafNode(newKeys, newRecords);
        newL.prevLeaf = this;
        newL.nextLeaf = this.nextLeaf;
        if (this.nextLeaf !== null) this.nextLeaf.prevLeaf = newL;
        this.nextLeaf = newL;
        return newL;
    }

    /**
     * Merges two leaf nodes together (this + frNod).
     * The given node frNod is no longer connected afterwards.
     * @param {LeafNode} frNod The node to merge with.
     * @param {InnerNode} paNod The parent node that needs to be updated.
     * @param {*} frKey The key of the old leaf in the parent.
     */
    merge(frNod, paNod, frKey) {
        // Append keys/records.
        for (let i=0, len=frNod.keys.length; i<len; ++i) {
            this._keys.push(frNod.keys[i]);
            this._records.push(frNod.records[i]);
        }
        // Update leaf pointers.
        this.nextLeaf = frNod.nextLeaf;
        if (frNod.nextLeaf !== null) frNod.nextLeaf.prevLeaf = this;
        frNod.prevLeaf = null;
        frNod.nextLeaf = null;
        // Update parent: find position of old leaf.
        let pos = paNod.keys.length-1;
        for (let i=pos; i>=0; --i) {
            if (ComparisonUtils.equals(paNod.keys[i], frKey)) {
                pos = i;
                break;
            }
        }
        // Delete old key from parent.
        paNod.keys.splice(pos, 1);
        paNod.nodePointers.splice(pos+1, 1);
    }

}
Class.register(LeafNode);

/**
 * An Inner Node in the B+Tree.
 * @extends Node
 */
class InnerNode extends Node {
    /**
     * Creates a new inner node.
     * The only key values that appear in the internal nodes are the first key values from each leaf,
     * with the exception of the key from the very first leaf which isn't included.
     * Each key value that appears in the internal nodes only appears once.
     * @param {Array.<*>} [keys] The first key of each child node (except for the first one).
     * @param {Array.<Node>} [nodePointers] The pointers to the child nodes.
     */
    constructor(keys=[], nodePointers=[]) {
        super(keys);
        this._nodePointers = nodePointers;
    }

    /**
     * Returns whether this is a leaf node.
     * @returns {boolean} False, since it is an inner node.
     */
    isLeaf() {
        return false;
    }

    /**
     * @type {Array.<Node>} The pointers to the children.
     */
    get nodePointers() {
        return this._nodePointers;
    }

    /**
     * Searches the node for a specific key and returns the matching child's position.
     *
     * Since the B+tree limits the number of records per leaf node,
     * the complexity of this method is in O([(order-1)/2, order-1]).
     * @param {*} key The key to look for.
     * @returns {number} The index of the match.
     */
    getItem(key) {
        const len = this._keys.length;
        for (let i=0; i<len; ++i) {
            if (key < this._keys[i]) return i;
        }
        return this._keys.length;
    }

    /**
     * Adds a key corresponding to a new child node to this inner node.
     * By definition, the key is inserted into the keys of this leaf node,
     * such that the ascending order of the keys is maintained.
     * @param {*} key The key to insert.
     * @param {Node} ptrL The pointer to the corresponding child node.
     * @param {Node} ptrR The pointer to the node right of the child node.
     * @returns {number} The position it was inserted at.
     */
    addKey(key, ptrL, ptrR) {
        const len = this._keys.length;
        let insertPos = len;
        // Find position to insert.
        for (let i=0; i<len; ++i) {
            if (ComparisonUtils.compare(key, this._keys[i]) <= 0) {
                insertPos = i;
                break;
            }
        }
        // Update keys and pointers.
        this._keys.splice(insertPos, 0, key);
        this._nodePointers.splice(insertPos, 0, ptrL);
        this._nodePointers[insertPos+1] = ptrR;
    }

    /**
     * Splits the node into two nodes (this + one new node).
     * The resulting nodes should have almost equal sizes.
     * The new node will return the upper half of the previous entries.
     * @returns {InnerNode} The new inner node containing the upper half of entries.
     */
    split() {
        const mov = Math.ceil(this._keys.length/2) - 1;
        const newNodePointers = [this._nodePointers.pop()];
        const newKeys = [];
        for (let i=mov-1; i>=0; --i) {
            newKeys.unshift(this._keys.pop());
            newNodePointers.unshift(this._nodePointers.pop());
        }
        return new InnerNode(newKeys, newNodePointers);
    }

    /**
     * Merges two inner nodes together (this + frNod).
     * The given node frNod is no longer connected afterwards.
     * @param {InnerNode} frNod The node to merge with.
     * @param {InnerNode} paNod The parent node that needs to be updated.
     * @param {number} paItm The position in the parent.
     */
    merge(frNod, paNod, paItm) {
        const del = paNod.keys[paItm];
        // Add key from parent.
        this._keys.push(del);
        // Add keys and nodePointers from merged node.
        for (let i=0, len=frNod.keys.length; i<len; ++i) {
            this._keys.push(frNod.keys[i]);
            this._nodePointers.push(frNod.nodePointers[i]);
        }
        // Add last nodePointer as well.
        this._nodePointers.push(frNod.nodePointers[frNod.nodePointers.length-1]);
        paNod.keys.splice(paItm, 1); // Delete old key from parent.
        paNod.nodePointers.splice(paItm+1, 1); // Delete old pointer from parent.
        return del;
    }
}
Class.register(InnerNode);

/**
 * The actual BTree implementation.
 * @implements {IBTree}
 */
class BTree {
    /**
     * Creates a new BTree of a given order.
     * The order specifies how many entries a single node can contain.
     * A leaf node generally contains [order/2, order-1] entries,
     * while an inner node contains [(order-1)/2, order-1] entries.
     * @param {number} order The order of the tree.
     */
    constructor(order=7) {
        this._root = new LeafNode();
        this._maxkey = order-1;
        this._minkyl = Math.floor(order/2);
        this._minkyn = Math.floor(this._maxkey/2);
        this._leaf = null;
        this._item = -1;

        this._key = null;
        this._record = null;
        this._length = 0;
        this._eof = true;
        this._found = false;
    }

    /**
     * The total number of records.
     * Note that if the record is a list/set of records, these are not counted.
     * @type {number}
     */
    get length() {
        return this._length;
    }

    /**
     * The current key as returned by any operation.
     * It is null if there is no matching record.
     * @type {*}
     */
    get currentKey() {
        return this._key;
    }

    /**
     * The current record as returned by any operation.
     * It is null if there is no matching record.
     * @type {*}
     */
    get currentRecord() {
        return this._record;
    }

    /**
     * Inserts a new key-record pair into the BTree, if there is no entry for that key.
     * The current record and current key are set to the new entry in case of success
     * or the existing entry if present.
     * @param {*} key The unique key for the record.
     * @param {*} rec The record associated with the key.
     * @returns {boolean} True if the record was inserted, false if there was already a record with that key.
     */
    insert(key, rec) {
        const stack = [];
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            stack.push(this._leaf);
            this._item = this._leaf.getItem(key);
            this._leaf = this._leaf.nodePointers[this._item];
        }
        this._item = this._leaf.addKey(key, rec);
        this._key = key;
        this._eof = false;
        if (this._item === -1) {
            this._found = true;
            this._item = this._leaf.getItem(key, false);
            this._record = this._leaf.records[this._item];
        } else {
            this._found = false;
            this._record = rec;
            this._length++;
            if (this._leaf.keys.length > this._maxkey) {
                let pL = this._leaf;
                let pR = this._leaf.split();
                let ky = pR.keys[0];
                this._item = this._leaf.getItem(key, false);
                if (this._item === -1) {
                    this._leaf = this._leaf.nextLeaf;
                    this._item = this._leaf.getItem(key, false);
                }
                while (true) { // eslint-disable-line no-constant-condition
                    if (stack.length === 0) {
                        const newN = new InnerNode();
                        newN.keys[0] = ky;
                        newN.nodePointers[0] = pL;
                        newN.nodePointers[1] = pR;
                        this._root = newN;
                        break;
                    }
                    const nod = stack.pop();
                    nod.addKey(ky, pL, pR);
                    if (nod.keys.length <= this._maxkey) break;
                    pL = nod;
                    pR = nod.split();
                    ky = nod.keys.pop();
                }
            }
        }
        return (!this._found);
    }

    /**
     * Removes a key-record pair from the BTree.
     * In case of successful deletion, the current record and key will be set to the next entry greater or equal.
     * If no record was found, they will be reset to null.
     * @param {*} key The unique key for the record.
     * @returns {boolean} True if the record was deleted, false if there is no such record.
     */
    remove(key) {
        if (typeof key === 'undefined') {
            if (this._item === -1) {
                this._eof = true;
                this._found = false;
                return false;
            }
            key = this._leaf.keys[this._item];
        }
        this._del(key);
        if (!this._found) {
            this._item = -1;
            this._eof = true;
            this._key = null;
            this._record = null;
        } else {
            this.seek(key, BTree.NEAR_MODE.GE);
            this._found = true;
        }
        return (this._found);
    }

    /**
     * Searches the tree for a specific key and advances the current key/record pointers if found.
     * By default only an exact key match is found, but the near parameter also allows to advance to the next entry
     * greater/less or equal than the specified key.
     * @param {*} key The key to look for.
     * @param {BTree.NEAR_MODE} [near] Optional parameter, specifies to look for a key k' =/≤/≥ key.
     * @returns {boolean} True if such a key was found, false otherwise.
     */
    seek(key, near=BTree.NEAR_MODE.NONE) {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._item = this._leaf.getItem(key);
            this._leaf = this._leaf.nodePointers[this._item];
        }
        this._item = this._leaf.getItem(key, near);
        if (near === BTree.NEAR_MODE.GE && this._item === -1 && this._leaf.nextLeaf !== null) {
            this._leaf = this._leaf.nextLeaf;
            this._item = 0;
        }
        if (near === BTree.NEAR_MODE.LE && this._item === -1 && this._leaf.prevLeaf !== null) {
            this._leaf = this._leaf.prevLeaf;
            this._item = this._leaf.records.length - 1;
        }
        if (this._item === -1) {
            this._eof = true;
            this._key = null;
            this._found = false;
            this._record = null;
        } else {
            this._eof = false;
            this._found = (this._leaf.keys[this._item] === key);
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (!this._eof);
    }

    /**
     * Advances the current key/record pointers by a given number of steps.
     * Default is advancing by 1, which means the next record (the new key will thus be the next larger key).
     * -1 means the previous record (the new key will thus be the next smaller key).
     * @param {number} [cnt] The number of records to advance (may be negative).
     * @returns {boolean} True if there is a record to advance to, false otherwise.
     */
    skip(cnt = 1) {
        if (typeof cnt !== 'number') cnt = 1;
        if (this._item === -1 || this._leaf === null) this._eof = true;
        if (cnt > 0) {
            while (!this._eof && this._leaf.keys.length - this._item - 1 < cnt) {
                cnt = cnt - this._leaf.keys.length + this._item;
                this._leaf = this._leaf.nextLeaf;
                if (this._leaf === null) {
                    this._eof = true;
                } else {
                    this._item = 0;
                }
            }
            if (!this._eof) this._item = this._item + cnt;
        } else {
            cnt = -cnt;
            while (!this._eof && this._item < cnt) {
                cnt = cnt - this._item - 1;
                this._leaf = this._leaf.prevLeaf;
                if (this._leaf === null) {
                    this._eof = true;
                } else {
                    this._item = this._leaf.keys.length-1;
                }
            }
            if (!this._eof) {
                this._item = this._item - cnt;
            }
        }
        if (this._eof) {
            this._item = -1;
            this._found = false;
            this._key = null;
            this._record = null;
        } else {
            this._found = true;
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (this._found);
    }

    /**
     * Jumps to the cnt entry starting from the smallest key (i.e., leftmost leaf, first entry) if cnt > 0.
     * If cnt < 0, it jumps to the cnt entry starting from the largest key (i.e., rightmost leaf, last entry).
     * @param {number} [cnt] The record to jump to (may be negative).
     * @returns {boolean} True if there is a record to jump to, false otherwise.
     */
    goto(cnt) {
        if (cnt < 0) {
            this.goBottom();
            if (!this._eof) this.skip(cnt+1);
        } else {
            this.goTop();
            if (!this._eof) this.skip(cnt-1);
        }
        return (this._found);
    }

    /**
     * Returns the index of the current entry (key/record) in a sorted list of all entries.
     * For the B+ Tree, this is done by traversing the leafs from the leftmost leaf, first entry
     * until the respective key is found.
     * @returns {number} The entry position.
     */
    keynum() {
        if (this._leaf === null || this._item === -1) return -1;
        let cnt = this._item + 1;
        let ptr = this._leaf;
        while (ptr.prevLeaf !== null) {
            ptr = ptr.prevLeaf;
            cnt += ptr.keys.length;
        }
        return cnt;
    }

    /**
     * Jumps to the smallest key's entry (i.e., leftmost leaf, first entry).
     * False will only be returned if the tree is completely empty.
     * @returns {boolean} True if there is such an entry, false otherwise.
     */
    goTop() {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._leaf = this._leaf.nodePointers[0];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this._eof = true;
            this._found = false;
            this._key = null;
            this._record = null;
        } else {
            this._item = 0;
            this._eof = false;
            this._found = true;
            this._key = this._leaf.keys[0];
            this._record = this._leaf.records[0];
        }
        return (this._found);
    }

    /**
     * Jumps to the largest key's entry (i.e., rightmost leaf, last entry).
     * False will only be returned if the tree is completely empty.
     * @returns {boolean} True if there is such an entry, false otherwise.
     */
    goBottom() {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._leaf = this._leaf.nodePointers[this._leaf.nodePointers.length-1];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this._eof = true;
            this._found = false;
            this._key = null;
            this._record = null;
        } else {
            this._item = this._leaf.keys.length-1;
            this._eof = false;
            this._found = true;
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (this._found);
    }

    /**
     * Rebuilds/balances the whole tree.
     * Inserting and deleting keys into a tree will result
     * in some leaves and nodes having the minimum number of keys allowed.
     * This routine will ensure that each leaf and node has as many keys as possible,
     * resulting in a denser, flatter tree.
     * False is only returned if the tree is completely empty.
     * @returns {boolean} True if the tree is not completely empty.
     */
    pack() {
        let len;
        let i;
        this.goTop(0);
        if (this._leaf === this._root) return false;

        // Pack leaves
        let toN = new LeafNode();
        let toI = 0;
        let frN = this._leaf;
        let frI = 0;
        let parKey = [];
        let parNod = [];
        while (true) { // eslint-disable-line no-constant-condition
            toN.keys[toI] = frN.keys[frI];
            toN.records[toI] = frN.records[frI];
            if (toI === 0) parNod.push(toN);
            if (frI === frN.keys.length-1) {
                if (frN.nextLeaf === null) break;
                frN = frN.nextLeaf;
                frI = 0;
            } else {
                frI++;
            }
            if (toI === this._maxkey-1) {
                const tmp = new LeafNode();
                toN.nextLeaf = tmp;
                tmp.prevLeaf = toN;
                toN = tmp;
                toI = 0;
            } else {
                toI++;
            }
        }
        let mov = this._minkyl - toN.keys.length;
        frN = toN.prevLeaf;
        if (mov > 0 && frN !== null) {
            // Insert new keys/records.
            for (i = mov-1; i>=0; --i) {
                toN.keys.unshift(frN.keys.pop());
                toN.records.unshift(frN.records.pop());
            }
        }
        for (i=1, len=parNod.length; i<len; ++i) {
            parKey.push(parNod[i].keys[0]);
        }
        parKey[parKey.length] = null;

        // Rebuild nodes
        let kidKey, kidNod;
        while (parKey[0] !== null) {
            kidKey = parKey;
            kidNod = parNod;
            parKey = [];
            parNod = [];
            toI = this._maxkey + 1;
            i = 0;
            len = kidKey.length;
            for (; i<len; i++) {
                if (toI > this._maxkey) {
                    toN = new InnerNode();
                    toI = 0;
                    parNod.push(toN);
                }
                toN.keys[toI] = kidKey[i];
                toN.nodePointers[toI] = kidNod[i];
                toI++;
            }
            mov = this._minkyn - toN.keys.length + 1;
            if (mov > 0 && parNod.length > 1) {
                frN = parNod[parNod.length-2];
                for (i = mov-1; i>=0; --i) {
                    toN.keys.unshift(frN.keys.pop());
                    toN.nodePointers.unshift(frN.nodePointers.pop());
                }
            }
            i = 0;
            len = parNod.length;
            for (; i<len; ++i) {
                parKey.push(parNod[i].keys.pop());
            }
        }
        this._root = parNod[0];
        this.goTop();
        return (this._found);
    }

    /**
     * Internal helper method to delete a key from the tree.
     * @param {*} key The unique key for the record.
     * @private
     */
    _del(key) {
        const stack = [];
        let parNod = null;
        let parPtr = -1;
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            stack.push(this._leaf);
            parNod = this._leaf;
            parPtr = this._leaf.getItem(key);
            this._leaf = this._leaf.nodePointers[parPtr];
        }
        this._item = this._leaf.getItem(key,false);

        // Key not in tree
        if (this._item === -1) {
            this._found = false;
            return;
        }
        this._found = true;

        // Delete key from leaf
        this._leaf.keys.splice(this._item, 1);
        this._leaf.records.splice(this._item, 1);
        this._length--;

        // Leaf still valid: done
        if (this._leaf === this._root) {
            return;
        }
        if (this._leaf.keys.length >= this._minkyl) {
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0]);
            return;
        }
        let delKey;

        // Steal from left sibling if possible
        let sibL = (parPtr === 0) ? null : parNod.nodePointers[parPtr - 1];
        if (sibL !== null && sibL.keys.length > this._minkyl) {
            delKey = (this._item === 0) ? key : this._leaf.keys[0];
            this._leaf.keys.unshift(sibL.keys.pop());
            this._leaf.records.unshift(sibL.records.pop());
            BTree._fixNodes(stack, delKey, this._leaf.keys[0]);
            return;
        }

        // Steal from right sibling if possible
        let sibR = (parPtr === parNod.keys.length) ? null : parNod.nodePointers[parPtr + 1];
        if (sibR !== null && sibR.keys.length > this._minkyl) {
            this._leaf.keys.push(sibR.keys.shift());
            this._leaf.records.push(sibR.records.shift());
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0]);
            BTree._fixNodes(stack, this._leaf.keys[this._leaf.keys.length-1], sibR.keys[0]);
            return;
        }

        // Merge left to make one leaf
        if (sibL !== null) {
            delKey = (this._item === 0) ? key : this._leaf.keys[0];
            sibL.merge(this._leaf, parNod, delKey);
            this._leaf = sibL;
        } else {
            delKey = sibR.keys[0];
            this._leaf.merge(sibR, parNod, delKey);
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0]);
        }

        if (stack.length === 1 && parNod.keys.length === 0) {
            this._root = this._leaf;
            return;
        }

        let curNod = stack.pop();
        let parItm;

        // Update all nodes
        while (curNod.keys.length < this._minkyn && stack.length > 0) {

            parNod = stack.pop();
            parItm = parNod.getItem(delKey);

            // Steal from right sibling if possible
            sibR = (parItm === parNod.keys.length) ? null : parNod.nodePointers[parItm+1];
            if (sibR !== null && sibR.keys.length > this._minkyn) {
                curNod.keys.push(parNod.keys[parItm]);
                parNod.keys[parItm] = sibR.keys.shift();
                curNod.nodePointers.push(sibR.nodePointers.shift());
                break;
            }

            // Steal from left sibling if possible
            sibL = (parItm === 0) ? null : parNod.nodePointers[parItm-1];
            if (sibL !== null && sibL.keys.length > this._minkyn) {
                curNod.keys.unshift(parNod.keys[parItm-1]);
                parNod.keys[parItm-1] = sibL.keys.pop();
                curNod.nodePointers.unshift(sibL.nodePointers.pop());
                break;
            }

            // Merge left to make one node
            if (sibL !== null) {
                delKey = sibL.merge(curNod, parNod, parItm-1);
                curNod = sibL;
            } else if (sibR !== null) {
                delKey = curNod.merge(sibR, parNod, parItm);
            }

            // Next level
            if (stack.length === 0 && parNod.keys.length === 0) {
                this._root = curNod;
                break;
            }
            curNod = parNod;
        }
    }

    /**
     * Internal helper method to replace a key within the whole stack.
     * @param {Array.<Node>} stk The stack of nodes to examine.
     * @param {*} frKey The key to replace.
     * @param {*} toKey The new key to put in place.
     * @private
     */
    static _fixNodes(stk, frKey, toKey) {
        let keys, lvl = stk.length, mor = true;
        do {
            lvl--;
            keys = stk[lvl].keys;
            for (let i=keys.length-1; i>=0; --i) {
                if (keys[i] === frKey) {
                    keys[i] = toKey;
                    mor = false;
                    break;
                }
            }
        } while (mor && lvl>0);
    }

    /**
     * Advances to the smallest key k', such that either k' > lower (if lowerOpen) or k' ≥ lower (if !lowerOpen).
     * If lower is undefined, jump to the smallest key's entry.
     * @param {*} lower A lower bound on the key or undefined.
     * @param {boolean} [lowerOpen] Whether lower may be included or not.
     * @returns {boolean} True if there is such an entry, false otherwise.
     */
    goToLowerBound(lower, lowerOpen=false) {
        // TODO: it might be that there is no exact key match, then we do not need to skip!
        if (lower !== undefined) {
            let success = this.seek(lower, BTree.NEAR_MODE.GE);
            if (success && lowerOpen && ComparisonUtils.equals(lower, this.currentKey)) {
                success = this.skip();
            }
            return success;
        }
        return this.goTop();
    }

    /**
     * Advances to the largest key k', such that either k' < upper (if upperOpen) or k' ≤ upper (if !upperOpen).
     * If upper is undefined, jump to the largest key's entry.
     * @param {*} upper An upper bound on the key or undefined.
     * @param {boolean} [upperOpen] Whether upper may be included or not.
     * @returns {boolean} True if there is such an entry, false otherwise.
     */
    goToUpperBound(upper, upperOpen=false) {
        // TODO: it might be that there is no exact key match, then we do not need to skip!
        if (upper !== undefined) {
            let success = this.seek(upper, BTree.NEAR_MODE.LE);
            if (success && upperOpen && ComparisonUtils.equals(upper, this.currentKey)) {
                success = this.skip(-1);
            }
            return success;
        }
        return this.goBottom();
    }
}
/**
 * Allows to specify the seek method of a BTree.
 * @enum {number}
 */
BTree.NEAR_MODE = {
    NONE: 0,
    LE: 1,
    GE: 2
};
Class.register(BTree);

class BufferUtils {
    static _codePointTextDecoder(u8) {
        if (typeof TextDecoder === 'undefined') throw new Error('TextDecoder not supported');
        if (BufferUtils._ISO_8859_15_DECODER === null) throw new Error('TextDecoder does not supprot iso-8859-15');
        if (BufferUtils._ISO_8859_15_DECODER === undefined) {
            try {
                BufferUtils._ISO_8859_15_DECODER = new TextDecoder('iso-8859-15');
            } finally {
                BufferUtils._ISO_8859_15_DECODER = null;
            }
        }
        return BufferUtils._ISO_8859_15_DECODER.decode(u8)
            .replace('€', '¤').replace('Š', '¦').replace('š', '¨').replace('Ž', '´')
            .replace('ž', '¸').replace('Œ', '¼').replace('œ', '½').replace('Ÿ', '¾');
    }

    static _tripletToBase64(num) {
        return BufferUtils._BASE64_LOOKUP[num >> 18 & 0x3F] + BufferUtils._BASE64_LOOKUP[num >> 12 & 0x3F] + BufferUtils._BASE64_LOOKUP[num >> 6 & 0x3F] + BufferUtils._BASE64_LOOKUP[num & 0x3F];
    }

    static _base64encodeChunk(u8, start, end) {
        let tmp;
        const output = [];
        for (let i = start; i < end; i += 3) {
            tmp = ((u8[i] << 16) & 0xFF0000) + ((u8[i + 1] << 8) & 0xFF00) + (u8[i + 2] & 0xFF);
            output.push(BufferUtils._tripletToBase64(tmp));
        }
        return output.join('');
    }

    static _base64fromByteArray(u8) {
        let tmp;
        const len = u8.length;
        const extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
        let output = '';
        const parts = [];
        const maxChunkLength = 16383; // must be multiple of 3

        // go through the array every three bytes, we'll deal with trailing stuff later
        for (let i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
            parts.push(BufferUtils._base64encodeChunk(u8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)));
        }

        // pad the end with zeros, but make sure to not forget the extra bytes
        if (extraBytes === 1) {
            tmp = u8[len - 1];
            output += BufferUtils._BASE64_LOOKUP[tmp >> 2];
            output += BufferUtils._BASE64_LOOKUP[(tmp << 4) & 0x3F];
            output += '==';
        } else if (extraBytes === 2) {
            tmp = (u8[len - 2] << 8) + (u8[len - 1]);
            output += BufferUtils._BASE64_LOOKUP[tmp >> 10];
            output += BufferUtils._BASE64_LOOKUP[(tmp >> 4) & 0x3F];
            output += BufferUtils._BASE64_LOOKUP[(tmp << 2) & 0x3F];
            output += '=';
        }

        parts.push(output);

        return parts.join('');
    }

    /**
     * @param {*} buffer
     * @return {string}
     */
    static toBase64(buffer) {
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined') {
            return Buffer.from(buffer).toString('base64');
        } else if (typeof TextDecoder !== 'undefined' && BufferUtils._ISO_8859_15_DECODER !== null) {
            try {
                return btoa(BufferUtils._codePointTextDecoder(new Uint8Array(buffer)));
            } catch (e) {
                // Disabled itself
            }
        }

        return BufferUtils._base64fromByteArray(new Uint8Array(buffer));
    }

    /**
     * @param {string} base64
     * @return {Uint8Array}
     */
    static fromBase64(base64) {
        if (!(/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(base64))) {
            throw new Error('Invalid base64');
        }
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    }

    /**
     * @param {*} buffer
     * @return {string}
     */
    static toBase64lex(buffer) {
        const base64 = BufferUtils.toBase64(buffer);
        let base64lex = '';
        for (let i = 0; i < base64.length; i++) {
            base64lex += BufferUtils.BASE64_TO_BASE64_LEX[base64[i]];
        }
        return base64lex;
    }

    /**
     * @param {string} base64lex
     * @return {Uint8Array}
     */
    static fromBase64lex(base64lex) {
        let base64 = '';
        for (let i = 0; i < base64lex.length; i++) {
            base64 += BufferUtils.BASE64_LEX_TO_BASE64[base64lex[i]];
        }
        return BufferUtils.fromBase64(base64);
    }

    /**
     * @param {*} a
     * @param {*} b
     * @return {boolean}
     */
    static equals(a, b) {
        if (a.length !== b.length) return false;
        const viewA = new Uint8Array(a);
        const viewB = new Uint8Array(b);
        for (let i = 0; i < a.length; i++) {
            if (viewA[i] !== viewB[i]) return false;
        }
        return true;
    }

    /**
     * @param {*} a
     * @param {*} b
     * @return {number} -1 if a is smaller than b, 1 if a is larger than b, 0 if a equals b.
     */
    static compare(a, b) {
        if (a.length < b.length) return -1;
        if (a.length > b.length) return 1;
        for (let i = 0; i < a.length; i++) {
            if (a[i] < b[i]) return -1;
            if (a[i] > b[i]) return 1;
        }
        return 0;
    }
}
BufferUtils.BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
BufferUtils._BASE64_LOOKUP = [];
for (let i = 0, len = BufferUtils.BASE64_ALPHABET.length; i < len; ++i) {
    BufferUtils._BASE64_LOOKUP[i] = BufferUtils.BASE64_ALPHABET[i];
}
BufferUtils.BASE64_LEX_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
BufferUtils.BASE64_TO_BASE64_LEX = { '=': '-' };
BufferUtils.BASE64_LEX_TO_BASE64 = { '-': '=' };
for (let i = 0, len = BufferUtils.BASE64_ALPHABET.length; i < len; ++i) {
    BufferUtils.BASE64_TO_BASE64_LEX[BufferUtils.BASE64_ALPHABET[i]] = BufferUtils.BASE64_LEX_ALPHABET[i];
    BufferUtils.BASE64_LEX_TO_BASE64[BufferUtils.BASE64_LEX_ALPHABET[i]] = BufferUtils.BASE64_ALPHABET[i];
}
Class.register(BufferUtils);

class ComparisonUtils {
    /**
     * @param {*} a
     * @param {*} b
     * @return {boolean}
     */
    static equals(a, b) {
        // Primitive values
        if (a === b) return true;

        // Set
        if (a instanceof Set && b instanceof Set) return a.equals(b);

        // ArrayBuffer/Uint8Array/Buffer
        if (ComparisonUtils.isUint8Array(a) && ComparisonUtils.isUint8Array(b)) return BufferUtils.equals(new Uint8Array(a), new Uint8Array(b));

        return false;
    }

    /**
     * @param {*} a
     * @param {*} b
     * @return {boolean}
     */
    static compare(a, b) {
        // ArrayBuffer/Uint8Array/Buffer
        if (ComparisonUtils.isUint8Array(a) && ComparisonUtils.isUint8Array(b)) return BufferUtils.compare(new Uint8Array(a), new Uint8Array(b));

        // Primitive values
        if (a < b) return -1;
        if (a > b) return 1;

        return 0;
    }

    /**
     * @param {*} obj
     * @returns {boolean}
     */
    static isUint8Array(obj) {
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined' && obj instanceof Buffer) return true;
        return ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer;
    }
}
Class.register(ComparisonUtils);

class JSONUtils {
    static stringify(value) {
        return JSON.stringify(value, JSONUtils.jsonifyType);
    }

    static parse(value) {
        return JSON.parse(value, JSONUtils.parseType);
    }

    static parseType(key, value) {
        if (value && value[JSONUtils.TYPE_SYMBOL]) {
            switch (value[JSONUtils.TYPE_SYMBOL]) {
                case 'Uint8Array':
                    return BufferUtils.fromBase64(value[JSONUtils.VALUE_SYMBOL]);
                case 'Set':
                    return Set.from(value[JSONUtils.VALUE_SYMBOL]);
            }
        }
        return value;
    }

    static jsonifyType(key, value) {
        if (value instanceof Uint8Array) {
            return JSONUtils.typedObject('Uint8Array', BufferUtils.toBase64(value));
        }
        if (value instanceof Set) {
            return JSONUtils.typedObject('Set', Array.from(value));
        }
        return value;
    }

    static typedObject(type, value) {
        const obj = {};
        obj[JSONUtils.TYPE_SYMBOL] = type;
        obj[JSONUtils.VALUE_SYMBOL] = value;
        return obj;
    }
}
JSONUtils.TYPE_SYMBOL = '__';
JSONUtils.VALUE_SYMBOL = 'value';

Class.register(JSONUtils);

class Log {
    /**
     * @returns {Log}
     */
    static get instance() {
        if (!Log._instance) {
            Log._instance = new Log(new LogNative());
        }
        return Log._instance;
    }

    /**
     * @param {LogNative} native
     */
    constructor(native) {
        /** @type {LogNative} */
        this._native = native;
    }

    /**
     * @param {string} tag
     * @param {Log.Level} level
     */
    setLoggable(tag, level) {
        this._native.setLoggable(tag, level);
    }

    /** @type {Log.Level} */
    get level() {
        return this._native._global_level;
    }

    /** @type {Log.Level} */
    set level(l) {
        this._native._global_level = l;
    }

    /**
     * @param {Log.Level} level
     * @param {string|{name:string}} tag
     * @param {Array} args
     */
    msg(level, tag, args) {
        if (this._native.isLoggable(tag, level)) {
            for (let i = 0; i < args.length; ++i) {
                if (typeof args[i] === 'function') {
                    args[i] = args[i]();
                }
                if (typeof args[i] === 'object') {
                    if (typeof args[i].toString === 'function') {
                        args[i] = args[i].toString();
                    } else if (args[i].constructor && args[i].constructor.name) {
                        args[i] = `{Object: ${args[i].constructor.name}}`;
                    } else {
                        args[i] = '{Object}';
                    }
                }
            }
            this._native.msg(level, tag, args);
        }
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static d(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.DEBUG, tag, args);
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static e(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.ERROR, tag, args);
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static i(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.INFO, tag, args);
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static v(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.VERBOSE, tag, args);
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static w(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.WARNING, tag, args);
    }

    /**
     * @param {?string|{name:string}} [tag=undefined]
     * @param {string|function():string} message
     * @param {...*} args
     */
    static t(tag, message, ...args) {
        if (arguments.length >= 2) {
            tag = arguments[0];
            args = Array.prototype.slice.call(arguments, 1);
        } else {
            tag = undefined;
            args = Array.prototype.slice.call(arguments, 0);
        }
        Log.instance.msg(Log.TRACE, tag, args);
    }
}
/**
 * @enum {number}
 */
Log.Level = {
    TRACE: 1,
    VERBOSE: 2,
    DEBUG: 3,
    INFO: 4,
    WARNING: 5,
    ERROR: 6,
    ASSERT: 7,

    /**
     * @param {Log.Level} level
     */
    toStringTag: function (level) {
        switch (level) {
            case Log.TRACE:
                return 'T';
            case Log.VERBOSE:
                return 'V';
            case Log.DEBUG:
                return 'D';
            case Log.INFO:
                return 'I';
            case Log.WARNING:
                return 'W';
            case Log.ERROR:
                return 'E';
            case Log.ASSERT:
                return 'A';
            default:
                return '*';
        }
    }
};
Log.TRACE = Log.Level.TRACE;
Log.VERBOSE = Log.Level.VERBOSE;
Log.DEBUG = Log.Level.DEBUG;
Log.INFO = Log.Level.INFO;
Log.WARNING = Log.Level.WARNING;
Log.ERROR = Log.Level.ERROR;
Log.ASSERT = Log.Level.ASSERT;
Log._instance = null;

Log.d.tag = (tag) => Log.d.bind(null, tag);
Log.e.tag = (tag) => Log.e.bind(null, tag);
Log.i.tag = (tag) => Log.i.bind(null, tag);
Log.v.tag = (tag) => Log.v.bind(null, tag);
Log.w.tag = (tag) => Log.w.bind(null, tag);
Log.t.tag = (tag) => Log.t.bind(null, tag);

Class.register(Log);

/**
 * @template V
 * @implements {Iterable.<V>}
 * @typedef {{next: ?LinkedListEntry, prev: ?LinkedListEntry, value: V|*}} LinkedListEntry
 */
class LinkedList {
    /**
     * @param {*} args
     */
    constructor(...args) {
        /** @type {number} */
        this._length = 0;
        /** @type {LinkedListEntry} */
        this._head = null;
        /** @type {LinkedListEntry} */
        this._tail = null;

        const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        for (const value of values) {
            this.push(value);
        }
    }

    /**
     * @param {V|*} value
     * @returns {void}
     */
    push(value) {
        const entry = {
            next: null,
            prev: this._head,
            value: value
        };
        this._push(entry);
    }

    /**
     * @param {LinkedListEntry} entry
     * @returns {void}
     * @protected
     */
    _push(entry) {
        this._length++;

        if (!this._head) {
            this._head = entry;
            this._tail = entry;
            return;
        }

        this._head.next = entry;
        this._head = entry;
    }

    /**
     * @param {V|*} value
     */
    unshift(value) {
        const entry = {
            next: this._tail,
            prev: null,
            value: value
        };
        this._unshift(entry);
    }

    /**
     * @param {LinkedListEntry} entry
     * @returns {void}
     * @protected
     */
    _unshift(entry) {
        this._length++;

        if (!this._head) {
            this._head = entry;
            this._tail = entry;
            return;
        }

        this._tail.prev = entry;
        this._tail = entry;
    }

    /**
     * @returns {V|*}
     */
    pop() {
        if (!this._head) {
            return null;
        }

        this._length--;

        const entry = this._head;
        const prev = entry.prev;
        if (!prev) {
            this._head = null;
            this._tail = null;
            return entry.value;
        }

        prev.next = null;
        this._head = prev;
        return entry.value;
    }

    /**
     * @returns {V|*}
     */
    shift() {
        if (!this._head) {
            return null;
        }

        this._length--;

        const entry = this._tail;
        const next = entry.next;
        if (!next) {
            this._head = null;
            this._tail = null;
            return entry.value;
        }

        next.prev = null;
        this._tail = next;
        return entry.value;
    }

    /**
     * @param {LinkedListEntry} entry
     * @returns {void}
     * @protected
     */
    _remove(entry) {
        if (entry === this._head) {
            this.pop();
        } else if (entry === this._tail) {
            this.shift();
        } else {
            this._length--;
            entry.prev.next = entry.next;
            entry.next.prev = entry.prev;
        }
    }

    /**
     * @returns {void}
     */
    clear() {
        this._length = 0;
        this._head = null;
        this._tail = null;
    }

    /**
     * @returns {Iterator.<V|*>}
     */
    [Symbol.iterator]() {
        return this.iterator();
    }

    /**
     * @returns {Iterator.<V|*>}
     */
    *iterator() {
        let entry = this._tail;
        while (entry) {
            yield entry.value;
            entry = entry.next;
        }
    }

    /**
     * @returns {boolean}
     */
    isEmpty() {
        return this._length === 0;
    }

    /** @type {V|*} */
    get first() {
        return this._tail ? this._tail.value : null;
    }

    /** @type {V|*} */
    get last() {
        return this._head ? this._head.value : null;
    }

    /** @type {number} */
    get length() {
        return this._length;
    }
}
Class.register(LinkedList);

class UniqueLinkedList extends LinkedList {
    constructor() {
        super();
        this._map = new Map();
    }

    /**
     * @param {V|*} value
     * @returns {void}
     * @override
     */
    push(value) {
        if (!this._map.has(value)) {
            super.push(value);
        }
    }

    /**
     * @param {LinkedListEntry} entry
     * @returns {void}
     * @protected
     * @override
     */
    _push(entry) {
        super._push(entry);
        this._map.set(entry.value, entry);
    }

    /**
     * @param {V|*} value
     * @returns {void}
     */
    unshift(value) {
        if (!this._map.has(value)) {
            super.unshift(value);
        }
    }

    /**
     * @param {LinkedListEntry} entry
     * @returns {void}
     * @protected
     */
    _unshift(entry) {
        super._unshift(entry);
        this._map.set(entry.value, entry);
    }

    /**
     * @returns {V|*}
     */
    pop() {
        const value = super.pop();
        this._map.delete(value);
        return value;
    }

    /**
     * @returns {V|*}
     */
    shift() {
        const value = super.shift();
        this._map.delete(value);
        return value;
    }

    /**
     * @returns {void}
     */
    clear() {
        super.clear();
        this._map.clear();
    }

    /**
     * @param {V|*} value
     * @returns {boolean}
     */
    contains(value) {
        return this._map.has(value);
    }

    /**
     * @param {V|*} value
     * @returns {void}
     */
    remove(value) {
        const entry = this._map.get(value);
        if (entry) {
            super._remove(entry);
            this._map.delete(value);
        }
    }

    /**
     * @param {V|*} value
     * @returns {void}
     */
    moveBack(value) {
        /*
         * Just removing and inserting the key again may take seconds (yes, seconds!).
         * This is due to the JavaScript Map implementation as illustrated in this benchmark:
         * https://gist.github.com/paberr/1d916343631c0e42f8311a6f2782f30d
         *
         * 100,000 accesses using Map remove/insert: ~4s
         * 100,000 accesses using optimised version: ~9ms
         */
        const entry = this._map.get(value);
        if (entry) {
            if (entry === this._head) {
                return;
            } else if (entry === this._tail) {
                entry.next.prev = null;
                this._tail = entry.next;
            } else {
                entry.prev.next = entry.next;
                entry.next.prev = entry.prev;
            }
            entry.next = null;
            entry.prev = this._head;
            this._head.next = entry;
            this._head = entry;
        } else {
            // Do not check again for presence in the map.
            super.push(value);
        }
    }
}
Class.register(UniqueLinkedList);

/**
 * An implementation of a LRU (least recently used) map.
 * This is a map that contains a maximum of k entries,
 * where k is specified in the constructor.
 * When the maximal number of entries is reached,
 * it will evict the least recently used entry.
 * This behaviour is useful for caches.
 * @template K The keys' type.
 * @template V The values' type.
 */
class LRUMap {
    /**
     * Instantiate a LRU map of maximum size maxSize.
     * @param {number} maxSize The maximum size of the map.
     */
    constructor(maxSize) {
        this._maxSize = maxSize;
        /** @type {Map.<K,V>} */
        this._map = new Map();
        /** @type {UniqueLinkedList.<K>} */
        this._accessQueue = new UniqueLinkedList();
    }

    /**
     * The current size of the map.
     * @type {number}
     */
    get size() {
        return this._map.size;
    }

    /**
     * Clears the map.
     */
    clear() {
        this._accessQueue.clear();
        return this._map.clear();
    }

    /**
     * Deletes a key from the map.
     * @param {K} key The key to delete.
     * @returns {boolean} Whether an entry was deleted.
     */
    delete(key) {
        this._accessQueue.remove(key);
        return this._map.delete(key);
    }

    /**
     * Returns an iterator over key value pairs [k, v].
     * @returns {Iterator.<Array>}
     */
    entries() {
        return this._map.entries();
    }

    /**
     * Execute a given function for each key value pair in the map.
     * @param {function(key:K, value:V):*} callback The function to be called.
     * @param {*} [thisArg] This value will be used as this when executing the function.
     */
    forEach(callback, thisArg) {
        return this._map.forEach(callback, thisArg);
    }

    /**
     * Return the corresponding value to a specified key.
     * @param {K} key The key to look for.
     * @returns {V} The value the key maps to (or undefined if not present).
     */
    get(key) {
        this._access(key);
        return this._map.get(key);
    }

    /**
     * Returns true if the specified key is to be found in the map.
     * @param {K} key The key to look for.
     * @returns {boolean} True, if the key is in the map, false otherwise.
     */
    has(key) {
        return this._map.has(key);
    }

    /**
     * Returns an iterator over the keys of the map.
     * @returns {Iterator.<K>}
     */
    keys() {
        return this._map.keys();
    }

    /**
     * Evicts the k least recently used entries from the map.
     * @param {number} [k] The number of entries to evict (default is 1).
     */
    evict(k=1) {
        while (k > 0 && this._accessQueue.length > 0) {
            const oldest = this._accessQueue.shift();
            this._map.delete(oldest);
            --k;
        }
    }

    /**
     * Marks a key as accessed.
     * This implicitly makes the key the most recently used key.
     * @param {K} key The key to mark as accessed.
     * @private
     */
    _access(key) {
        /*
         * Just removing and inserting the key again may take seconds (yes, seconds!).
         * This is due to the JavaScript Map implementation as illustrated in this benchmark:
         * https://gist.github.com/paberr/1d916343631c0e42f8311a6f2782f30d
         *
         * 100,000 accesses using Map remove/insert: ~4s
         * 100,000 accesses using optimised version: ~9ms
         */
        this._accessQueue.moveBack(key);
    }

    /**
     * Inserts or replaces a key's value into the map.
     * If the maxSize of the map is exceeded, the least recently used key is evicted first.
     * Inserting a key implicitly accesses it.
     * @param {K} key The key to set.
     * @param {V} value The associated value.
     */
    set(key, value) {
        if (this.size >= this._maxSize) {
            this.evict();
        }
        if (this.size < this._maxSize) {
            this._map.set(key, value);
            this._access(key);
        }
    }

    /**
     * Returns an iterator over the values of the map.
     * @returns {Iterator.<V>}
     */
    values() {
        return this._map.values();
    }

    /**
     * Returns an iterator over key value pairs [k, v].
     * @returns {Iterator.<Array>}
     */
    [Symbol.iterator]() {
        return this._map.entries();
    }
}
Class.register(LRUMap);

/**
 * Utils that are related to common JavaScript objects.
 */
class ObjectUtils {
    /**
     * This method returns the value of an object at a given path.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * @param {Object} obj The JS object to access.
     * @param {string|Array.<string>} path The key path to access.
     * @returns {*} The value at the given path or undefined if the path does not exist.
     */
    static byKeyPath(obj, path) {
        if (!Array.isArray(path)) {
            return obj[path];
        }
        let tmp = obj;
        for (const component of path) {
            if (tmp === undefined) {
                return undefined;
            }
            tmp = tmp[component];
        }
        return tmp;
    }
}
Class.register(ObjectUtils);

/**
 * Calculates the union of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The union of this set and the second set.
 */
Set.prototype.union = function(setB) {
    const union = new Set(this);
    for (const elem of setB) {
        union.add(elem);
    }
    return union;
};

/**
 * Calculates the intersection of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The intersection of this set and the second set.
 */
Set.prototype.intersection = function(setB) {
    const intersection = new Set();
    for (const elem of setB) {
        if (this.has(elem)) {
            intersection.add(elem);
        }
    }
    return intersection;
};

/**
 * Calculates the difference of two sets.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {Set} The difference of this set and the second set.
 */
Set.prototype.difference = function(setB) {
    const difference = new Set(this);
    for (const elem of setB) {
        difference.delete(elem);
    }
    return difference;
};

/**
 * Checks whether two sets are equal to each other.
 * Method of Set.
 * @memberOf Set
 * @param {Set} setB The second set.
 * @returns {boolean} True if they contain the same elements, false otherwise.
 */
Set.prototype.equals = function(setB) {
    if (this.size !== setB.size) return false;
    for (const elem of setB) {
        if (!this.has(elem)) {
            return false;
        }
    }
    return true;
};

/**
 * Limits the number of items in the set.
 * @param {number} [limit] Limits the number of results if given.
 * @returns {Set}
 */
Set.prototype.limit = function(limit = null) {
    if (limit === null) return this;

    const limitedResults = new Set();
    let count = 0;
    for (const val of this) {
        // Limit
        if (limit !== null && count >= limit) break;

        limitedResults.add(val);
        count++;
    }
    return limitedResults;
};

/**
 * Creates a Set from single values and iterables.
 * If arg is not iterable, it creates a new Set with arg as its single member.
 * If arg is iterable, it iterates over arg and puts all items into the Set.
 * Static method of Set.
 * @memberOf Set
 * @param {*} arg The argument to create the Set from.
 * @returns {Set} The resulting Set.
 */
Set.from = function(arg) {
    // Check if iterable and not string.
    if (arg && typeof arg[Symbol.iterator] === 'function' && typeof arg !== 'string') {
        return new Set(arg);
    }
    return new Set([arg]);
};

/**
 * Returns an element of a Set.
 * Static method of Set.
 * @memberOf Set
 * @template T
 * @param {Set.<T>} s The set to return an element from.
 * @returns {T} An element of the set.
 */
Set.sampleElement = function(s) {
    return s.size > 0 ? s.values().next().value : undefined;
};

class SortedList {
    constructor(sortedList = [], compare) {
        this._list = sortedList;
        this._compare = compare || SortedList._compare;
    }

    static _compare(a, b) {
        return a.compare ? a.compare(b) : (a > b ? 1 : (a < b ? -1 : 0));
    }

    indexOf(o) {
        let a = 0, b = this._list.length - 1;
        let currentIndex = null;
        let currentElement = null;

        while (a <= b) {
            currentIndex = Math.round((a + b) / 2);
            currentElement = this._list[currentIndex];

            if (this._compare(currentElement, o) < 0) {
                a = currentIndex + 1;
            }
            else if (this._compare(currentElement, o) > 0) {
                b = currentIndex - 1;
            }
            else {
                return currentIndex;
            }
        }

        return -1;
    }

    _insertionIndex(o) {
        let a = 0, b = this._list.length - 1;
        let currentIndex = null;
        let currentElement = null;

        while (a <= b) {
            currentIndex = Math.round((a + b) / 2);
            currentElement = this._list[currentIndex];

            if (this._compare(currentElement, o) < 0) {
                a = currentIndex + 1;
            }
            else if (this._compare(currentElement, o) > 0) {
                b = currentIndex - 1;
            }
            else {
                break;
            }
        }

        return a;
    }

    add(value) {
        this._list.splice(this._insertionIndex(value), 0, value);
    }

    has(value) {
        return this.indexOf(value) >= 0;
    }

    shift() {
        return this._list.shift();
    }

    pop() {
        return this._list.pop();
    }

    peekFirst() {
        return this._list[0];
    }

    peekLast() {
        return this._list[this._list.length - 1];
    }

    remove(value) {
        const index = this.indexOf(value);
        if (index > -1) {
            this._list.splice(index, 1);
        }
    }

    clear() {
        this._list = [];
    }

    values() {
        return this._list;
    }

    /**
     * @returns {Iterator.<V|*>}
     */
    [Symbol.iterator]() {
        return this._list[Symbol.iterator]();
    }

    copy() {
        return new SortedList(this._list.slice(), this._compare);
    }

    /** @type {number} */
    get length() {
        return this._list.length;
    }
}
Class.register(SortedList);

class Synchronizer {
    constructor() {
        this._queue = [];
        this._working = false;
    }

    /**
     * Push function to the Synchronizer for later, synchronous execution
     * @template T
     * @param {function():T} fn Function to be invoked later by this Synchronizer
     * @returns {Promise.<T>}
     */
    push(fn) {
        return new Promise((resolve, error) => {
            this._queue.push({fn: fn, resolve: resolve, error: error});
            if (!this._working) {
                this._doWork().catch(Log.w.tag(Synchronizer));
            }
        });
    }

    async _doWork() {
        this._working = true;

        while (this._queue.length) {
            const job = this._queue.shift();
            try {
                const result = await job.fn();
                job.resolve(result);
            } catch (e) {
                if (job.error) job.error(e);
            }
        }

        this._working = false;
    }

    /** @type {boolean} */
    get working() {
        return this._working;
    }
}
Class.register(Synchronizer);

/**
 * A simple object implementing parts of the Transaction's class.
 * It is used to keep track of modifications on a persistent index
 * and to apply them all at once.
 * This class is to be used only internally.
 */
class EncodedTransaction {
    /**
     * Create a new IndexTransaction.
     */
    constructor(tableName) {
        this._tableName = tableName;
        this._modified = new Map();
        this._removed = new Set();
        this._truncated = false;
    }

    /** @type {string} */
    get tableName() {
        return this._tableName;
    }

    /** @type {Map.<string,*>} */
    get modified() {
        return this._modified;
    }

    /** @type {Set.<string>} */
    get removed() {
        return this._removed;
    }

    /** @type {boolean} */
    get truncated() {
        return this._truncated;
    }

    /**
     * Empty the index transaction.
     */
    truncate() {
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();
    }

    /**
     * Put a key-value pair into the transaction.
     * @param {string} key The key.
     * @param {*} value The value.
     */
    put(key, value) {
        this._removed.delete(key);
        this._modified.set(key, value);
    }

    /**
     * Get a value from the encoded transaction.
     * @param {string} key The key.
     * @return {*} value The value.
     */
    get(key) {
        return this._modified.get(key);
    }

    /**
     * Remove a key-value pair from the transaction.
     * @param {string} key The key to remove.
     */
    remove(key) {
        this._removed.add(key);
        this._modified.delete(key);
    }

}
Class.register(EncodedTransaction);

class GenericValueEncoding {
    static _encodeInteger(value) {
        const binary = new Uint8Array(9);
        const dv = new DataView(binary.buffer);
        dv.setUint8(0, GenericValueEncoding.Type.INTEGER);
        dv.setUint32(1, Math.floor(value / Math.pow(2, 32)));
        dv.setUint32(5, value);
        return binary;
    }
    static _decodeInteger(binary) {
        const dv = new DataView(binary.buffer);
        return dv.getUint32(1) * Math.pow(2, 32) + dv.getUint32(5);
    }

    static _encodeString(string, type = GenericValueEncoding.Type.STRING) {
        const buf = new Uint8Array(string.length + 1);
        buf[0] = type;
        for (let i = 0; i < string.length; ++i) {
            buf[i + 1] = string.charCodeAt(i);
        }
        return buf;
    }
    static _decodeString(buffer) {
        return String.fromCharCode.apply(null, buffer.subarray(1));
    }

    static _encodeOther(obj) {
        return GenericValueEncoding._encodeString(JSONUtils.stringify(obj), GenericValueEncoding.Type.JSON);
    }
    static _decodeOther(buffer) {
        const json = GenericValueEncoding._decodeString(buffer);
        return JSONUtils.parse(json);
    }

    static _encodeBuffer(buffer) {
        const buf = new Uint8Array(buffer.byteLength + 1);
        buf[0] = GenericValueEncoding.Type.BUFFER;
        buf.set(buffer, 1);
        return buf;
    }
    static _decodeBuffer(buffer) {
        return buffer.subarray(1);
    }

    static encode(data) {
        if (Number.isInteger(data)) {
            return GenericValueEncoding._encodeInteger(data);
        }
        if (typeof data === 'string') {
            return this._encodeString(data);
        }
        if (data instanceof Uint8Array) {
            return GenericValueEncoding._encodeBuffer(data);
        }
        return GenericValueEncoding._encodeOther(data);
    }

    static decode(data) {
        data = new Uint8Array(data);
        const type = data[0];
        switch (type) {
            case GenericValueEncoding.Type.INTEGER:
                return GenericValueEncoding._decodeInteger(data);
            case GenericValueEncoding.Type.STRING:
                return GenericValueEncoding._decodeString(data);
            case GenericValueEncoding.Type.BUFFER:
                return GenericValueEncoding._decodeBuffer(data);
            default:
                return GenericValueEncoding._decodeOther(data);
        }
    }

    static get encoding() {
        return JungleDB.Encoding.BINARY;
    }
}
/** @enum {number} */
GenericValueEncoding.Type = {
    INTEGER: 0,
    STRING: 1,
    JSON: 2,
    BUFFER: 3
};
Class.register(GenericValueEncoding);

/**
 * This is an intermediate layer caching the results of a backend.
 * While simple get/put queries make use of the cache,
 * more advanced queries will be forwarded to the backend.
 * @implements {IBackend}
 */
class CachedBackend {
    /**
     * Creates a new instance of the cached layer using the specified backend.
     * @param {IBackend} backend The backend to use.
     */
    constructor(backend, cacheSize = CachedBackend.MAX_CACHE_SIZE, rawCacheSize = 0) {
        this._backend = backend;
        /** @type {Map.<string,*>} */
        this._cache = new LRUMap(cacheSize);
        /** @type {Map.<string,*>} */
        this._rawCache = new LRUMap(rawCacheSize);
    }

    /** @type {boolean} */
    get connected() {
        return this._backend.connected;
    }

    /**
     * A map of index names to indices as defined by the underlying backend.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._backend.indices;
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Set.<string>} keys The set of keys to get the corresponding values for.
     * @returns {Promise.<Array.<*>>} A promise of the array of values.
     * @protected
     */
    async _retrieveValues(keys) {
        const valuePromises = [];
        for (const key of keys) {
            valuePromises.push(this.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * @param {string} key
     * @returns {boolean}
     * @private
     */
    _has(key) {
        return this._cache.has(key) || this._rawCache.has(key);
    }

    /**
     * @param {string} key
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {boolean}
     * @private
     */
    _get(key, options) {
        if (options && options.raw) {
            if (this._rawCache.has(key)) {
                return this._rawCache.get(key);
            } else {
                // Transform to raw if requested
                const value = this.encode(this._cache.get(key));
                this._rawCache.set(key, value);
                return value;
            }
        } else {
            if (this._cache.has(key)) {
                return this._cache.get(key);
            } else {
                const value = this.decode(this._rawCache.get(key), key);
                this._cache.set(key, value);
                return value;
            }
        }
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @abstract
     * @param {string} key The primary key to look for.
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, options = {}) {
        if (this._has(key)) {
            return this._get(key, options);
        }

        // Attempt backend
        if (this._backend.isSynchronous()) {
            const value = this._backend.getSync(key, options);
            // Cache
            if (options && options.raw) {
                this._rawCache.set(key, value);
            } else {
                this._cache.set(key, value);
            }
            return value;
        }

        if (options && options.expectPresence) {
            throw new Error(`Missing key in cached backend: ${key}`);
        }

        return undefined;
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        // Since the cache may change quickly, don't promise anything to the upper layers.
        // But we can still answer their getSync requests if we have it in the cache.
        return false;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * If the item is in the cache, the cached value will be returned.
     * Otherwise, the value will be fetched from the backend object store..
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, options = {}) {
        if (this._has(key)) {
            return this._get(key, options);
        }
        const value = await this._backend.get(key, options);
        // Cache
        if (options && options.raw) {
            this._rawCache.set(key, value);
        } else {
            this._cache.set(key, value);
        }
        return value;
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query by querying the backend.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    keys(query = null, limit = null) {
        return this._backend.keys(query, limit);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query by relying on the backend.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query = null, limit = null) {
        return this._backend.values(query, limit);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     */
    keyStream(callback, ascending=true, query=null) {
        return this._backend.keyStream(callback, ascending, query);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     */
    valueStream(callback, ascending=true, query=null) {
        return this._backend.valueStream(callback, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        return this._backend.maxValue(query);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        return this._backend.maxKey(query);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        return this._backend.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        return this._backend.minValue(query);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    count(query=null) {
        return this._backend.count(query);
    }

    /**
     * Internally applies a transaction to the cache's and backend's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    _apply(tx) {
        this._applyLocally(tx);
        return this._backend._apply(tx);
    }

    /**
     * Internally applies a transaction to the cache's state.
     * @param {Transaction} tx The transaction to apply.
     * @protected
     */
    _applyLocally(tx) {
        // Update local state and push to backend for batch transaction.
        if (tx._truncated) {
            this._cache.clear();
        }
        for (const key of tx._removed) {
            this._cache.delete(key);
        }
        for (const [key, value] of tx._modified) {
            this._cache.set(key, value);
        }
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        this._cache.clear();
        return this._backend.truncate();
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._backend.index(indexName);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {IndexConfig} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        return this._backend.createIndex(indexName, keyPath, options);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        return this._backend.deleteIndex(indexName, options);
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        return this._backend.close();
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @abstract
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function()|Array.<*|function()>>} For non-persistent backends: a function that effectively applies the transaction.
     * Native backends otherwise specify their own information as needed by their JungleDB instance.
     */
    async applyCombined(tx) {
        return [await this._backend.applyCombined(tx), () => this._applyLocally(tx)];
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }

    /**
     * Method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value.
     */
    decode(value, key) {
        return this._backend.decode(value, key);
    }

    /**
     * Method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value.
     */
    encode(value) {
        return this._backend.encode(value);
    }
}
/** @type {number} Maximum number of cached elements. */
CachedBackend.MAX_CACHE_SIZE = 5000 /*elements*/;
Class.register(CachedBackend);

/**
 * This is a BTree based index, which is generally stored in memory.
 * It is used by transactions.
 * @implements {IIndex}
 */
class InMemoryIndex {
    /**
     * Creates a new InMemoryIndex for a given object store.
     * The key path describes the path of the secondary key within the stored objects.
     * Only objects for which the key path exists are part of the secondary index.
     *
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     *
     * If a secondary index is a multi entry index, and the value at the key path is iterable,
     * every item of the iterable value will be associated with the object.
     * @param {IObjectStore} objectStore The underlying object store to use.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     */
    constructor(objectStore, keyPath, multiEntry=false, unique=false) {
        this._objectStore = objectStore;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
        this._tree = new BTree();
    }

    /**
     * Reinitialises the index.
     */
    truncate() {
        this._tree = new BTree();
    }

    /**
     * Helper method to return the attribute associated with the key path if it exists.
     * @param {string} key The primary key of the key-value pair.
     * @param {*} obj The value of the key-value pair.
     * @returns {*} The attribute associated with the key path, if it exists, and undefined otherwise.
     * @private
     */
    _indexKey(key, obj) {
        if (obj === undefined) return undefined;
        if (this.keyPath) {
            return ObjectUtils.byKeyPath(obj, this.keyPath);
        }
        return key;
    }

    /**
     * The key path associated with this index.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * If the keyPath is undefined, this index uses the primary key of the key-value store.
     * @type {string|Array.<string>}
     */
    get keyPath() {
        return this._keyPath;
    }

    /**
     * This value determines whether the index supports multiple secondary keys per entry.
     * If so, the value at the key path is considered to be an iterable.
     * @type {boolean}
     */
    get multiEntry() {
        return this._multiEntry;
    }

    /**
     * This value determines whether the index is a unique constraint.
     * @type {boolean}
     */
    get unique() {
        return this._unique;
    }

    /**
     * A helper method to insert a primary-secondary key pair into the tree.
     * @param {string} key The primary key.
     * @param {*} iKey The indexed key.
     * @throws if the uniqueness constraint is violated.
     */
    _insert(key, iKey) {
        const tree = this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Add all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (this._unique) {
                    throw new Error(`Uniqueness constraint violated for key ${key} on path ${this._keyPath}`);
                }
                (/** @type {SortedList} */ tree.currentRecord).add(key);
            } else {
                tree.insert(component, this._unique ? key : new SortedList([key], ComparisonUtils.compare));
            }
        }
    }

    /**
     * Inserts a new key-value pair into the index.
     * For replacing an existing pair, the old value has to be passed as well.
     * @param {string} key The primary key of the pair.
     * @param {*} value The value of the pair. The indexed key will be extracted from this.
     * @param {*} [oldValue] The old value associated with the primary key.
     */
    put(key, value, oldValue) {
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        if (!ComparisonUtils.equals(oldIKey, newIKey)) {
            if (oldIKey !== undefined) {
                this._remove(key, oldIKey);
            }
            if (newIKey !== undefined) {
                this._insert(key, newIKey);
            }
        }
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} oldValue The old value of the pair. The indexed key will be extracted from this.
     */
    remove(key, oldValue) {
        const iKey = this._indexKey(key, oldValue);
        if (iKey !== undefined) {
            this._remove(key, iKey);
        }
    }

    /**
     * A helper method to remove a primary-secondary key pair from the tree.
     * @param {string} key The primary key.
     * @param {*} iKey The indexed key.
     */
    _remove(key, iKey) {
        const tree = this._tree;
        if (!this._multiEntry || !Array.isArray(iKey)) {
            iKey = [iKey];
        }
        // Remove all keys.
        for (const component of iKey) {
            if (tree.seek(component)) {
                if (!this._unique && (/** @type {SortedList} */ tree.currentRecord).length > 1) {
                    (/** @type {SortedList} */ tree.currentRecord).remove(key);
                } else {
                    tree.remove(component);
                }
            }
        }
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Set.<string>} keys The set of keys to get the corresponding values for.
     * @returns {Promise.<Array.<*>>} A promise of the array of values.
     * @protected
     */
    async _retrieveValues(keys) {
        const valuePromises = [];
        for (const key of keys) {
            valuePromises.push(this._objectStore.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        const keys = await this.keys(query, limit);
        return this._retrieveValues(keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query = null, limit = null) {
        let resultSet = new Set();

        // Shortcut for exact match.
        if (query instanceof KeyRange && query.exactMatch) {
            if (this._tree.seek(query.lower)) {
                resultSet = Set.from(this._tree.currentRecord);
            }
            return resultSet.limit(limit);
        }

        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            if (!this._tree.goTop()) {
                return resultSet; // Empty
            }
        } else {
            if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                return resultSet; // empty
            }
        }

        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            // Limit
            if (limit !== null && resultSet.size >= limit) {
                break;
            }

            resultSet = resultSet.union(Set.from(this._tree.currentRecord));
            if (!this._tree.skip()) {
                break;
            }
        }
        return resultSet.limit(limit);
    }

    /**
     * Iterates over the primary keys in a given range of secondary keys and direction.
     * The order is determined by the secondary keys first and by the primary keys second.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            if (ascending) {
                if (!this._tree.goTop()) {
                    return Promise.resolve();
                }
            } else {
                if (!this._tree.goBottom()) {
                    return Promise.resolve();
                }
            }
        } else {
            if (ascending) {
                if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                    return Promise.resolve();
                }
            } else {
                if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
                    return Promise.resolve();
                }
            }
        }

        outer:
        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            if (this._unique) {
                // Check unique entry
                if (!callback(this._tree.currentRecord)) break;
            } else {
                // Check all entries
                const keys = this._tree.currentRecord.values();
                if (ascending) {
                    for (let i = 0; i < keys.length; i++) {
                        if (!callback(keys[i])) {
                            break outer;
                        }
                    }
                } else {
                    for (let i = keys.length - 1; i >= 0; i--) {
                        if (!callback(keys[i])) {
                            break outer;
                        }
                    }
                }
            }

            if (!this._tree.skip(ascending ? 1 : -1)) {
                break;
            }
        }
        return Promise.resolve();
    }

    /**
     * Iterates over the values of the store in a given range of secondary keys and direction.
     * The order is determined by the secondary keys first and by the primary keys second.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolved after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        // Find lower bound and start from there.
        if (!(query instanceof KeyRange)) {
            if (ascending) {
                if (!this._tree.goTop()) {
                    return;
                }
            } else {
                if (!this._tree.goBottom()) {
                    return;
                }
            }
        } else {
            if (ascending) {
                if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
                    return;
                }
            } else {
                if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
                    return;
                }
            }
        }

        outer:
        while (!(query instanceof KeyRange) || query.includes(this._tree.currentKey)) {
            if (this._unique) {
                // Check unique entry
                if (!callback(await this._objectStore.get(this._tree.currentRecord), this._tree.currentRecord)) break; // eslint-disable-line no-await-in-loop
            } else {
                // Check all entries
                const keys = this._tree.currentRecord.values();
                if (ascending) {
                    for (let i = 0; i < keys.length; i++) {
                        if (!callback(await this._objectStore.get(keys[i]), keys[i])) { // eslint-disable-line no-await-in-loop
                            break outer;
                        }
                    }
                } else {
                    for (let i = keys.length - 1; i >= 0; i--) {
                        if (!callback(await this._objectStore.get(keys[i]), keys[i])) { // eslint-disable-line no-await-in-loop
                            break outer;
                        }
                    }
                }
            }

            if (!this._tree.skip(ascending ? 1 : -1)) {
                break;
            }
        }
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const keys = await this.maxKeys(query);
        return this._retrieveValues(keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        const isRange = query instanceof KeyRange;
        if (!this._tree.goToUpperBound(isRange ? query.upper : undefined, isRange ? query.upperOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const keys = await this.minKeys(query);
        return this._retrieveValues(keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        const isRange = query instanceof KeyRange;
        if (!this._tree.goToLowerBound(isRange ? query.lower : undefined, isRange ? query.lowerOpen : false)) {
            return new Set();
        }
        return Set.from(this._tree.currentRecord);
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        return (await this.keys(query)).size;
        // The code below does only work for unique indices.
        // if (!(query instanceof KeyRange)) {
        //     return this._tree.length;
        // }
        // if (!this._tree.goToLowerBound(query.lower, query.lowerOpen)) {
        //     return 0;
        // }
        // const start = this._tree.keynum();
        // if (!this._tree.goToUpperBound(query.upper, query.upperOpen)) {
        //     return 0;
        // }
        // const end = this._tree.keynum();
        // return end - start + 1;
    }
}
Class.register(InMemoryIndex);


/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * @implements {IBackend}
 * @implements {ISynchronousObjectStore}
 */
class InMemoryBackend {
    constructor(tableName, codec=null) {
        this._cache = new Map();

        /** @type {Map.<string,InMemoryIndex>} */
        this._indices = new Map();

        this._primaryIndex = new InMemoryIndex(this, /*keyPath*/ undefined, /*multiEntry*/ false, /*unique*/ true);
        this._tableName = tableName;
        this._codec = codec;
    }

    /** @type {boolean} */
    get connected() {
        return true;
    }

    /**
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @abstract
     * @param {string} key The primary key to look for.
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, options = {}) {
        // Ignore expectPresence here, since it is a non-cached synchronous backend!
        const value = this._cache.get(key);
        return (options && options.raw) ? value : this.decode(value, key);
    }

    /**
     * @param {string} key
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>}
     */
    get(key, options = {}) {
        try {
            return Promise.resolve(this.getSync(key, options));
        } catch(e) {
            return Promise.reject(e);
        }
    }

    /**
     * @param {Query|KeyRange} [query]
     * @param {number} [limit]
     * @returns {Promise.<Array.<*>>}
     */
    async values(query = null, limit = null) {
        if (query !== null && query instanceof Query) {
            return query.values(this, limit);
        }
        const values = [];
        for (const key of await this.keys(query, limit)) {
            values.push(await this.get(key));
        }
        return Promise.resolve(values);
    }

    /**
     * @param {Query|KeyRange} [query]
     * @param {number} [limit]
     * @returns {Promise.<Set.<string>>}
     */
    keys(query = null, limit = null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this, limit);
        }
        return this._primaryIndex.keys(query, limit);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        return this._primaryIndex.keyStream(callback, ascending, query);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    valueStream(callback, ascending=true, query=null) {
        return this._primaryIndex.valueStream(callback, ascending, query);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async maxValue(query=null) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    async maxKey(query=null) {
        const keys = await this._primaryIndex.maxKeys(query);
        return Set.sampleElement(keys);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<*>}
     */
    async minValue(query=null) {
        const minKey = await this.minKey(query);
        return this.get(minKey);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<string>}
     */
    async minKey(query=null) {
        const keys = await this._primaryIndex.minKeys(query);
        return Set.sampleElement(keys);
    }

    /**
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        return (await this.keys(query)).size;
    }

    /**
     * @param {string} indexName
     * @returns {IIndex}
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        if (tx._truncated) {
            this.truncateSync();
        }

        const originalValues = new Map();

        for (const key of tx._removed) {
            const oldValue = this.getSync(key);
            if (oldValue) {
                originalValues.set(key, oldValue);
            }
            this._cache.delete(key);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = this.getSync(key);
            if (oldValue) {
                originalValues.set(key, oldValue);
            }
            this._cache.set(key, this.encode(value));
        }

        // Update all indices.
        InMemoryBackend._indexApply(this._primaryIndex, tx, originalValues);
        for (const index of this._indices.values()) {
            InMemoryBackend._indexApply(index, tx, originalValues);
        }
    }

    /**
     * @param {InMemoryIndex} index
     * @param {Transaction} tx
     * @param {Map} originalValues
     * @private
     */
    static _indexApply(index, tx, originalValues) {
        if (tx._truncated) {
            index.truncate();
        }

        for (const key of tx._removed) {
            index.remove(key, originalValues.get(key));
        }
        for (const [key, value] of tx._modified) {
            index.put(key, value, originalValues.get(key));
        }
    }

    /**
     * @returns {Promise}
     */
    async truncate() {
        this.truncateSync();
    }

    truncateSync() {
        this._cache.clear();

        // Truncate all indices.
        this._primaryIndex.truncate();
        for (const index of this._indices.values()) {
            index.truncate();
        }
    }

    /**
     * @param {function(key:string, value:*)} func
     * @returns {Promise}
     */
    async map(func) {
        for (const [key, value] of this._cache) {
            func(key, value);
        }
    }

    /**
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {IndexConfig} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        let { multiEntry = false, unique = false, upgradeCondition = null } = options || {};

        keyPath = keyPath || indexName;
        const index = new InMemoryIndex(this, keyPath, multiEntry, unique);
        this._indices.set(indexName, index);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        let { upgradeCondition = null } = options || {};

        this._indices.delete(indexName);
    }

    /**
     * Method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value.
     */
    decode(value, key) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.decode(value, key);
        }
        return value;
    }

    /**
     * Method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value.
     */
    encode(value) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.encode(value);
        }
        return value;
    }

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<*|function():Promise>} Either the tableName if this is a native, persistent backend
     * or a function that effectively applies the transaction to non-persistent backends.
     */
    async applyCombined(tx) {
        return () => this._apply(tx);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        return true;
    }
}
Class.register(InMemoryBackend);

/**
 * This class represents range queries on an index (primary and secondary).
 */
class KeyRange {
    /**
     * This constructor is only used internally.
     * See static methods for constructing a KeyRange object.
     * @param {*} lower
     * @param {*} upper
     * @param {boolean} lowerOpen
     * @param {boolean} upperOpen
     * @private
     */
    constructor(lower, upper, lowerOpen, upperOpen) {
        this._lower = lower;
        this._upper = upper;
        this._lowerOpen = lowerOpen;
        this._upperOpen = upperOpen;
    }

    /** @type {*} The lower bound of the range. */
    get lower() {
        return this._lower;
    }

    /** @type {*} The upper bound of the range. */
    get upper() {
        return this._upper;
    }

    /** @type {boolean} Whether the lower bound is NOT part of the range. */
    get lowerOpen() {
        return this._lowerOpen;
    }

    /** @type {boolean} Whether the upper bound is NOT part of the range. */
    get upperOpen() {
        return this._upperOpen;
    }

    /** @type {boolean} Whether it is a query for an exact match. */
    get exactMatch() {
        return this._lower === this._upper && !this._lowerOpen && !this.upperOpen;
    }

    /**
     * Returns true if the given key is included in this range.
     * @param {*} key The key to test for.
     * @returns {boolean} True, if the key is included in the range and false otherwise.
     */
    includes(key) {
        return (this._lower === undefined
                || ComparisonUtils.compare(this._lower, key) < 0
                || (!this._lowerOpen && ComparisonUtils.equals(this._lower, key)))
            && (this._upper === undefined
                || ComparisonUtils.compare(this._upper, key) > 0
                || (!this._upperOpen && ComparisonUtils.equals(this._upper, key)));
    }

    /**
     * If upperOpen is false, all keys ≤ upper,
     * all keys < upper otherwise.
     * @param {*} upper The upper bound.
     * @param {boolean} upperOpen Whether the upper bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static upperBound(upper, upperOpen=false) {
        return new KeyRange(undefined, upper, false, upperOpen);
    }

    /**
     * If lowerOpen is false, all keys ≥ lower,
     * all keys > lower otherwise.
     * @param {*} lower The lower bound.
     * @param {boolean} lowerOpen Whether the lower bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static lowerBound(lower, lowerOpen=false) {
        return new KeyRange(lower, undefined, lowerOpen, false);
    }

    /**
     * A range bounded by both a lower and upper bound.
     * lowerOpen and upperOpen decide upon whether < (open) or ≤ (inclusive) comparisons
     * should be used for comparison.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @param {boolean} lowerOpen Whether the lower bound is NOT part of the range.
     * @param {boolean} upperOpen Whether the upper bound is NOT part of the range.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static bound(lower, upper, lowerOpen=false, upperOpen=false) {
        return new KeyRange(lower, upper, lowerOpen, upperOpen);
    }

    /**
     * A range matching only exactly one value.
     * @param {*} value The value to match.
     * @returns {KeyRange} The corresponding KeyRange object.
     */
    static only(value) {
        return new KeyRange(value, value, false, false);
    }
}
Class.register(KeyRange);

/**
 * This is the main implementation of an object store.
 * It uses a specified backend (which itself implements the very same interface)
 * and builds upon this backend to answer queries.
 * The main task of this object store is to manage transactions
 * and ensure read isolation on these transactions.
 * @implements {IObjectStore}
 * @implements {ICommittable}
 */
class ObjectStore {
    /**
     * Creates a new object store based on a backend and an underlying database.
     * The database is only used to determine the connection status.
     * @param {IBackend} backend The backend underlying this object store.
     * @param {JungleDB} db The database underlying the backend.
     * @param {string} [name] The name of the object store if existent.
     */
    constructor(backend, db, name) {
        this._backend = backend;
        this._db = db;
        this._name = name;
        /** @type {Array.<TransactionInfo>} */
        this._stateStack = [];
        this._backendInfo = new TransactionInfo(this._backend, null);
        /**
         * Maps transactions to their TransactionInfo objects.
         * @type {Map.<number|string,TransactionInfo>}
         */
        this._transactions = new Map();
        this._transactions.set(ObjectStore.BACKEND_ID, this._backendInfo);

        /**
         * The set of currently open snapshots.
         * @type {Set.<Snapshot>}
         */
        this._snapshotManager = new SnapshotManager();

        this._synchronizer = new Synchronizer();
    }

    /** @type {JungleDB} */
    get jungleDB() {
        return this._db;
    }

    /** @type {boolean} */
    get connected() {
        return this._backend.connected;
    }

    /** @type {IObjectStore} */
    get _currentState() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1].transaction : this._backend;
    }

    /** @type {TransactionInfo} */
    get _currentStateInfo() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1] : this._backendInfo;
    }

    /** @type {number|string} */
    get _currentStateId() {
        return this._stateStack.length > 0 ? this._stateStack[this._stateStack.length - 1].id : ObjectStore.BACKEND_ID;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.indices;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    get(key, options = {}) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.get(key, options);
    }

    /**
     * Inserts or replaces a key-value pair.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async put(key, value) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        try {
            await tx.put(key, value);
        } catch (err) {
            await tx.abort();
            throw err;
        }
        return tx.commit();
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * Implicitly creates a transaction for this operation and commits it.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async remove(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        try {
            await tx.remove(key);
        } catch (err) {
            await tx.abort();
            throw err;
        }
        return tx.commit();
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, options = {}) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!this._currentState.isSynchronous()) throw new Error('Only works on synchronous backends');
        return this._currentState.getSync(key, options);
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!this._currentState.isSynchronous()) throw new Error('Only works on synchronous backends');
        return this._currentState.isCached(key);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    keys(query = null, limit = null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (query !== null && query instanceof Query) {
            return query.keys(this._currentState, limit);
        }
        return this._currentState.keys(query, limit);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    values(query = null, limit = null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (query !== null && query instanceof Query) {
            return query.values(this._currentState, limit);
        }
        return this._currentState.values(query, limit);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    keyStream(callback, ascending=true, query=null) {
        return this._currentState.keyStream(callback, ascending, query);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    valueStream(callback, ascending=true, query=null) {
        return this._currentState.valueStream(callback, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    maxValue(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.maxValue(query);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    maxKey(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.maxKey(query);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    minKey(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.minKey(query);
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    minValue(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.minValue(query);
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    count(query=null) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.count(query);
    }

    /**
     * This method is only used by transactions internally to commit themselves to the corresponding object store.
     * Thus, the tx argument is non-optional.
     * A call to this method checks whether the given transaction can be applied and pushes it to
     * the stack of applied transactions. When there is no other transaction requiring to enforce
     * read isolation, the state will be flattened and all transactions will be applied to the backend.
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async commit(tx) {
        if (!this._isCommittable(tx)) {
            await this.abort(tx);
            return false;
        }
        await this._commitInternal(tx);
        return true;
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._transactions.has(tx.id)) {
            throw new Error('Can only commit open transactions');
        }

        const info = this._transactions.get(tx.id);

        // Another transaction was already committed.
        return info.isCommittable();
    }

    /**
     * Commits the transaction to the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        throw new Error('Cannot commit object stores');
    }

    /**
     * Is used to commit the transaction.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        const info = this._transactions.get(tx.id);

        // Create new layer on stack (might be immediately removed by a state flattening).
        if (this._stateStack.length >= ObjectStore.MAX_STACK_SIZE) {
            Log.e(ObjectStore, `Transaction stack size exceeded ${this.toStringFull()}`);
            throw new Error('Transaction stack size exceeded');
        }
        this._stateStack.push(info);
        info.close();

        // If this is the last transaction, we push our changes to the underlying layer.
        // This only works if the given transaction does not have dependencies or the current state is the backend.
        if (info.isFlushable()) {
            // The underlying layer *has to be* the last one in our stack.
            await this._flattenState(tx);
        }
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param parent
     * @protected
     */
    _setParent(parent) {
        throw new Error('Unsupported operation');
    }

    /**
     * This method is only used by transactions internally to abort themselves at the corresponding object store.
     * Thus, the tx argument is non-optional.
     * @param {Transaction} tx The transaction to be aborted.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async abort(tx) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');

        if (tx instanceof Snapshot) {
            return this._snapshotManager.abortSnapshot(tx);
        }

        if (!(tx instanceof Transaction) || tx.state !== Transaction.STATE.OPEN || !this._transactions.has(tx.id)) {
            throw new Error('Can only abort open transactions');
        }
        const info = this._transactions.get(tx.id);
        info.abort();

        // If this abortion resolves a conflict, try flattening the state.
        if (info.parent && info.parent.numOpenChildren === 0) {
            await this._flattenState();
        }

        this._transactions.delete(tx.id);
        return true;
    }

    /**
     * This internal method applies a transaction to the current state
     * and tries flattening the stack of transactions.
     * @param {Transaction} [tx] An optional transaction to apply to the current state.
     * @returns {Promise.<boolean>} If a tx is given, this boolean indicates whether the state has been merged.
     * If tx is not given, the return value is false and does not convey a meaning.
     * @private
     */
    _flattenState(tx) {
        return this._synchronizer.push(() => this._flattenStateInternal(tx));
    }

    /**
     * This internal method applies a transaction to the current state
     * and tries flattening the stack of transactions.
     * @param {Transaction} [tx] An optional transaction to apply to the current state.
     * @returns {Promise.<boolean>} If a tx is given, this boolean indicates whether the state has been merged.
     * If tx is not given, the return value is false and does not convey a meaning.
     * @private
     */
    async _flattenStateInternal(tx) {
        // If there is a tx argument, merge it with the current state.
        if (tx && (tx instanceof Transaction)) {
            // Check whether the state can be flattened.
            // For this, the following conditions have to hold:
            // 1. the base state does not have open transactions
            const info = this._transactions.get(tx.id);
            if (!info.isFlushable()) {
                return false;
            }

            // Applying is possible.
            // We apply it first and upon successful application, we update transactions.
            // This way, we ensure that intermediate reads still work and that transactions
            // are still consistent even if the application fails.
            const backend = info.parent.transaction;
            const cleanup = () => {
                // Change pointers in child transactions.
                info.flush();
                this._transactions.delete(tx.id);

                // Look for tx on stack and remove it.
                const statePosition = this._stateStack.indexOf(info);
                if (statePosition >= 0) {
                    this._stateStack.splice(statePosition, 1);
                }

                this._flattenState().catch(Log.w.tag(ObjectStore));
            };

            if (tx.dependency === null) {
                // If we apply to the backend, update the snapshots.
                if (info.parent.isBackend()) {
                    await this._snapshotManager.applyTx(tx, backend);
                }
                try {
                    await backend._apply(tx);
                } catch (err) {
                    // Change pointers in child transactions.
                    info.abort();
                    this._transactions.delete(tx.id);

                    // Look for tx on stack and remove it.
                    const statePosition = this._stateStack.indexOf(info);
                    if (statePosition >= 0) {
                        this._stateStack.splice(statePosition, 1);
                    }
                    tx._setAborted();
                    Log.e(ObjectStore, 'Error while applying transaction', err);
                }
                cleanup();
                return true;
            } else {
                // We apply to the backend, so also update snapshots before the flush.
                return await tx.dependency.onFlushable(tx, cleanup, () => this._snapshotManager.applyTx(tx, backend));
            }
        } else {
            // Check both ends of the stack.
            // Start with the easy part: The last state.
            // Start flattening at the end.
            while (this._stateStack.length > 0) {
                if (!(await this._flattenStateInternal(this._currentState))) {
                    break;
                }
            }
            // Then try flattening from the start.
            while (this._stateStack.length > 0) {
                if (!(await this._flattenStateInternal(this._stateStack[0].transaction))) {
                    break;
                }
            }
            return false;
        }
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        return this._currentState.index(indexName);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {IndexConfig} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        return this._backend.createIndex(indexName, keyPath, options);
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        return this._backend.deleteIndex(indexName, options);
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @param {boolean} [enableWatchdog]
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog=true) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');

        // Prefer synchronous transactions.
        if (this._backend.isSynchronous()) return this.synchronousTransaction(enableWatchdog);

        const tx = new Transaction(this, this._currentState, this, enableWatchdog);
        this._transactions.set(tx.id, new TransactionInfo(tx, this._currentStateInfo));
        return tx;
    }

    /**
     * Creates a new synchronous transaction, ensuring read isolation
     * on the most recently successfully committed state.
     *
     * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
     * might be wrong. Only use synchronous transactions, if unavoidable.
     * @param {boolean} [enableWatchdog]
     * @returns {SynchronousTransaction} The synchronous transaction object.
     */
    synchronousTransaction(enableWatchdog=true) {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = new SynchronousTransaction(this, this._currentState, this, enableWatchdog);
        this._transactions.set(tx.id, new TransactionInfo(tx, this._currentStateInfo));
        return tx;
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return this._backend.isSynchronous();
    }

    /**
     * Creates an in-memory snapshot of the current state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @returns {Snapshot}
     */
    snapshot() {
        if (this._currentStateId !== ObjectStore.BACKEND_ID) {
            return this._currentState.snapshot();
        }
        return this._snapshotManager.createSnapshot(this, this._currentState);
    }

    /**
     * An object store is strongly connected to a backend.
     * Hence, it does not store anything by itself and the _apply method is not supported.
     * @param {Transaction} tx
     * @returns {Promise.<boolean>}
     * @protected
     */
    async _apply(tx) {
        throw new Error('Unsupported operation');
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        if (!this._backend.connected) throw new Error('JungleDB is not connected');
        const tx = this.transaction();
        await tx.truncate();
        return tx.commit();
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        // TODO perhaps use a different strategy here
        if (this._stateStack.length > 0) {
            throw new Error('Cannot close database while transactions are active');
        }
        return this._backend.close();
    }

    /**
     * Method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value.
     */
    decode(value, key) {
        return this._backend.decode(value, key);
    }

    /**
     * Method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value.
     */
    encode(value) {
        return this._backend.encode(value);
    }

    toStringFull() {
        return `ObjectStore{
    stack=[${this._stateStack.map(tx => `{tx=${tx}, open=${tx.numOpenChildren}}`)}],
    db=${this._db}/${this._name ? this._name : 'unnamed'}
}`;
    }

    toString() {
        return `ObjectStore{stackSize=${this._stateStack.length}, db=${this._db}/${this._name ? this._name : 'unnamed'}}`;
    }
}
/** @type {number} The maximum number of states to stack. */
ObjectStore.MAX_STACK_SIZE = 10;
ObjectStore.BACKEND_ID = 'backend';
Class.register(ObjectStore);

class TransactionInfo {
    /**
     * @param {Transaction} transaction
     * @param {TransactionInfo} parentInfo
     * @param {Array.<TransactionInfo>} children
     */
    constructor(transaction, parentInfo, children = []) {
        this.transaction = transaction;
        this.children = children;
        this._parentInfo = parentInfo;
        this._open = true;

        if (this._parentInfo) {
            this._parentInfo.addChild(this);
        }
    }

    /**
     * @param {TransactionInfo} transaction
     */
    addChild(transaction) {
        this.children.push(transaction);
    }

    /**
     * @param {TransactionInfo} transaction
     */
    removeChild(transaction) {
        const i = this.children.indexOf(transaction);
        if (i >= 0) {
            this.children.splice(i, 1);
        }
    }

    flush() {
        if (!this.isBackend()) {
            const parent = this.parent;
            this.parent.removeChild(this);
            for (const /** @type {TransactionInfo} */ child of this.children.slice()) {
                child.parent = parent;
            }
            this.children = [];
            this._parentInfo = null;
        }
    }

    abort() {
        if (!this.isBackend()) {
            this.parent.removeChild(this);
        }
    }

    close() {
        this._open = false;
    }

    /** @type {TransactionInfo} */
    get parent() {
        return this._parentInfo;
    }

    /**
     * @param {TransactionInfo} parent
     */
    set parent(parent) {
        this.parent.removeChild(this);
        this._parentInfo = parent;
        this.parent.addChild(this);
        this.transaction._setParent(parent.transaction);
    }

    /** @type {number} */
    get id() {
        return this.isBackend() ? ObjectStore.BACKEND_ID : this.transaction.id;
    }

    /**
     * @returns {boolean}
     */
    isBackend() {
        return this._parentInfo === null;
    }

    /**
     * @returns {boolean}
     */
    isOpen() {
        return this._open;
    }

    /**
     * @type {number}
     */
    get numOpenChildren() {
        return this.children.filter(child => child.isOpen()).length;
    }


    /**
     * @returns {*|boolean}
     */
    isCommittable() {
        return this._parentInfo && this._parentInfo.children.every(child => child.isOpen());
    }

    /**
     * @returns {boolean}
     */
    isFlushable() {
        return this.parent && this.parent.numOpenChildren === 0 && (this.transaction.dependency === null || this.parent.isBackend());
    }

    toString() {
        return this.transaction.toStringShort();
    }
}

/**
 * This class represents a Query object.
 * Queries are constructed using the static helper methods.
 */
class Query {
    /**
     * Internal helper method that translates an operation to a KeyRange object.
     * @param {Query.OPERATORS} op The operator of the query.
     * @param {*} value The first operand of the query.
     * @param {*} [value2] The optional second operand of the query.
     * @private
     */
    static _parseKeyRange(op, value, value2) {
        switch (op) {
            case Query.OPERATORS.GT:
                return KeyRange.lowerBound(value, true);
            case Query.OPERATORS.GE:
                return KeyRange.lowerBound(value, false);
            case Query.OPERATORS.LT:
                return KeyRange.upperBound(value, true);
            case Query.OPERATORS.LE:
                return KeyRange.upperBound(value, false);
            case Query.OPERATORS.EQ:
                return KeyRange.only(value);
            case Query.OPERATORS.BETWEEN:
                return KeyRange.bound(value, value2, true, true);
            case Query.OPERATORS.WITHIN:
                return KeyRange.bound(value, value2, false, false);
        }
        Log.e(`Unknown operator: ${op}`);
        throw new Error('Unknown operator');
    }

    /**
     * Returns the conjunction of multiple queries.
     * @param {...Query} var_args The list of queries, which all have to be fulfilled.
     * @returns {Query} The conjunction of the queries.
     */
    static and(var_args) {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.AND);
    }

    /**
     * Returns the disjunction of multiple queries.
     * @param {...Query} var_args The list of queries, out of which at least one has to be fulfilled.
     * @returns {Query} The disjunction of the queries.
     */
    static or(var_args) {
        const args = Array.from(arguments);
        return new Query(args, Query.OPERATORS.OR);
    }

    /**
     * Returns a query for the max key of an index.
     * @param {string} indexName The name of the index, whose maximal key the query matches.
     * @returns {Query} The query for the max key of the index.
     */
    static max(indexName) {
        return new Query(indexName, Query.OPERATORS.MAX);
    }

    /**
     * Returns a query for the min key of an index.
     * @param {string} indexName The name of the index, whose minimal key the query matches.
     * @returns {Query} The query for the min key of the index.
     */
    static min(indexName) {
        return new Query(indexName, Query.OPERATORS.MIN);
    }

    /**
     * Returns a query that matches all keys of an index that are less than a value.
     * The query matches all keys k, such that k < val.
     * @param {string} indexName The name of the index.
     * @param {*} val The upper bound of the query.
     * @returns {Query} The resulting query object.
     */
    static lt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LT, val);
    }

    /**
     * Returns a query that matches all keys of an index that are less or equal than a value.
     * The query matches all keys k, such that k ≤ val.
     * @param {string} indexName The name of the index.
     * @param {*} val The upper bound of the query.
     * @returns {Query} The resulting query object.
     */
    static le(indexName, val) {
        return new Query(indexName, Query.OPERATORS.LE, val);
    }

    /**
     * Returns a query that matches all keys of an index that are greater than a value.
     * The query matches all keys k, such that k > val.
     * @param {string} indexName The name of the index.
     * @param {*} val The lower bound of the query.
     * @returns {Query} The resulting query object.
     */
    static gt(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GT, val);
    }

    /**
     * Returns a query that matches all keys of an index that are greater or equal than a value.
     * The query matches all keys k, such that k ≥ val.
     * @param {string} indexName The name of the index.
     * @param {*} val The lower bound of the query.
     * @returns {Query} The resulting query object.
     */
    static ge(indexName, val) {
        return new Query(indexName, Query.OPERATORS.GE, val);
    }

    /**
     * Returns a query that matches all keys of an index that equal to a value.
     * The query matches all keys k, such that k = val.
     * @param {string} indexName The name of the index.
     * @param {*} val The value to look for.
     * @returns {Query} The resulting query object.
     */
    static eq(indexName, val) {
        return new Query(indexName, Query.OPERATORS.EQ, val);
    }

    /**
     * Returns a query that matches all keys of an index that are between two values, excluding the boundaries.
     * The query matches all keys k, such that lower < k < upper.
     * @param {string} indexName The name of the index.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @returns {Query} The resulting query object.
     */
    static between(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.BETWEEN, lower, upper);
    }

    /**
     * Returns a query that matches all keys of an index that are between two values, including the boundaries.
     * The query matches all keys k, such that lower ≤ k ≤ upper.
     * @param {string} indexName The name of the index.
     * @param {*} lower The lower bound.
     * @param {*} upper The upper bound.
     * @returns {Query} The resulting query object.
     */
    static within(indexName, lower, upper) {
        return new Query(indexName, Query.OPERATORS.WITHIN, lower, upper);
    }

    /**
     * Internal constructor for a query.
     * Should not be called directly.
     * @param {string|Array.<Query>} arg Either a list of queries or an index name (depending on the operator).
     * @param {Query.OPERATORS} op The operator to apply.
     * @param {*} [value] The first operand if applicable.
     * @param {*} [value2] The second operand if applicable.
     * @private
     */
    constructor(arg, op, value, value2) {
        // If first argument is an array of queries, this is a combined query.
        if (Array.isArray(arg)) {
            if (arg.some(it => !(it instanceof Query))) {
                throw new Error('Invalid query');
            }
            if (Query.COMBINED_OPERATORS.indexOf(op) < 0) {
                throw new Error('Unknown operator');
            }
            this._queryType = Query.Type.COMBINED;
            this._queries = arg;
            this._op = op;
        }
        // Otherwise we have a single query.
        else {
            if (Query.RANGE_OPERATORS.indexOf(op) >= 0) {
                this._queryType = Query.Type.RANGE;
                this._keyRange = Query._parseKeyRange(op, value, value2);
            } else if (Query.ADVANCED_OPERATORS.indexOf(op) >= 0) {
                this._queryType = Query.Type.ADVANCED;
                this._op = op;
            } else {
                throw new Error('Unknown operator');
            }
            this._indexName = arg;
        }
    }

    /**
     * Returns a promise of an array of objects fulfilling this query.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to this query.
     */
    async values(objectStore, limit = null) {
        const keys = await this._execute(objectStore, limit);
        const resultPromises = [];
        for (const key of keys) {
            resultPromises.push(objectStore.get(key));
        }
        return Promise.all(resultPromises);
    }

    /**
     * Returns a promise of a set of keys fulfilling this query.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     */
    keys(objectStore, limit = null) {
        return this._execute(objectStore, limit);
    }

    /**
     * Internal method to execute a query on an object store.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _execute(objectStore, limit = null) {
        switch (this._queryType) {
            case Query.Type.COMBINED:
                return Promise.resolve(this._executeCombined(objectStore, limit));

            case Query.Type.ADVANCED:
                return Promise.resolve(this._executeAdvanced(objectStore, limit));

            case Query.Type.RANGE:
                return this._executeRange(objectStore, limit);
        }
        return Promise.resolve(new Set());
    }

    /**
     * Internal method for and/or operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeCombined(objectStore, limit = null) {
        // Evaluate children.
        const resultPromises = [];
        for (const query of this._queries) {
            resultPromises.push(query._execute(objectStore, limit));
        }
        const results = await Promise.all(resultPromises);

        if (this._op === Query.OPERATORS.AND) {
            // Provide shortcuts.
            if (results.length === 0) {
                return new Set();
            } else if (results.length === 1) {
                // Limit
                if (limit === null || limit >= 1) {
                    return results[0];
                }
                return new Set();
            }

            // Set intersection of all keys.
            const firstResult = results.shift();
            const intersection = new Set();
            let count = 0;
            for (const val of firstResult) {
                if (results.every(result => result.has(val))) {
                    // Limit
                    if (limit !== null && count >= limit) break;

                    intersection.add(val);
                    count++;
                }
            }
            return intersection;
        } else if (this._op === Query.OPERATORS.OR) {
            // Set union of all keys.
            const union = new Set();
            let count = 0;
            for (const result of results) {
                for (const val of result) {
                    // Limit
                    if (limit !== null && count >= limit) break;

                    union.add(val);
                    count++;
                }
                if (limit !== null && count >= limit) break;
            }
            return union;
        }
        return new Set();
    }

    /**
     * Internal method for min/max operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeAdvanced(objectStore, limit = null) {
        const index = objectStore.index(this._indexName);
        let results = new Set();
        switch (this._op) {
            case Query.OPERATORS.MAX:
                results = await index.maxKeys();
                break;
            case Query.OPERATORS.MIN:
                results = await index.minKeys();
                break;
        }
        return new Set(results.limit(limit));
    }

    /**
     * Internal method for range operators.
     * @param {IObjectStore} objectStore The object store to execute the query on.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to this query.
     * @private
     */
    async _executeRange(objectStore, limit = null) {
        const index = objectStore.index(this._indexName);
        return new Set(await index.keys(this._keyRange, limit));
    }
}
/**
 * Enum for supported operators.
 * @enum {number}
 */
Query.OPERATORS = {
    GT: 0,
    GE: 1,
    LT: 2,
    LE: 3,
    EQ: 4,
    // NEQ: 5, not supported
    BETWEEN: 7,
    WITHIN: 8,
    MAX: 9,
    MIN: 10,
    AND: 11,
    OR: 12
};
Query.RANGE_OPERATORS = [
    Query.OPERATORS.GT,
    Query.OPERATORS.GE,
    Query.OPERATORS.LT,
    Query.OPERATORS.LE,
    Query.OPERATORS.EQ,
    Query.OPERATORS.BETWEEN,
    Query.OPERATORS.WITHIN
];
Query.ADVANCED_OPERATORS = [Query.OPERATORS.MAX, Query.OPERATORS.MIN];
Query.COMBINED_OPERATORS = [Query.OPERATORS.AND, Query.OPERATORS.OR];
/**
 * Enum for query types.
 * Each operator belongs to one of these types as specified above.
 * @enum {number}
 */
Query.Type = {
    RANGE: 0,
    ADVANCED: 1,
    COMBINED: 2
};
Class.register(Query);


/**
 * This class constitutes an InMemoryIndex for Transactions.
 * It unifies the results of keys changed during the transaction
 * with the underlying backend.
 */
class TransactionIndex extends InMemoryIndex {
    /**
     * Derives the indices from the backend and returns a new map of transactions.
     * @param {Transaction} objectStore The transaction the index should be based on.
     * @param {IObjectStore} backend The backend underlying the transaction.
     * @returns {Map.<string,TransactionIndex>} A map containing all indices for the transaction.
     */
    static derive(objectStore, backend) {
        const indices = new Map();
        for (const [name, index] of backend.indices) {
            indices.set(name, new TransactionIndex(objectStore, backend, name, index.keyPath, index.multiEntry, index.unique));
        }
        return indices;
    }

    /** @type {IIndex} The index of the underlying backend. */
    get _index() {
        return this._backend.index(this._databaseDir);
    }

    /**
     * Constructs a new TransactionIndex serving the transaction's changes
     * and unifying the results with the underlying backend.
     * @param {Transaction} objectStore The transaction the index should be based on.
     * @param {IObjectStore} backend The backend underlying the transaction.
     * @param {string|Array.<string>} keyPath The key path of the indexed attribute.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     * @protected
     */
    constructor(objectStore, backend, name, keyPath, multiEntry = false, unique = false) {
        super(objectStore, keyPath, multiEntry, unique);
        this._backend = backend;
        this._databaseDir = name;
    }

    /**
     * Checks for a violation of a unique constraint depending on whether the pair is already in the store or not.
     * @param {*} key
     * @param {*} value
     * @param {boolean} [isInStore]
     * @returns {Promise<void>}
     */
    async checkUniqueConstraint(key, value, isInStore = true) {
        if (!this.unique) {
            return;
        }

        // Calculate secondary keys.
        let iKey = this._indexKey(key, value);
        if (iKey !== undefined) {
            if (!this.multiEntry || !Array.isArray(iKey)) {
                iKey = [iKey];
            }
            // Check whether they already exist.
            for (const secondaryKey of iKey) {
                const count = await this.count(KeyRange.only(secondaryKey));
                if (count > (isInStore ? 1 : 0)) {
                    throw new Error(`Uniqueness constraint violated for key ${secondaryKey} on path ${this._keyPath}`);
                }
            }
        }
    }

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query = null, limit = null) {
        const promises = [];
        if (this._objectStore._truncated) {
            promises.push(new Set());
        } else {
            promises.push(this._index.keys(query, limit));
        }
        promises.push(InMemoryIndex.prototype.keys.call(this, query, limit));
        let [/** @type {Set} */ keys, /** @type {Set} */ newKeys] = await Promise.all(promises);
        // Remove keys that have been deleted or modified.
        keys = keys.difference(this._objectStore._removed);
        keys = keys.difference(this._objectStore._modified.keys());
        return keys.union(newKeys).limit(limit);
    }

    /**
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        const keys = await this.keys(query, limit);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const keys = await this.maxKeys(query);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        let backendKeys;
        if (this._objectStore._truncated) {
            backendKeys = new Set();
        } else {
            backendKeys = await this._index.maxKeys(query);
        }

        // Remove keys that have been deleted or modified.
        let sampleElement = Set.sampleElement(backendKeys);
        let value = undefined, maxIKey = undefined;
        if (sampleElement !== undefined) {
            value = await this._backend.get(sampleElement);
            maxIKey = ObjectUtils.byKeyPath(value, this.keyPath);
        }
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.upperBound(maxIKey, true);
            backendKeys = await this._index.maxKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = Set.sampleElement(backendKeys);
            if (sampleElement !== undefined) {
                value = await this._backend.get(sampleElement);
                maxIKey = ObjectUtils.byKeyPath(value, this.keyPath);
            }
            backendKeys = backendKeys.difference(this._objectStore._removed);
            backendKeys = backendKeys.difference(this._objectStore._modified.keys());

            // If we get out of the range, stop here.
            if (maxIKey && query !== null && !query.includes(maxIKey)) {
                backendKeys = new Set();
                break;
            }
        }

        const newKeys = await InMemoryIndex.prototype.maxKeys.call(this, query);

        if (backendKeys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return backendKeys;
        }

        // Both contain elements, check which one is larger.
        const valueTx = await this._objectStore.get(Set.sampleElement(newKeys));

        const iKeyBackend = maxIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (ComparisonUtils.compare(iKeyBackend, iKeyTx) > 0) {
            return backendKeys;
        } else if (ComparisonUtils.compare(iKeyBackend, iKeyTx) < 0) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const keys = await this.minKeys(query);
        return InMemoryIndex.prototype._retrieveValues.call(this, keys);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        let backendKeys;
        if (this._objectStore._truncated) {
            backendKeys = new Set();
        } else {
            backendKeys = await this._index.minKeys(query);
        }

        // Remove keys that have been deleted or modified.
        let sampleElement = Set.sampleElement(backendKeys);
        let value = undefined, minIKey = undefined;
        if (sampleElement !== undefined) {
            value = await this._backend.get(sampleElement);
            minIKey = ObjectUtils.byKeyPath(value, this.keyPath);
        }
        backendKeys = backendKeys.difference(this._objectStore._removed);
        backendKeys = backendKeys.difference(this._objectStore._modified.keys());

        while (sampleElement !== undefined && backendKeys.size === 0) {
            const tmpQuery = KeyRange.lowerBound(minIKey, true);
            backendKeys = await this._index.minKeys(tmpQuery);

            // Remove keys that have been deleted or modified.
            sampleElement = Set.sampleElement(backendKeys);
            if (sampleElement !== undefined) {
                value = await this._backend.get(sampleElement);
                minIKey = ObjectUtils.byKeyPath(value, this.keyPath);
            }
            backendKeys = backendKeys.difference(this._objectStore._removed);
            backendKeys = backendKeys.difference(this._objectStore._modified.keys());

            // If we get out of the range, stop here.
            if (minIKey && query !== null && !query.includes(minIKey)) {
                backendKeys = new Set();
                break;
            }
        }

        const newKeys = await InMemoryIndex.prototype.minKeys.call(this, query);

        if (backendKeys.size === 0) {
            return newKeys;
        } else if (newKeys.size === 0) {
            return backendKeys;
        }

        // Both contain elements, check which one is larger.
        const valueTx = await this._objectStore.get(Set.sampleElement(newKeys));

        const iKeyBackend = minIKey;
        const iKeyTx = ObjectUtils.byKeyPath(valueTx, this.keyPath);

        if (ComparisonUtils.compare(iKeyBackend, iKeyTx) < 0) {
            return backendKeys;
        } else if (ComparisonUtils.compare(iKeyBackend, iKeyTx) > 0) {
            return newKeys;
        }
        return backendKeys.union(newKeys);
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }
}
Class.register(TransactionIndex);

/**
 * Transactions are created by calling the transaction method on an ObjectStore object.
 * Transactions ensure read-isolation.
 * On a given state, only *one* transaction can be committed successfully.
 * Other transactions based on the same state will end up in a conflicted state if committed.
 * Transactions opened after the successful commit of another transaction will be based on the
 * new state and hence can be committed again.
 * Transactions do *not* check unique constraints of secondary indices before commiting them.
 * @implements {ISynchronousWritableObjectStore}
 * @implements {ICommittable}
 */
class Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * Our transactions have a watchdog enabled by default,
     * logging a warning after a certain time specified by WATCHDOG_TIMER.
     * This helps to detect unclosed transactions preventing to store the state in
     * the persistent backend.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} parent The backend on which the transaction is based,
     * i.e., another transaction or the real database.
     * @param {ICommittable} [managingBackend] The object store managing the transactions,
     * i.e., the ObjectStore object.
     * @param {boolean} [enableWatchdog] If this is is set to true (default),
     * a warning will be logged if left open for longer than WATCHDOG_TIMER.
     * @protected
     */
    constructor(objectStore, parent, managingBackend, enableWatchdog=true) {
        this._id = Transaction._instanceCount++;
        this._objectStore = objectStore;
        this._parent = parent;
        /** @type {ICommittable} */
        this._managingBackend = managingBackend || parent;
        this._modified = new Map();
        this._removed = new Set();
        this._truncated = false;
        this._indices = TransactionIndex.derive(this, parent);

        this._state = Transaction.STATE.OPEN;

        // Keep track of nested transactions.
        /** @type {Set.<Transaction>} */
        this._nested = new Set();
        this._nestedCommitted = false;

        // Handle dependencies due to cross-objectstore transactions.
        /** @type {CombinedTransaction} */
        this._dependency = null;

        this._snapshotManager = new SnapshotManager();

        this._startTime = Date.now();
        this._enableWatchdog = enableWatchdog;
        if (this._enableWatchdog) {
            this._watchdog = setTimeout(() => {
                Log.w(Transaction, `Violation: tx id ${this._id} took longer than expected (still open after ${Transaction.WATCHDOG_TIMER/1000}s), ${this.toString()}.`);
            }, Transaction.WATCHDOG_TIMER);
        }
    }

    /** @type {ObjectStore} */
    get objectStore() {
        return this._objectStore;
    }

    /** @type {boolean} */
    get nested() {
        return this._managingBackend instanceof Transaction;
    }

    /**
     * @type {CombinedTransaction} If existent, a combined transaction encompassing this object.
     */
    get dependency() {
        return this._dependency;
    }

    /** @type {boolean} */
    get connected() {
        return this._managingBackend.connected;
    }

    /** @type {number} A unique transaction id. */
    get id() {
        return this._id;
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * The transaction's current state.
     * @returns {Transaction.STATE}
     */
    get state() {
        return this._state;
    }

    /**
     * Non-async version of _apply that does not update snapshots.
     * Internally applies a transaction to the transaction's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @protected
     */
    _applySync(tx) {
        if (tx._truncated) {
            this.truncateSync();
        }
        for (const [key, value] of tx._modified) {
            this._put(key, value);
        }
        for (const key of tx._removed) {
            this._remove(key);
        }
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        return this.truncateSync();
    }

    /**
     * Non-async variant to empty the object store.
     * @protected
     */
    truncateSync() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        this._truncated = true;
        this._modified.clear();
        this._removed.clear();

        // Update indices.
        for (const index of this._indices.values()) {
            index.truncate();
        }
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, options = {}) {
        // Order is as follows:
        // 1. check if removed,
        // 2. check if modified,
        // 3. check if truncated
        // 4. request from backend
        if (this._removed.has(key)) {
            return undefined;
        }
        if (this._modified.has(key)) {
            if (options && options.raw) {
                return this.encode(this._modified.get(key));
            }
            return this._modified.get(key);
        }
        if (this._truncated) {
            return undefined;
        }
        return this._parent.get(key, options);
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async put(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        // Check indices.
        const constraints = [];
        for (const index of this._indices.values()) {
            constraints.push(index.checkUniqueConstraint(key, value, /*isInStore*/ false));
        }
        await Promise.all(constraints);

        this._put(key, value);
    }

    /**
     * Inserts or replaces a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     */
    putSync(key, value) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        this._put(key, value);
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     * @returns {Promise} The promise resolves after writing to the current object store finished.
     */
    async remove(key) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        this._remove(key);
    }

    /**
     * Removes the key-value pair of the given key from the object store.
     * @param {string} key The primary key to delete along with the associated object.
     */
    removeSync(key) {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed');
        }

        this._remove(key);
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query=null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this);
        }
        let keys = new Set();
        if (!this._truncated) {
            keys = await this._parent.keys(query);
        }
        keys = keys.difference(this._removed);
        for (const key of this._modified.keys()) {
            if (query === null || query.includes(key)) {
                keys.add(key);
            }
        }
        return keys;
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query=null) {
        if (query !== null && query instanceof Query) {
            return query.values(this);
        }
        const keys = await this.keys(query);
        const valuePromises = [];
        for (const key of keys) {
            valuePromises.push(this.get(key));
        }
        return Promise.all(valuePromises);
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async keyStream(callback, ascending=true, query=null) {
        // TODO Optimize this sorting step.
        let keys = Array.from(this._modified.keys());
        if (query instanceof KeyRange) {
            keys = keys.filter(key => query.includes(key));
        }
        keys = keys.sort();

        let txIt = keys.iterator(ascending);
        if (!this._truncated) {
            let stopped = false;

            await this._parent.keyStream(key => {
                // Iterate over TxKeys as long as they are smaller (ascending) or larger (descending).
                while (txIt.hasNext() && ((ascending && ComparisonUtils.compare(txIt.peek(), key) < 0) || (!ascending && ComparisonUtils.compare(txIt.peek(), key) > 0))) {
                    const currentTxKey = txIt.next();
                    if (!callback(currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                }
                // Special case: what if next key is identical (-> modified)?
                // Present modified version and continue.
                if (txIt.hasNext() && ComparisonUtils.equals(txIt.peek(), key)) {
                    const currentTxKey = txIt.next();
                    if (!callback(currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                    return true;
                }
                // Then give key of the backend's key stream.
                // But only if it hasn't been removed (lazy operator prevents calling callback in this case).
                if (!this._removed.has(key) && !callback(key)) {
                    // Do not continue iteration.
                    stopped = true;
                    return false;
                }
                return true;
            }, ascending, query);

            // Do not continue, if already stopped.
            if (stopped) {
                return;
            }
        }

        // Iterate over the remaining TxKeys.
        while (txIt.hasNext()) {
            if (!callback(txIt.next())) {
                break;
            }
        }
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        // TODO Optimize this sorting step.
        let keys = Array.from(this._modified.keys());
        if (query instanceof KeyRange) {
            keys = keys.filter(key => query.includes(key));
        }
        keys = keys.sort();

        let txIt = keys.iterator(ascending);
        if (!this._truncated) {
            let stopped = false;

            await this._parent.valueStream((value, key) => {
                // Iterate over TxKeys as long as they are smaller (ascending) or larger (descending).
                while (txIt.hasNext() && ((ascending && ComparisonUtils.compare(txIt.peek(), key) < 0) || (!ascending && ComparisonUtils.compare(txIt.peek(), key) > 0))) {
                    const currentTxKey = txIt.next();
                    const value = this._modified.get(currentTxKey);
                    if (!callback(value, currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                }
                // Special case: what if next key is identical (-> modified)?
                // Present modified version and continue.
                if (txIt.hasNext() && ComparisonUtils.equals(txIt.peek(), key)) {
                    const currentTxKey = txIt.next();
                    const value = this._modified.get(currentTxKey);
                    if (!callback(value, currentTxKey)) {
                        // Do not continue iteration.
                        stopped = true;
                        return false;
                    }
                    return true;
                }
                // Then give key of the backend's key stream.
                // But only if it hasn't been removed (lazy operator prevents calling callback in this case).
                if (!this._removed.has(key) && !callback(value, key)) {
                    // Do not continue iteration.
                    stopped = true;
                    return false;
                }
                return true;
            }, ascending, query);

            // Do not continue, if already stopped.
            if (stopped) {
                return;
            }
        }

        // Iterate over the remaining TxKeys.
        while (txIt.hasNext()) {
            const key = txIt.next();
            const value = await this.get(key);
            if (!callback(value, key)) {
                break;
            }
        }
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {
        const maxKey = await this.maxKey(query);
        return this.get(maxKey);
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {
        // Take underlying maxKey.
        let maxKey = undefined;
        if (!this._truncated) {
            maxKey = await this._parent.maxKey(query);
        }

        // If this key has been removed, find next best key.
        while (maxKey !== undefined && this._removed.has(maxKey)) {
            const tmpQuery = KeyRange.upperBound(maxKey, true);
            maxKey = await this._parent.maxKey(tmpQuery);

            // If we get out of the range, stop here.
            if (query !== null && !query.includes(maxKey)) {
                maxKey = undefined;
                break;
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (maxKey === undefined || ComparisonUtils.compare(key, maxKey) > 0)) {
                maxKey = key;
            }
        }
        return maxKey;
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {
        const minKey = await this.minKey(query);
        return this.get(minKey);
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {
        // Take underlying minKey.
        let minKey = undefined;
        if (!this._truncated) {
            minKey = await this._parent.minKey(query);
        }

        // If this key has been removed, find next best key.
        while (minKey !== undefined && this._removed.has(minKey)) {
            const tmpQuery = KeyRange.lowerBound(minKey, true);
            minKey = await this._parent.minKey(tmpQuery);

            // If we get out of the range, stop here.
            if (query !== null && !query.includes(minKey)) {
                minKey = undefined;
                break;
            }
        }

        for (const key of this._modified.keys()) {
            // Find better maxKey in modified data.
            if ((query === null || query.includes(key)) && (minKey === undefined || key < minKey)) {
                minKey = key;
            }
        }
        return minKey;
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        // Unfortunately, we cannot do better than getting keys + counting.
        return (await this.keys(query)).size;
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Alias for abort.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    close() {
        return this.abort();
    }

    /**
     * Creates a nested transaction, ensuring read isolation.
     * This makes the current transaction read-only until all sub-transactions have been closed (committed/aborted).
     * The same semantic for commits applies: Only the first transaction that commits will be applied. Subsequent transactions will be conflicted.
     * This behaviour has one exception: If all nested transactions are closed, the outer transaction returns to a normal state and new nested transactions can again be created and committed.
     * @param {boolean} [enableWatchdog]
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog = true) {
        if (this._state !== Transaction.STATE.OPEN && this._state !== Transaction.STATE.NESTED) {
            throw new Error('Transaction already closed');
        }
        const tx = new Transaction(this._objectStore, this, this, enableWatchdog);
        this._nested.add(tx);
        this._state = Transaction.STATE.NESTED;
        return tx;
    }


    /**
     * Creates a nested synchronous transaction, ensuring read isolation.
     * This makes the current transaction read-only until all sub-transactions have been closed (committed/aborted).
     * The same semantic for commits applies: Only the first transaction that commits will be applied. Subsequent transactions will be conflicted.
     * This behaviour has one exception: If all nested transactions are closed, the outer transaction returns to a normal state and new nested transactions can again be created and committed.
     * @param {boolean} [enableWatchdog]
     * @returns {SynchronousTransaction} The transaction object.
     */
    synchronousTransaction(enableWatchdog = true) {
        if (this._state !== Transaction.STATE.OPEN && this._state !== Transaction.STATE.NESTED) {
            throw new Error('Transaction already closed');
        }
        const tx = new SynchronousTransaction(this._objectStore, this, this, enableWatchdog);
        this._nested.add(tx);
        this._state = Transaction.STATE.NESTED;
        return tx;
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return false;
    }

    /**
     * Creates an in-memory snapshot of this state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @returns {Snapshot}
     */
    snapshot() {
        if (this.state !== Transaction.STATE.COMMITTED) {
            const snapshot = this._managingBackend.snapshot();
            snapshot.inherit(this);
            return snapshot;
        }
        return this._snapshotManager.createSnapshot(this._objectStore, this);
    }

    toString() {
        return `Transaction{id=${this._id}, changes=±${this._modified.size+this._removed.size}, truncated=${this._truncated}, objectStore=${this._objectStore}, state=${this._state}, dependency=${this._dependency}}`;
    }

    toStringShort() {
        return `Transaction{id=${this._id}, changes=±${this._modified.size+this._removed.size}, truncated=${this._truncated}, state=${this._state}, dependency=${this._dependency}}`;
    }

    /**
     * Commits a transaction to the underlying backend.
     * The state is only written to the persistent backend if no other transaction is open.
     * If the commit was successful, new transactions will always be based on the new state.
     * There are two outcomes for a commit:
     * If there was no other transaction committed that was based on the same state,
     * it will be successful and change the transaction's state to COMMITTED (returning true).
     * Otherwise, the state will be CONFLICTED and the method will return false.
     *
     * Note that transactions may fail since secondary index constraints are *not* checked in transactions.
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit(tx) {
        // Transaction is given, so check whether this is a nested one.
        if (tx !== undefined) {
            if (!this._isCommittable(tx)) {
                await this.abort(tx);
                return false;
            }

            await this._commitInternal(tx);
            return true;
        }

        if (this._dependency !== null) {
            return this._dependency.commit();
        }

        await this._checkConstraints();

        return this._commitBackend();
    }

    /**
     * Aborts a transaction and (if this was the last open transaction) potentially
     * persists the most recent, committed state.
     * @param {Transaction} [tx] The transaction to be applied, only used internally.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async abort(tx) {
        // Transaction is given, so check whether this is a nested one.
        if (tx !== undefined) {
            // Handle snapshots.
            if (tx instanceof Snapshot) {
                return this._snapshotManager.abortSnapshot(tx);
            }

            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw new Error('Can only abort open, nested transactions');
            }
            this._nested.delete(tx);
            // If there are no more nested transactions, change back to OPEN state.
            if (this._nested.size === 0) {
                this._state = Transaction.STATE.OPEN;
                this._nestedCommitted = false;
            }
            return true;
        }

        if (this._dependency !== null) {
            return this._dependency.abort();
        }

        return this._abortBackend();
    }

    /**
     * Internally applies a transaction to the transaction's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only apply transactions');
        }

        // First handle snapshots.
        await this._snapshotManager.applyTx(tx, this);

        this._applySync(tx);
    }

    /**
     * Commits the transaction to the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Transaction already closed or in nested state');
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }

        const commitStart = Date.now();
        if (await this._managingBackend.commit(this)) {
            this._state = Transaction.STATE.COMMITTED;
            this._performanceCheck(commitStart, 'commit');
            this._performanceCheck();
            return true;
        } else {
            this._state = Transaction.STATE.CONFLICTED;
            this._performanceCheck(commitStart, 'commit');
            this._performanceCheck();
            return false;
        }
    }

    /**
     * @param {number} [startTime]
     * @param {string} [functionName]
     * @private
     */
    _performanceCheck(startTime=this._startTime, functionName=null) {
        const executionTime = Date.now() - startTime;
        functionName = functionName ? ` function '${functionName}'` : '';
        if (executionTime > Transaction.WATCHDOG_TIMER) {
            Log.w(Transaction, `Violation: tx id ${this._id}${functionName} took ${(executionTime/1000).toFixed(2)}s (${this.toString()}).`);
        }
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @param {Transaction} [tx] The transaction to be applied, if not given checks for the this transaction.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        if (tx !== undefined) {
            // Make sure transaction is based on this transaction.
            if (!this._nested.has(tx) || tx.state !== Transaction.STATE.OPEN) {
                throw new Error('Can only commit open, nested transactions');
            }
            return !this._nestedCommitted;
        }
        return this._managingBackend._isCommittable(this);
    }

    /**
     * Is used to commit the transaction to the in memory state.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        this._nested.delete(tx);
        // Apply nested transaction.
        this._nestedCommitted = true;
        await this._apply(tx);
        // If there are no more nested transactions, change back to OPEN state.
        if (this._nested.size === 0) {
            this._state = Transaction.STATE.OPEN;
            this._nestedCommitted = false;
        }
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param parent
     * @protected
     */
    _setParent(parent) {
        this._parent = parent;
    }

    /**
     * Aborts a transaction on the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async _abortBackend() {
        if (this._state === Transaction.STATE.ABORTED || this._state === Transaction.STATE.CONFLICTED) {
            return true;
        }
        if (this._state !== Transaction.STATE.OPEN && this._state !== Transaction.STATE.NESTED) {
            throw new Error('Transaction already closed');
        }
        if (this._state === Transaction.STATE.NESTED) {
            await Promise.all(Array.from(this._nested).map(tx => tx.abort()));
        }
        if (this._enableWatchdog) {
            clearTimeout(this._watchdog);
        }
        const abortStart = Date.now();
        await this._managingBackend.abort(this);
        this._setAborted();
        this._performanceCheck(abortStart, 'abort');
        this._performanceCheck();
        return true;
    }

    /**
     * Sets the state to aborted.
     */
    _setAborted() {
        this._state = Transaction.STATE.ABORTED;
    }

    /**
     * Internal method for inserting/replacing a key-value pair.
     * @param {string} key The primary key to associate the value with.
     * @param {*} value The value to write.
     * @protected
     */
    _put(key, value) {
        this._removed.delete(key);
        const localOldValue = this._modified.get(key);
        this._modified.set(key, value);

        // Update indices.
        for (const index of this._indices.values()) {
            index.put(key, value, localOldValue);
        }
    }

    /**
     * Internal method for removing a key-value pair.
     * @param {string} key The primary key to delete along with the associated object.
     * @protected
     */
    _remove(key) {
        this._removed.add(key);
        const localOldValue = this._modified.get(key);
        this._modified.delete(key);

        // Update indices.
        for (const index of this._indices.values()) {
            index.remove(key, localOldValue);
        }
    }

    /**
     * Is used to check constraints before committing.
     * If a constraint is not satisfied, the commitable is aborted and an exception is thrown.
     * @returns {Promise.<boolean>}
     * @throws
     * @protected
     */
    async _checkConstraints() {
        // Check unique indices.
        // TODO: Improve performance (|modified| count queries).
        const constraintChecks = [];
        for (const /** @type {TransactionIndex} */ index of this._indices.values()) {
            if (!index.unique) continue;
            for (const [key, value] of this._modified) {
                constraintChecks.push(index.checkUniqueConstraint(key, value));
            }
        }
        if (constraintChecks.length > 0) {
            try {
                await Promise.all(constraintChecks);
            } catch (e) {
                await this.abort();
                throw e;
            }
        }
    }

    /**
     * Method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value.
     */
    decode(value, key) {
        return this._objectStore.decode(value, key);
    }

    /**
     * Method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @returns {*} The encoded value.
     */
    encode(value) {
        return this._objectStore.encode(value);
    }
}
/** @type {number} Milliseconds to wait until automatically aborting transaction. */
Transaction.WATCHDOG_TIMER = 5000 /*ms*/;
/**
 * The states of a transaction.
 * New transactions are in the state OPEN until they are aborted, committed or a nested transaction is created.
 * Aborted transactions move to the state ABORTED.
 * Committed transactions move to the state COMMITTED,
 * if no other transaction has been applied to the same state.
 * Otherwise, they change their state to CONFLICTED.
 * When creating a nested (not read-isolated) transaction on top of a transaction,
 * the outer transaction moves to the state NESTED until the inner transaction is either aborted or committed.
 * Again, only one inner transaction may be committed.
 * @enum {number}
 */
Transaction.STATE = {
    OPEN: 0,
    COMMITTED: 1,
    ABORTED: 2,
    CONFLICTED: 3,
    NESTED: 4
};
Transaction._instanceCount = 0;
Class.register(Transaction);

/**
 * Synchronous transactions avoid unnecessary async/await calls by preloading and caching
 * all necessary key-value-pairs.
 *
 * WARNING: If not all required key-value-pairs are preloaded, the results of any call on a synchronous transaction
 * might be wrong. Only use synchronous transactions, if unavoidable.
 * @implements {ISynchronousObjectStore}
 * @implements {ICommittable}
 * @extends {Transaction}
 */
class SynchronousTransaction extends Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * Our transactions have a watchdog enabled by default,
     * logging a warning after a certain time specified by WATCHDOG_TIMER.
     * This helps to detect unclosed transactions preventing to store the state in
     * the persistent backend.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} parent The backend on which the transaction is based,
     * i.e., another transaction or the real database.
     * @param {ICommittable} [managingBackend] The object store managing the transactions,
     * i.e., the ObjectStore object.
     * @param {boolean} [enableWatchdog] If this is is set to true (default),
     * a warning will be logged if left open for longer than WATCHDOG_TIMER.
     * @protected
     */
    constructor(objectStore, parent, managingBackend, enableWatchdog=true) {
        super(objectStore, parent, managingBackend, enableWatchdog);
        /** @type {Map.<string,*>} */
        this._cache = new Map();
    }

    /**
     * This method preloads a set of keys and caches them.
     * It can be called as often as needed.
     * @param {Array.<string>} keys The keys to preload.
     * @return {Promise}
     */
    preload(keys) {
        keys = keys.filter(key => !this.isCached(key));
        return Promise.all(keys.map(key => this.get(key)));
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        // This also prevents double caching.
        return this._cache.has(key) || (this._parent.isSynchronous() ? this._parent.isCached(key) : false);
    }

    /**
     * @param {string} key
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     */
    async get(key, options = {}) {
        options.expectPresence = false;
        // Use cache or ask parent.
        let value;
        if (this.isCached(key)) {
            value = this.getSync(key, options);
        } else {
            value = await Transaction.prototype.get.call(this, key, options);
            if (options && options.raw) {
                this._cache.set(key, this.decode(value, key));
            } else {
                this._cache.set(key, value);
            }
        }
        return value;
    }

    /**
     * Internal method to query cache.
     * @param {string} key
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @return {*} The cached value.
     * @private
     */
    _getCached(key, options = {}) {
        const { expectPresence = true } = options || {};
        let value = this._cache.get(key);

        // Use cache only if the parent is not synchronous.
        if (!value && this._parent.isSynchronous()) {
            return this._parent.getSync(key, options);
        }

        if (expectPresence && !value) {
            throw new Error(`Missing key in cache: ${key}`);
        }

        // Raw requests
        if (options && options.raw) {
            value = this.encode(value);
        }

        return value;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, options = {}) {
        // Order is as follows:
        // 1. check if removed,
        // 2. check if modified,
        // 3. check if truncated
        // 4. request from backend
        if (this._removed.has(key)) {
            return undefined;
        }
        if (this._modified.has(key)) {
            if (options && options.raw) {
                return this.encode(this._modified.get(key));
            }
            return this._modified.get(key);
        }
        if (this._truncated) {
            return undefined;
        }
        return this._getCached(key, options);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @override
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }
}
Class.register(SynchronousTransaction);

/**
 * Snapshots present a read-only version of a specific state.
 * As long as a snapshot is not aborted, the object store will reflect changes to the state
 * in form of the differences to the originating state in the snapshot.
 * This makes efficient queries against a fixed state possible without blocking other transactions
 * to commit.
 * @extends {Transaction}
 */
class Snapshot extends Transaction {
    /**
     * This constructor should only be called by an ObjectStore object.
     * @param {ObjectStore} objectStore The object store this transaction belongs to.
     * @param {IObjectStore} backend The backend this transaction is based on.
     * @protected
     */
    constructor(objectStore, backend) {
        super(objectStore, backend, objectStore, false);
    }

    /**
     * A specific set of changes can be assumed to be already applied by providing a Transaction or Snapshot.
     * These differences will be inherited while the backend of the snapshot remains the current state.
     * This is useful, if we have a transaction/snapshot to a previous state, which we do not want to commit.
     * Then, we can still base our snapshot on this earlier state although the current backend is already ahead.
     * @param {Transaction} tx A transaction or snapshot containing changes that have already been applied.
     * @protected
     */
    inherit(tx) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only inherit transactions');
        }

        return super._applySync(tx);
    }

    /**
     * Internally applies a transaction to the snapshot state.
     * In contrast to transactions, this tries to reflect the old state in the snapshot.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only apply transactions');
        }
        if (tx._truncated) {
            // Need to copy complete old state.
            await this.valueStream((value, key) => {
                if (!this._modified.has(key)) {
                    this._put(key, value);
                }
                return true;
            });
        }
        for (const [key, value] of tx._modified) {
            // Continue if we already have the old value for this key.
            if (this._modified.has(key)) {
                continue;
            }
            let oldValue = await this.get(key);
            // If this key is newly introduced,
            // we have to mark it as removed to maintain our state.
            if (!oldValue) {
                this._remove(key, value);
            } else {
                // Otherwise store oldValue.
                this._put(key, oldValue, value);
            }
        }
        for (const key of tx._removed) {
            // Continue if we already have the old value for this key.
            if (this._modified.has(key)) {
                continue;
            }
            // Removed values have to be remembered.
            let oldValue = await this.get(key);
            this._put(key, oldValue);
        }
    }

    /**
     * Unsupported operation for snapshots.
     * @returns {Promise}
     * @override
     */
    async truncate() {
        throw new Error('Unsupported operation on snapshots: truncate');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    truncateSync() {
        throw new Error('Unsupported operation on snapshots: truncateSync');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @throws
     */
    async commit(tx) {
        throw new Error('Cannot commit snapshots: commit');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @protected
     * @param {Transaction} [tx] The transaction to be applied, if not given checks for the this transaction.
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable(tx) {
        return false;
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        throw new Error('Cannot commit snapshots');
    }

    /**
     * Commits the transaction to the backend.
     * @override
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @protected
     */
    async _commitBackend() {
        throw new Error('Cannot commit snapshots');
    }

    /**
     * Aborts a snapshot and stops updating its diff.
     * @override
     * @param [tx]
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    abort(tx) {
        return this._abortBackend();
    }

    /**
     * Aborts a transaction on the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @override
     */
    async _abortBackend() {
        if (this._state !== Transaction.STATE.OPEN) {
            throw new Error('Snapshot already closed');
        }
        const result = await this._managingBackend.abort(this);
        if (!result) {
            return false;
        }

        this._state = Transaction.STATE.ABORTED;

        // Cleanup.
        this._truncated = true;
        this._modified.clear();
        this._removed.clear();

        // Update indices.
        for (const index of this._indices.values()) {
            index.truncate();
        }

        return true;
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @returns {Promise}
     */
    async put(key, value) {
        throw new Error('Unsupported operation on snapshots: put');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    putSync(key, value) {
        throw new Error('Unsupported operation on snapshots: putSync');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     * @returns {Promise}
     */
    async remove(key) {
        throw new Error('Unsupported operation on snapshots: remove');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    removeSync(key) {
        throw new Error('Unsupported operation on snapshots: removeSync');
    }

    /**
     * Alias for abort.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    close() {
        return this.abort();
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    transaction() {
        throw new Error('Unsupported operation on snapshots: transaction');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    synchronousTransaction() {
        throw new Error('Unsupported operation on snapshots: synchronousTransaction');
    }

    /**
     * Unsupported operation for snapshots.
     * @override
     */
    snapshot() {
        throw new Error('Unsupported operation on snapshots: snapshot');
    }
}
Class.register(Snapshot);

/**
 * Defines the functionality needed for handling snapshots.
 * @abstract
 */
class SnapshotManager {
    constructor() {
        this._snapshots = new Set();
    }

    /**
     * Creates an in-memory snapshot of the current state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @param {ObjectStore} objectStore
     * @param {IObjectStore} backend
     * @returns {Snapshot}
     */
    createSnapshot(objectStore, backend) {
        const snapshot = new Snapshot(objectStore, backend);
        this._snapshots.add(snapshot);
        return snapshot;
    }


    /**
     * Aborts a snapshot.
     * @param {Snapshot} snapshot
     * @returns {boolean} A promise of the success outcome.
     */
    abortSnapshot(snapshot) {
        return this._snapshots.delete(snapshot);
    }

    /**
     * Updates the snapshots managed by this class.
     * @param {Transaction} tx The transaction to apply.
     * @param {IObjectStore} backend
     * @returns {Promise} The promise resolves after applying the transaction.
     */
    async applyTx(tx, backend) {
        if (!(tx instanceof Transaction)) {
            throw new Error('Can only apply transactions');
        }

        // First handle snapshots:
        // - Apply tx to own snapshots.
        // - Take over new snapshots.
        const applications = [];
        for (const snapshot of this._snapshots) {
            applications.push(snapshot._apply(tx));
        }
        for (const snapshot of tx._snapshotManager) {
            snapshot._backend = backend;
            this._snapshots.add(snapshot);
        }
        return Promise.all(applications);
    }

    /**
     * Returns an iterator over the snapshots.
     * @returns {Iterator.<Snapshot>}
     */
    [Symbol.iterator]() {
        return this._snapshots.values();
    }
}
Class.register(SnapshotManager);

/**
 * This class represents a combined transaction across object stores.
 * @implements {ICommittable}
 */
class CombinedTransaction {
    /**
     * @param {...Transaction} transactions The transactions to build the combined transaction from.
     */
    constructor(...transactions) {
        if (!this.isConsistent(transactions)) {
            throw new Error('Given set of transactions violates rules for combined transactions');
        }
        this._transactions = transactions;
        /** @type {Map.<Transaction,function()>} */
        this._flushable = new Map();
        /** @type {Map.<Transaction,function()>} */
        this._preprocessing = [];

        // Update members.
        this._dependency = this;
    }

    /** @type {JungleDB} */
    get backend() {
        return this._jdb;
    }

    /** @type {Array.<Transaction>} */
    get transactions() {
        return this._transactions;
    }

    /**
     * Verifies the two most important consistency rules for combined transactions:
     * 1. only transactions from different object stores
     * 2. only open transactions
     * 3. only transactions from the same JungleDB instance
     * 4. only non-nested transactions
     * @param {Array.<Transaction>} transactions
     * @returns {boolean} Whether the given set of transactions is suitable for a combined transaction.
     */
    isConsistent(transactions) {
        const objectStores = new Set();
        this._jdb = null;
        for (const tx of transactions) {
            // Rule 2 is violated:
            if (tx.state !== Transaction.STATE.OPEN) {
                return false;
            }
            // Rule 4 is violated:
            if (tx.nested) {
                return false;
            }
            // Rule 1 is violated:
            if (objectStores.has(tx._objectStore)) {
                return false;
            }
            // Rule 3 is violated:
            if (this._jdb === null) {
                this._jdb = tx._objectStore.jungleDB;
            } else if (this._jdb !== tx._objectStore.jungleDB && tx._objectStore.jungleDB !== null) { // null = InMemory
                return false;
            }
            objectStores.add(tx._objectStore);
        }
        return true;
    }

    /**
     * To be called when a transaction is flushable to the persistent state.
     * Triggers combined flush as soon as all transactions are ready.
     * @param {Transaction} tx Transaction to be reported flushable.
     * @param {function()} [callback] A callback to be called after the transaction is flushed.
     * @param {function():Promise} [preprocessing] A callback to be called right before the transaction is flushed.
     * @returns {Promise.<boolean>} Whether the flushing has been triggered.
     */
    async onFlushable(tx, callback=null, preprocessing=null) {
        // Save as flushable and prepare and flush only if all are flushable.
        // Afterwards call the callbacks to cleanup the ObjectStores' transaction stacks.
        this._flushable.set(tx, callback);
        if (preprocessing !== null) {
            this._preprocessing.push(preprocessing);
        }

        // All are flushable, so go ahead.
        if (this._transactions.every(tx => this._flushable.has(tx))) {
            // Allow to prepare final flush.
            const preprocessings = [];
            for (const f of this._preprocessing) {
                preprocessings.push(f());
            }
            await Promise.all(preprocessings);

            await JungleDB.commitCombined(this);
            for (const value of this._flushable.values()) {
                value();
            }
            return true;
        }
        return false;
    }

    /**
     * Is used to commit the state of an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to commit a transaction to the underlying store.
     * If the commit was successful, the method returns true, and false otherwise.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    async commit() {
        if (this._isCommittable()) {
            await this._checkConstraints();

            await this._commitBackend();
            return true;
        }
        await this.abort();
        return false;
    }

    /**
     * Is used to abort an open transaction.
     * A user only needs to call this method on Transactions without arguments.
     * The optional tx argument is only used internally, in order to abort a transaction on the underlying store.
     * @returns {Promise} The promise resolves after successful abortion of the transaction.
     */
    abort() {
        return this._abortBackend();
    }

    /**
     * Aborts a transaction on the backend.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     * @override
     */
    async _abortBackend() {
        return (await Promise.all(this._transactions.map(tx => tx._abortBackend()))).every(r => r);
    }

    /**
     * Creates a new transaction, ensuring read isolation
     * on the most recently successfully committed state.
     * @param {boolean} [enableWatchdog]
     * @returns {Transaction} The transaction object.
     */
    transaction(enableWatchdog) {
        throw new Error('Unsupported operation');
    }

    /**
     * Creates an in-memory snapshot of the current state.
     * This snapshot only maintains the differences between the state at the time of the snapshot
     * and the current state.
     * To stop maintaining the snapshot, it has to be aborted.
     * @returns {Snapshot}
     */
    snapshot() {
        throw new Error('Unsupported operation');
    }

    /**
     * Is used to probe whether a transaction can be committed.
     * This, for example, includes a check whether another transaction has already been committed.
     * @protected
     * @returns {boolean} Whether a commit will be successful.
     */
    _isCommittable() {
        return this._transactions.every(tx => tx._isCommittable());
    }

    /**
     * Is used to check constraints before committing.
     * If a constraint is not satisfied, the commitable is aborted and an exception is thrown.
     * @returns {Promise.<boolean>}
     * @throws
     * @protected
     */
    async _checkConstraints() {
        try {
            await Promise.all(this._transactions.map(tx => tx._checkConstraints()));
        } catch (e) {
            await this.abort();
            throw e;
        }
    }

    /**
     * Is used to commit the transaction.
     * @protected
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitBackend() {
        return (await Promise.all(this._transactions.map(tx => tx._commitBackend()))).every(r => r);
    }

    /**
     * Unsupported operation for snapshots.
     * @protected
     * @param {Transaction} tx The transaction to be applied.
     * @returns {Promise} A promise that resolves upon successful application of the transaction.
     */
    async _commitInternal(tx) {
        throw new Error('Cannot commit transactions to a combined transaction');
    }

    /**
     * Allows to change the backend of a Transaction when the state has been flushed.
     * @param parent
     * @protected
     */
    _setParent(parent) {
        throw new Error('Unsupported operation');
    }

    /**
     * Sets a new CombinedTransaction as dependency.
     * @param {CombinedTransaction} dependency
     * @protected
     */
    set _dependency(dependency) {
        for (const tx of this._transactions) {
            tx._dependency = dependency;
        }
    }

    /**
     * @type {CombinedTransaction} If existent, a combined transaction encompassing this object.
     */
    get dependency() {
        return this;
    }

    /**
     * Returns the object store this transaction belongs to.
     * @type {ObjectStore}
     */
    get objectStore() {
        throw new Error('Unsupported operation');
    }

    toString() {
        return `CombinedTransaction{size=${this._transactions.length}, states=[${this._transactions.map(tx => tx.state)}]}`;
    }
}
Class.register(CombinedTransaction);

class LogNative {
    constructor() {
        this._global_level = Log.TRACE;
        this._tag_levels = {};
        this._chalk = require('chalk');
    }

    isLoggable(tag, level) {
        if (tag && this._tag_levels[tag]) {
            return this._tag_levels[tag] <= level;
        }
        return this._global_level <= level;
    }

    setLoggable(tag, level) {
        this._tag_levels[tag] = level;
    }

    /**
     * @param {Log.Level} level
     * @param {string} tag
     * @param {Array} args
     */
    msg(level, tag, args) {
        if (!this.isLoggable(tag, level)) return;
        if (tag && tag.name) tag = tag.name;
        if (tag) args.unshift(tag + ':');
        let prefix = `[${Log.Level.toStringTag(level)} ${new Date().toTimeString().substr(0, 8)}] `;
        const chalk = this._chalk;
        if (level >= Log.ERROR) {
            console.log(prefix + chalk.red(args.join(' ')));
        } else if (level >= Log.WARNING) {
            console.log(prefix + chalk.yellow(args.join(' ')));
        } else if (level >= Log.INFO) {
            console.log(prefix + chalk.cyan(args.join(' ')));
        } else if (level >= Log.DEBUG) {
            console.log(prefix + chalk.magenta(args.join(' ')));
        } else if (level <= Log.TRACE) {
            console.trace(prefix + args.join(' '));
        } else {
            console.log(prefix + args.join(' '));
        }
    }
}
Class.register(LogNative);

/**
 * A simple object implementing parts of the Transaction's class.
 * It is used to keep track of modifications on a persistent index
 * and to apply them all at once.
 * This class is to be used only internally.
 */
class EncodedLMDBTransaction {
    /**
     * Create a new IndexTransaction.
     * @param {LMDBBaseBackend} backend
     */
    constructor(backend) {
        this._modified = [];
        this._removed = new Set();
        this._truncated = false;

        /** @type {Map.<string,EncodedLMDBTransaction>} */
        this._indices = new Map();
        /** @type {Map.<string,*>} */
        this._removedValues = new Map();
        this._byteSize = 0;
        this._backend = backend;
    }

    /** @type {Array} */
    get modified() {
        return this._modified;
    }

    /** @type {Set.<*>} */
    get removed() {
        return this._removed;
    }

    /** @type {boolean} */
    get truncated() {
        return this._truncated;
    }

    /**
     * @type {number}
     */
    get byteSize() {
        return this._byteSize;
    }

    /**
     * @type {LMDBBaseBackend}
     */
    get backend() {
        return this._backend;
    }

    /**
     * @param {string} indexName
     * @param {EncodedLMDBTransaction} tx
     */
    setIndex(indexName, tx) {
        this._indices.set(indexName, tx);
        this._byteSize += tx.byteSize;
    }

    /**
     * @param {string} indexName
     * @returns {EncodedLMDBTransaction}
     */
    getIndex(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Empty the index transaction.
     */
    truncate() {
        this._truncated = true;
    }

    /**
     * Put a key-value pair into the transaction.
     * @param {*} key The key.
     * @param {*} value The value.
     */
    put(key, value) {
        this._modified.push([key, value]);
        this._byteSize += EncodedLMDBTransaction._getByteSize(key) + EncodedLMDBTransaction._getByteSize(value);
    }

    /**
     * Remove a key-value pair from the transaction.
     * @param {*} key The key to remove.
     * @param {*} [value]
     */
    remove(key, value) {
        this._removed.add(key);
        if (value) {
            this._removedValues.set(key, value);
        }
    }

    /**
     * @param {string} key The key to remove.
     * @returns {*}
     */
    removedValue(key) {
        return this._removedValues.get(key);
    }

    /**
     * @param data
     * @returns {number}
     * @protected
     */
    static _getByteSize(data) {
        // We support different types of values:
        // integers, strings, Uint8Arrays, booleans (as these are the values that can be stored by LMDB)
        if (Number.isInteger(data)) {
            return 8;
        }
        if (typeof data === 'string') {
            return data.length * 2; // JavaScript uses UTF16 encoding
        }
        if (data instanceof Uint8Array) {
            return data.byteLength;
        }
        if (typeof Buffer !== 'undefined' && typeof window === 'undefined' && data instanceof Buffer) {
            return data.length;
        }
        Log.e(`Invalid datatype given for LMDBBackend: ${data}`);
        throw new Error('Invalid datatype given for LMDBBackend');
    }

}
Class.register(EncodedLMDBTransaction);

/**
 * This is a wrapper around the interface for the LMDB.
 * It manages the access to a single table/object store.
 */
class LMDBBaseBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec = null, options = {}) {
        this._db = db;

        this._tableName = tableName;

        this._codec = codec;
        this._keyEncoding = options && options.keyEncoding ? options.keyEncoding : null;
        this._dupSort = options && options.dupSort;
    }

    /** @type {boolean} */
    get connected() {
        return this._db.connected;
    }

    /** @type {string} The own table name. */
    get tableName() {
        return this._tableName;
    }

    /**
     * Truncates a dbi object store.
     * @param db A lmdb instance.
     * @param {string} tableName A table's name.
     * @return {boolean} Whether the table existed or not.
     */
    static truncate(db, tableName) {
        try {
            const dbi = db.openDbi({
                name: tableName
            });
            dbi.drop();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Initialises the persisted indices of the object store.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @returns {boolean} object store was newly created
     */
    init(oldVersion, newVersion) {
        const valueEncoding = this._valueEncoding;
        try {
            this._dbBackend = this._env.openDbi({
                name: this._tableName,
                dupSort: this._dupSort,
                integerDup: valueEncoding !== null && valueEncoding.encoding === JungleDB.Encoding.NUMBER,
                keyIsUint32: this._keyEncoding !== null && this._keyEncoding.encoding === JungleDB.Encoding.NUMBER
            });
            return false;
        } catch (e) {
            this._dbBackend = this._env.openDbi({
                name: this._tableName,
                create: true,
                dupSort: this._dupSort,
                integerDup: valueEncoding !== null && valueEncoding.encoding === JungleDB.Encoding.NUMBER,
                keyIsUint32: this._keyEncoding !== null && this._keyEncoding.encoding === JungleDB.Encoding.NUMBER
            });
            return true;
        }
    }

    /**
     * Method called to decode a single value.
     * @param {*} value Value to be decoded.
     * @param {string} key Key corresponding to the value.
     * @returns {*} The decoded value, either by the object store's default or the overriding decoder if given.
     */
    decode(value, key) {
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.decode(value, key);
        }
        return value;
    }

    /**
     * Internal method for backend specific decoding.
     * @param {*} value Value to be decoded.
     * @returns {*} The decoded value.
     * @protected
     */
    _decode(value) {
        if (value === null) { // LMDB returns null if value is not present.
            return undefined;
        }
        return this._valueEncoding.decode(value);
    }

    /**
     * Method called to encode a single value.
     * @param {*} value Value to be encoded.
     * @param {boolean} [alreadyEncoded] This flag allows to skip the encoding.
     * @returns {*} The encoded value, either by the object store's default or the overriding decoder if given.
     */
    encode(value, alreadyEncoded = false) {
        if (alreadyEncoded) {
            return value;
        }
        if (value === undefined) {
            return undefined;
        }
        if (this._codec !== null && this._codec !== undefined) {
            return this._codec.encode(value);
        }
        return value;
    }

    /**
     * Internal method for backend specific decoding.
     * @param {*} value Value to be decoded.
     * @returns {*} The decoded value.
     * @protected
     */
    _encode(value, alreadyEncoded = false) {
        if (alreadyEncoded) {
            return value;
        }
        if (value === undefined) {
            return null; // LMDB only supports null values
        }
        return this._valueEncoding.encode(value);
    }

    /**
     * Internal method called to decode a single key.
     * @param {*} key Key to be decoded.
     * @returns {*} The decoded key, either by the object store's default or the overriding decoder if given.
     * @protected
     */
    _decodeKey(key) {
        if (key === null || key === undefined) {
            return key;
        }
        if (this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.decode(key);
        }
        return key;
    }

    /**
     * Internal method called to encode a single key.
     * @param {*} key Key to be encoded.
     * @param {boolean} [alreadyEncoded] This flag allows to skip the encoding.
     * @returns {*} The encoded key, either by the object store's default or the overriding decoder if given.
     * @protected
     */
    _encodeKey(key, alreadyEncoded = false) {
        if (key === null || key === undefined) {
            return null; // LMDB only supports null values
        }
        if (!alreadyEncoded && this._keyEncoding !== null && this._keyEncoding !== undefined) {
            key = this._keyEncoding.encode(key);
        }
        return key;
    }

    /**
     * Empties the object store.
     * @returns {Promise} The promise resolves after emptying the object store.
     */
    async truncate() {
        this.truncateSync();
    }

    /**
     * Empties the object store.
     */
    truncateSync() {
        this._dbBackend.drop({
            justFreePages: true
        });
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {EncodedLMDBTransaction} tx The transaction to apply.
     * @param txn
     */
    applyEncodedTransaction(tx, txn) {
        throw new Error('Needs to be implemented by subclass');
    }

    /**
     * Fully deletes the object store and its indices.
     * @returns {Promise} The promise resolves after deleting the object store and its indices.
     */
    async destroy() {
        this._destroy();
    }

    get _valueEncoding() {
        return this._codec === null ? JungleDB.JSON_ENCODING :
            (this._codec.valueEncoding || this._codec.lmdbValueEncoding || JungleDB.JSON_ENCODING);
    }

    get _env() {
        return this._db.backend;
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @param {boolean} keysOnly
     * @protected
     */
    _readStream(callback, ascending = true, query = null, keysOnly = false) {
        const txn = this._env.beginTxn({ readOnly: true });
        const cursor = new lmdb.Cursor(txn, this._dbBackend, {
            keyIsBuffer: this._keyEncoding && this._keyEncoding.encoding === JungleDB.Encoding.BINARY
        });

        // Shortcut for exact match.
        if (!this._dupSort && query instanceof KeyRange && query.exactMatch) {
            const value = this.getSync(query.lower);
            if (value) {
                callback(value, query.lower);
            }
            cursor.close();
            txn.commit();
            return;
        }

        let currentKey = null;
        // Find lower bound and start from there.
        if (!(query instanceof KeyRange) || (ascending ? query.lower : query.upper) === undefined) {
            currentKey = this._decodeKey(ascending ? cursor.goToFirst() : cursor.goToLast());

            // Did not find a key
            if (currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }
        } else {
            // >= lower / >= upper
            currentKey = this._decodeKey(cursor.goToRange(this._encodeKey(ascending ? query.lower : query.upper)));

            // goToRange only goes to the first occurence of the key,
            // so we need to jump manually to the last occurence of the key
            if (!ascending && currentKey !== null && this._dupSort) {
                currentKey = this._decodeKey(cursor.goToLastDup());
            }

            // Did not find a key
            if (ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }

            // it might be that it is not included because of lower open
            if (!query.includes(currentKey) && (ascending ? query.lowerOpen : query.upperOpen)) {
                currentKey = this._decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
            }

            // Did not find a key
            if (!ascending && currentKey === null) {
                cursor.close();
                txn.commit();
                return;
            }
        }

        while (!(query instanceof KeyRange) || query.includes(currentKey)) {
            let currentValue = null;
            if (currentKey === null) {
                break;
            }

            if (keysOnly) {
                currentValue = undefined;
            } else {
                this._cursorGetCurrent(cursor, (key, value) => {
                    currentKey = key;
                    currentValue = value;
                });
            }

            // Only consider return value if not undefined.
            const shouldContinue = callback(currentValue, currentKey);
            if (shouldContinue !== undefined && !shouldContinue) {
                break;
            }

            currentKey = this._decodeKey(ascending ? cursor.goToNext() : cursor.goToPrev());
        }

        cursor.close();
        txn.commit();
        return;
    }

    /**
     * @param txn
     * @param key
     * @param {RetrievalConfig} options
     * @returns {*}
     * @protected
     */
    _get(txn, key, options = {}) {
        let value;
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                value = this._decode(txn.getString(this._dbBackend, this._encodeKey(key)));
                return (options && options.raw) ? value : this.decode(value, key);
            case JungleDB.Encoding.NUMBER:
                value = this._decode(txn.getNumber(this._dbBackend, this._encodeKey(key)));
                return (options && options.raw) ? value : this.decode(value, key);
            case JungleDB.Encoding.BOOLEAN:
                value = this._decode(txn.getBoolean(this._dbBackend, this._encodeKey(key)));
                return (options && options.raw) ? value : this.decode(value, key);
            case JungleDB.Encoding.BINARY:
                value = this._decode(txn.getBinary(this._dbBackend, this._encodeKey(key)));
                return (options && options.raw) ? value : this.decode(value, key);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @param value
     * @param {boolean} [allowOverwrite]
     * @param {boolean} [alreadyEncoded]
     * @return {boolean}
     * @protected
     */
    _put(txn, key, value, allowOverwrite = true, alreadyEncoded = false) {
        value = this._encode(this.encode(value, alreadyEncoded), alreadyEncoded);

        // Shortcut for EncodedLMDBTransactions
        if (txn instanceof EncodedLMDBTransaction) {
            txn.put(this._encodeKey(key, alreadyEncoded), value);
            return true;
        }

        try {
            // Low-level transaction
            switch (this._valueEncoding.encoding) {
                case JungleDB.Encoding.STRING:
                    txn.putString(this._dbBackend, this._encodeKey(key, alreadyEncoded), value, {noOverwrite: !allowOverwrite});
                    return true;
                case JungleDB.Encoding.NUMBER:
                    txn.putNumber(this._dbBackend, this._encodeKey(key, alreadyEncoded), value, {noOverwrite: !allowOverwrite});
                    return true;
                case JungleDB.Encoding.BOOLEAN:
                    txn.putBoolean(this._dbBackend, this._encodeKey(key, alreadyEncoded), value, {noOverwrite: !allowOverwrite});
                    return true;
                case JungleDB.Encoding.BINARY:
                    txn.putBinary(this._dbBackend, this._encodeKey(key, alreadyEncoded), value, {noOverwrite: !allowOverwrite});
                    return true;
            }
        } catch (e) {
            // If no overwrite is allowed, check if it was a duplicate key
            if (!allowOverwrite && e.message && e.message.indexOf('MDB_KEYEXIST') >= 0) {
                return false;
            }
            throw e;
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * @param txn
     * @param key
     * @param [value]
     * @param {boolean} [alreadyEncoded] This flag allows to skip the encoding.
     * @protected
     */
    _remove(txn, key, value, alreadyEncoded = false) {
        // value being undefined is intentional here!
        if (value !== undefined) {
            value = this._encode(this.encode(value, alreadyEncoded), alreadyEncoded);
        }

        // Shortcut for EncodedLMDBTransactions
        if (txn instanceof EncodedLMDBTransaction) {
            txn.remove(this._encodeKey(key, alreadyEncoded), value);
            return;
        }

        try {
            txn.del(this._dbBackend, this._encodeKey(key, alreadyEncoded), value);
        } catch (e) {
            // Do not throw error if key was not found
            if (e.message && e.message.indexOf('MDB_NOTFOUND') >= 0) {
                return;
            }
            throw e;
        }
    }

    /**
     * @param cursor
     * @param callback
     * @returns {*}
     * @protected
     */
    _cursorGetCurrent(cursor, callback) {
        const extendedCallback = (key, value) => {
            key = this._decodeKey(key);
            value = this._decode(value);
            callback(key, this.decode(value, key));
        };
        switch (this._valueEncoding.encoding) {
            case JungleDB.Encoding.STRING:
                return cursor.getCurrentString(extendedCallback);
            case JungleDB.Encoding.NUMBER:
                return cursor.getCurrentNumber(extendedCallback);
            case JungleDB.Encoding.BOOLEAN:
                return cursor.getCurrentBoolean(extendedCallback);
            case JungleDB.Encoding.BINARY:
                return cursor.getCurrentBinary(extendedCallback);
        }
        throw new Error('Invalid encoding given for LMDBBackend');
    }

    /**
     * Empties the object store.
     * @param txn
     * @protected
     */
    _truncate(txn) {
        this._dbBackend.drop({
            justFreePages: true,
            txn: txn
        });
    }

    /**
     * Fully deletes the object store and its indices.
     * @protected
     */
    _destroy() {
        this._dbBackend.drop();
    }

    /**
     * Internal method to close the backend's connection.
     * @private
     */
    _close() {
        this._dbBackend.close();
    }
}
Class.register(LMDBBaseBackend);

/**
 * This is a wrapper around the interface for the LMDB.
 * It manages the access to a single table/object store.
 * @implements {IBackend}
 * @implements {ISynchronousObjectStore}
 */
class LMDBBackend extends LMDBBaseBackend {
    /**
     * Creates a wrapper given a JungleDB, the table's name, the database directory and an encoding.
     * @param {JungleDB} db The JungleDB object managing the connection.
     * @param {string} tableName The table name this object store represents.
     * @param {ICodec} [codec] A default codec for the object store.
     * @param {object} [options] Advanced options.
     */
    constructor(db, tableName, codec = null, options = {}) {
        super(db, tableName, codec, options);

        /** @type {Map.<string,PersistentIndex>} */
        this._indices = new Map();
        this._indicesToCreate = new Map();
        this._indicesToDelete = [];
    }

    /**
     * A map of index names to indices.
     * The index names can be used to access an index.
     * @type {Map.<string,IIndex>}
     */
    get indices() {
        return this._indices;
    }

    /**
     * Initialises the persisted indices of the object store.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @returns {Array.<PersistentIndex>} The list of indices.
     */
    init(oldVersion, newVersion) {
        super.init(oldVersion, newVersion);

        // Delete indices.
        for (const { indexName, upgradeCondition } of this._indicesToDelete) {
            if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion))) {
                const index = new PersistentIndex(this, indexName, '');
                LMDBBaseBackend.truncate(this._env, index.tableName);
            }
        }
        this._indicesToDelete = [];

        const indices = [];
        for (const [indexName, { index, upgradeCondition }] of this._indicesToCreate) {
            indices.push(index.init(oldVersion, newVersion, upgradeCondition));
        }
        return indices;
    }

    /**
     * Returns the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {SyncRetrievalConfig} [options] Advanced retrieval options.
     * @returns {*} The object stored under the given key, or undefined if not present.
     */
    getSync(key, options = {}) {
        // Ignore expectPresence here, since it is a non-cached synchronous backend!
        const txn = this._env.beginTxn({ readOnly: true });
        const value = this._get(txn, key, options);
        txn.commit();
        return value;
    }

    /**
     * A check whether a certain key is cached.
     * @param {string} key The key to check.
     * @return {boolean} A boolean indicating whether the key is already in the cache.
     */
    isCached(key) {
        // Under the assumption that caching it in memory is faster than accessing the LMDB,
        // we don't promise anything here, but still allow getSync requests.
        return false;
    }

    /**
     * Returns a promise of the object stored under the given primary key.
     * Resolves to undefined if the key is not present in the object store.
     * @param {string} key The primary key to look for.
     * @param {RetrievalConfig} [options] Advanced retrieval options.
     * @returns {Promise.<*>} A promise of the object stored under the given key, or undefined if not present.
     */
    async get(key, options = {}) {
        return this.getSync(key, options);
    }

    /**
     * Returns a promise of an array of objects whose primary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the object store.
     * If the query is of type KeyRange, it returns all objects whose primary keys are within this range.
     * If the query is of type Query, it returns all objects whose primary keys fulfill the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        if (query !== null && query instanceof Query) {
            return query.values(this, limit);
        }

        let result = [];
        this._readStream((value, key) => {
            if (limit !== null && result.length >= limit) return false;
            result.push(value);
            return true;
        }, true, query);
        return result;
    }

    /**
     * Returns a promise of a set of keys fulfilling the given query.
     * If the optional query is not given, it returns all keys in the object store.
     * If the query is of type KeyRange, it returns all keys of the object store being within this range.
     * If the query is of type Query, it returns all keys fulfilling the query.
     * @param {Query|KeyRange} [query] Optional query to check keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of keys relevant to the query.
     */
    async keys(query = null, limit = null) {
        if (query !== null && query instanceof Query) {
            return query.keys(this, limit);
        }
        let resultSet = new Set();
        this._readStream((value, key) => {
            if (limit !== null && resultSet.size >= limit) return false;
            resultSet.add(key);
            return true;
        }, true, query, true);
        return resultSet;
    }

    /**
     * Iterates over the keys in a given range and direction.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async keyStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(key);
        }, ascending, query, true);
    }

    /**
     * Iterates over the keys and values in a given range and direction.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(value, key);
        }, ascending, query);
    }

    /**
     * Returns a promise of the object whose primary key is maximal for the given range.
     * If the optional query is not given, it returns the object whose key is maximal.
     * If the query is of type KeyRange, it returns the object whose primary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async maxValue(query=null) {
        let maxValue = null;
        this._readStream((value, key) => {
            maxValue = value;
            return false;
        }, false, query);
        return maxValue;
    }

    /**
     * Returns a promise of the key being maximal for the given range.
     * If the optional query is not given, it returns the maximal key.
     * If the query is of type KeyRange, it returns the key being maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async maxKey(query=null) {
        let maxKey = null;
        this._readStream((value, key) => {
            maxKey = key;
            return false;
        }, false, query, true);
        return maxKey;
    }

    /**
     * Returns a promise of the object whose primary key is minimal for the given range.
     * If the optional query is not given, it returns the object whose key is minimal.
     * If the query is of type KeyRange, it returns the object whose primary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<*>} A promise of the object relevant to the query.
     */
    async minValue(query=null) {
        let minValue = null;
        this._readStream((value, key) => {
            minValue = value;
            return false;
        }, true, query);
        return minValue;
    }

    /**
     * Returns a promise of the key being minimal for the given range.
     * If the optional query is not given, it returns the minimal key.
     * If the query is of type KeyRange, it returns the key being minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<string>} A promise of the key relevant to the query.
     */
    async minKey(query=null) {
        let minKey = null;
        this._readStream((value, key) => {
            minKey = key;
            return false;
        }, true, query, true);
        return minKey;
    }

    /**
     * Returns the count of entries in the given range.
     * If the optional query is not given, it returns the count of entries in the object store.
     * If the query is of type KeyRange, it returns the count of entries within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        let i = 0;
        this._readStream((value, key) => {
            i++;
        }, true, query, true);
        return i;
    }

    /**
     * Returns the index of the given name.
     * If the index does not exist, it returns undefined.
     * @param {string} indexName The name of the requested index.
     * @returns {IIndex} The index associated with the given name.
     */
    index(indexName) {
        return this._indices.get(indexName);
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {EncodedLMDBTransaction} tx The transaction to apply.
     * @param txn
     */
    applyEncodedTransaction(tx, txn) {
        if (tx._truncated) {
            this._truncate(txn);
        }

        for (const key of tx._removed) {
            this._remove(txn, key, /*value*/ undefined, /*alreadyEncoded*/ true);
        }
        for (const [key, value] of tx._modified) {
            this._put(txn, key, value, /*allowOverwrite*/ true, /*alreadyEncoded*/ true);
        }

        for (const [indexName, index] of this._indices) {
            index.applyEncodedTransaction(tx.getIndex(indexName), txn);
        }
    }

    /**
     * Encode transaction and estimate the encoded size of a transaction.
     * @param {Transaction} tx The transaction to encode.
     * @returns {EncodedLMDBTransaction}
     */
    encodeTransaction(tx) {
        const encodedTx = new EncodedLMDBTransaction(this);

        if (tx._truncated) {
            encodedTx.truncate();
        }

        for (const key of tx._removed) {
            this._remove(encodedTx, key);
        }
        for (const [key, value] of tx._modified) {
            this._put(encodedTx, key, value);
        }

        for (const [indexName, index] of this._indices) {
            encodedTx.setIndex(indexName, index.encodeTransaction(tx));
        }

        return encodedTx;
    }

    /**
     * Returns the necessary information in order to flush a combined transaction.
     * @param {Transaction} tx The transaction that should be applied to this backend.
     * @returns {Promise.<Array>} An array containing the batch operations.
     */
    async applyCombined(tx) {
        return this.encodeTransaction(tx);
    }

    /**
     * Applies a function on all key-value pairs in the database.
     * @param {function(key:string, value:*)} func The function to apply.
     * @returns {Promise} The promise resolves after applying the function to all entries.
     */
    async map(func) {
        this._readStream(func);
    }

    /**
     * Creates a new secondary index on the object store.
     * Currently, all secondary indices are non-unique.
     * They are defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * Secondary indices may be multiEntry, i.e., if the keyPath resolves to an iterable object, each item within can
     * be used to find this entry.
     * If a new object does not possess the key path associated with that index, it is simply ignored.
     *
     * This function may only be called before the database is connected.
     * Moreover, it is only executed on database version updates or on first creation.
     * @param {string} indexName The name of the index.
     * @param {string|Array.<string>} [keyPath] The path to the key within the object. May be an array for multiple levels.
     * @param {IndexConfig} [options] An options object.
     */
    createIndex(indexName, keyPath, options = {}) {
        let { multiEntry = false, upgradeCondition = null, unique = false, keyEncoding = null, lmdbKeyEncoding = null } = options || {};

        if (this._db.connected) throw new Error('Cannot create index while connected');
        keyPath = keyPath || indexName;
        const index = new PersistentIndex(this, this._db, indexName, keyPath, multiEntry, unique, lmdbKeyEncoding || keyEncoding);
        this._indices.set(indexName, index);
        this._indicesToCreate.set(indexName, { index, upgradeCondition });
    }

    /**
     * Deletes a secondary index from the object store.
     * @param indexName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}} [options]
     */
    deleteIndex(indexName, options = {}) {
        let { upgradeCondition = null } = options || {};

        if (this._db.connected) throw new Error('Cannot delete index while connected');
        this._indicesToDelete.push({ indexName, upgradeCondition });
    }

    /**
     * Closes the object store and potential connections.
     * @returns {Promise} The promise resolves after closing the object store.
     */
    close() {
        this._close();
        const indexPromises = [];
        for (const index of this._indices.values()) {
            indexPromises.close(index.close());
        }
        return Promise.all(indexPromises);
    }

    /**
     * Checks whether an object store implements the ISynchronousObjectStore interface.
     * @returns {boolean} The transaction object.
     */
    isSynchronous() {
        return true;
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {Transaction} tx The transaction to apply.
     * @returns {Promise} The promise resolves after applying the transaction.
     * @protected
     */
    async _apply(tx) {
        // Check database size before applying transaction.
        const encodedTx = this.encodeTransaction(tx);
        if (this._db.autoResize) {
            const estimatedSize = encodedTx.byteSize * 2;
            if (this._db.needsResize(estimatedSize)) {
                this._db.doResize(estimatedSize);
            }
        }

        const txn = this._env.beginTxn();
        try {
            this.applyEncodedTransaction(encodedTx, txn);
        } catch (e) {
            txn.abort();
            throw e;
        }
        txn.commit();
    }
}
Class.register(LMDBBackend);

const lmdb = require('node-lmdb');
const fs = require('fs');

/**
 * @implements {IJungleDB}
 */
class JungleDB {
    /**
     * Initiates a new database connection. All changes to the database structure
     * require an increase in the version number.
     * Whenever new object stores need to be created, old ones deleted,
     * or indices created/deleted, the dbVersion number has to be increased.
     * When the version number increases, the given function onUpgradeNeeded is called
     * after modifying the database structure.
     * @param {string} databaseDir The name of the database.
     * @param {number} dbVersion The current version of the database.
     * @param {{maxDbs:?number, maxDbSize:?number, useWritemap:?boolean, minResize:?number, autoResize:?boolean, onUpgradeNeeded:?function(oldVersion:number, newVersion:number, jdb:JungleDB)}} [options]
     */
    constructor(databaseDir, dbVersion, options = {}) {
        if (dbVersion <= 0) throw new Error('The version provided must not be less or equal to 0');
        this._databaseDir = databaseDir.endsWith('/') ? databaseDir : `${databaseDir}/`;
        this._dbVersion = dbVersion;
        this._onUpgradeNeeded = options.onUpgradeNeeded;
        this._connected = false;
        this._objectStores = new Map();
        this._objectStoreBackends = [];
        this._objectStoresToDelete = [];

        this._options = options;
        this._minResize = options.minResize || (1024*1024*100); // 100 MB default
    }

    /** The underlying LMDB. */
    get backend() {
        return this._db;
    }

    /** @type {boolean} Whether a connection is established. */
    get connected() {
        return this._connected;
    }

    /** @type {number} */
    get minResize() {
        return this._minResize;
    }

    /** @type {number} */
    set minResize(sizeAdd) {
        this._minResize = sizeAdd || (1024*1024*100); // 100 MB default
    }

    /** @type {boolean} */
    get autoResize() {
        return this._options.autoResize;
    }

    /**
     * @returns {object}
     */
    info() {
        if (!this.connected) {
            throw new Error('Database information can only be retrieved in connected state');
        }
        return this._db.info();
    }

    /**
     * Creates a volatile object store (non-persistent).
     * @param {{codec:?ICodec}} [options] An options object.
     * @returns {ObjectStore}
     */
    static createVolatileObjectStore(options = {}) {
        const { codec = null } = options || {};
        return new ObjectStore(new InMemoryBackend('', codec), null);
    }

    /**
     * Is used to commit multiple transactions atomically.
     * This guarantees that either all transactions are written or none.
     * The method takes a list of transactions (at least two transactions).
     * If the commit was successful, the method returns true, and false otherwise.
     * @param {Transaction|CombinedTransaction} tx1 The first transaction
     * (a CombinedTransaction object is only used internally).
     * @param {Transaction} tx2 The second transaction.
     * @param {...Transaction} txs A list of further transactions to commit together.
     * @returns {Promise.<boolean>} A promise of the success outcome.
     */
    static async commitCombined(tx1, tx2, ...txs) {
        // If tx1 is a CombinedTransaction, flush it to the database.
        if (tx1 instanceof CombinedTransaction) {
            const functions = [];
            /** @type {Array.<Transaction>} */
            const lmdbTransactions = [];

            const infos = await Promise.all(tx1.transactions.map(tx => tx.objectStore._backend.applyCombined(tx)));
            for (const info of infos) {
                let tmp = info;
                if (!Array.isArray(info)) {
                    tmp = [info];
                }
                for (const innerInfo of tmp) {
                    if (typeof innerInfo === 'function') {
                        functions.push(innerInfo);
                    } else {
                        lmdbTransactions.push(innerInfo);
                    }
                }
            }

            if (lmdbTransactions.length > 0) {
                const jdb = tx1.backend;
                // Resize if needed
                if (jdb.autoResize) {
                    let estimatedSize = 0;
                    for (const /** @type {EncodedLMDBTransaction} */ tx of lmdbTransactions) {
                        estimatedSize += tx.byteSize;
                    }
                    estimatedSize = estimatedSize * 2;
                    if (jdb.needsResize(estimatedSize)) {
                        jdb.doResize(estimatedSize);
                    }
                }

                const txn = jdb.backend.beginTxn();

                for (const /** @type {EncodedLMDBTransaction} */ tx of lmdbTransactions) {
                    tx.backend.applyEncodedTransaction(tx, txn);
                }

                txn.commit();
            }
            await Promise.all(functions.map(f => f()));
            return true;
        }
        txs.push(tx1);
        txs.push(tx2);
        if (!txs.every(tx => tx instanceof Transaction)) {
            throw new Error('Invalid arguments supplied');
        }
        const ctx = new CombinedTransaction(...txs);
        return ctx.commit();
    }

    /**
     * Connects to the lmdb.
     * @returns {Promise} A promise resolving on successful connection.
     */
    connect() {
        if (this._db) return Promise.resolve(this._db);

        // Ensure existence of directory.
        if (!fs.existsSync(this._databaseDir)){
            fs.mkdirSync(this._databaseDir);
        }

        let numDbs = 1;
        for (const { /** @type {LMDBBackend} */ backend, upgradeCondition } of this._objectStoreBackends) {
            numDbs += 1 + backend.indices.size;
        }

        this._db = new lmdb.Env();
        this._db.open({
            path: this._databaseDir,
            mapSize: this._options.maxDbSize || (1024*1024*5), // 5MB default
            maxDbs: (this._options.maxDbs + 1) || numDbs, // default, always add 1 for the internal db
            useWritemap: this._options.useWritemap || false,
        });

        // Check if resize is needed.
        if (this.autoResize && this.needsResize()) {
            this.doResize();
        }

        this._mainDb = this._db.openDbi({
            name: null,
            create: true
        });

        return this._initDB();
    }

    /**
     * Closes the database connection.
     * @returns {Promise} The promise resolves after closing the database.
     */
    close() {
        if (this._connected) {
            this._connected = false;
            this._mainDb.close();
            this._db.close();
        }
        return Promise.resolve();
    }

    /**
     * Fully deletes the database.
     * @returns {Promise} The promise resolves after deleting the database.
     */
    async destroy() {
        await this.close();
        JungleDB._deleteFolderRecursive(this._databaseDir);
    }

    /**
     * Returns the ObjectStore object for a given table name.
     * @param {string} tableName The table name to access.
     * @returns {ObjectStore} The ObjectStore object.
     */
    getObjectStore(tableName) {
        return this._objectStores.get(tableName);
    }

    /**
     * Creates a new object store (and allows to access it).
     * This method always has to be called before connecting to the database.
     * If it is not called, the object store will not be accessible afterwards.
     * If a call is newly introduced, but the database version did not change,
     * the table does not exist yet.
     * @param {string} tableName The name of the object store.
     * @param {ObjectStoreConfig} [options] An options object.
     * @returns {IObjectStore}
     */
    createObjectStore(tableName, options = {}) {
        const { codec = null, persistent = true, upgradeCondition = null, keyEncoding = null, lmdbKeyEncoding = null, enableLruCache = false, lruCacheSize = CachedBackend.MAX_CACHE_SIZE, rawLruCacheSize = 0 } = options || {};

        if (this._connected) throw new Error('Cannot create ObjectStore while connected');
        if (this._objectStores.has(tableName)) {
            return this._objectStores.get(tableName);
        }

        // Create backend
        let backend = null;
        if (persistent) {
            backend = new LMDBBackend(this, tableName, codec, { keyEncoding: lmdbKeyEncoding || keyEncoding });
        } else {
            backend = new InMemoryBackend(tableName, codec);
        }
        // Create cache if enabled
        let cachedBackend = backend;
        if (persistent && enableLruCache) {
            cachedBackend = new CachedBackend(backend, lruCacheSize, rawLruCacheSize);
        }

        const objStore = new ObjectStore(cachedBackend, this, tableName);
        this._objectStores.set(tableName, objStore);
        this._objectStoreBackends.push({ backend, upgradeCondition });
        return objStore;
    }

    /**
     * Deletes an object store.
     * This method has to be called before connecting to the database.
     * @param {string} tableName
     * @param {{upgradeCondition:?boolean|?function(oldVersion:number, newVersion:number):boolean}, indexNames:Array.<string>} [options]
     */
    deleteObjectStore(tableName, options = {}) {
        let { upgradeCondition = null, indexNames = [] } = options || {};

        if (this._connected) throw new Error('Cannot delete ObjectStore while connected');
        this._objectStoresToDelete.push({ tableName, upgradeCondition, indexNames });
    }

    /**
     * Checks whether the database needs a resize.
     * This is the case if one of the conditions applies:
     * - free size < thresholdSize (if given)
     * - current database size / maximal mapSize > rand(0.6, 0.9)
     * @param {number} [thresholdSize] An optional threshold of minimum free space.
     * @returns {boolean} Whether a resize is needed.
     */
    needsResize(thresholdSize = 0) {
        const stat = this._db.stat();
        const info = this._db.info();

        const sizeUsed = stat.pageSize * (info.lastPageNumber + 1);

        if (thresholdSize > 0 && info.mapSize - sizeUsed < thresholdSize) {
            Log.i(JungleDB, 'Database needs resize (thresholdSize)');
            Log.i(JungleDB, `DB map size: ${(info.mapSize / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Used: ${(sizeUsed / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Available: ${((info.mapSize - sizeUsed) / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Needed: ${(thresholdSize / (1024 * 1024)).toFixed(2)} MB`);
            return true;
        }

        // Generate random number in interval [0.6, 0.9)
        const resizePercentage = Math.random() * 0.3 + 0.6;

        if (sizeUsed / info.mapSize > resizePercentage)
        {
            Log.i(JungleDB, 'Database needs resize (resizePercentage)');
            Log.i(JungleDB, `DB map size: ${(info.mapSize / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Used: ${(sizeUsed / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Available: ${((info.mapSize - sizeUsed) / (1024 * 1024)).toFixed(2)} MB`);
            Log.i(JungleDB, `Percentage full: ${(sizeUsed / info.mapSize * 100).toFixed(2)} %`);
            return true;
        }
        return false;
    }

    /**
     * Tries to resize the maximal database size by max(increaseSize, this.minResize)
     * @param {number} [increaseSize] The size to increase by.
     */
    doResize(increaseSize = 0) {
        const sizeAdd = Math.max(this.minResize, increaseSize);
        const stat = this._db.stat();
        const info = this._db.info();

        let newMapSize = info.mapSize + sizeAdd;
        newMapSize += newMapSize % stat.pageSize;

        Log.i(JungleDB, `Resize to ${(newMapSize / (1024 * 1024)).toFixed(2)} MB`);

        this._db.resize(newMapSize);
    }

    toString() {
        return `JungleDB{name=${this._databaseDir}}`;
    }

    /**
     * @param {string} path
     * @private
     */
    static _deleteFolderRecursive(path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach((file, index) => {
                const curPath = `${path}/${file}`;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    JungleDB._deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    }

    /**
     * Internal method that is called for opening the database connection.
     * Also handles the db version upgrade.
     * @returns {Promise.<void>} A promise that resolves after successful completion.
     * @private
     */
    async _initDB() {
        const storedVersion = this._readDBVersion();
        // Upgrade database.
        if (this._dbVersion > storedVersion) {
            // Delete object stores, if requested.
            for (const { tableName, upgradeCondition, indexNames } of this._objectStoresToDelete) {
                if (upgradeCondition === null || upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(storedVersion, this._dbVersion))) {
                    LMDBBaseBackend.truncate(this._db, tableName);
                    for (const indexName of indexNames) {
                        LMDBBaseBackend.truncate(this._db, `_${tableName}-${indexName}`);
                    }
                }
            }
            this._objectStoresToDelete = [];
        }

        // Create new ObjectStores.
        for (const { backend, upgradeCondition } of this._objectStoreBackends) {
            // We do not explicitly create object stores, therefore, we ignore the upgrade condition.
            backend.init(storedVersion, this._dbVersion);
        }

        this._connected = true;

        // Upgrade database (part 2).
        if (this._dbVersion > storedVersion) {
            // Call user defined function if requested.
            if (this._onUpgradeNeeded) {
                await this._onUpgradeNeeded(storedVersion, this._dbVersion, this);
            }

            // The order of the above promises does not matter.
            this._writeDBVersion(this._dbVersion);
        }
    }

    /**
     * Returns a promise of the current database version.
     * @returns {number} The database version.
     * @private
     */
    _readDBVersion() {
        const tx = this._db.beginTxn({ readOnly: true });
        const version = tx.getNumber(this._mainDb, '_dbVersion') || 0;
        tx.commit();
        return version;
    }

    /**
     * Writes a new database version to the db.
     * @private
     */
    _writeDBVersion(version) {
        const tx = this._db.beginTxn();
        tx.putNumber(this._mainDb, '_dbVersion', version);
        tx.commit();
    }
}
/** @enum {number} */
JungleDB.Encoding = {
    STRING: 0,
    NUMBER: 1,
    BOOLEAN: 2,
    BINARY: 3
};
/**
 * A LMDB JSON encoding that can handle Uint8Arrays and Sets.
 * @type {ILMDBEncoding}
 */
JungleDB.JSON_ENCODING = {
    encode: JSONUtils.stringify,
    decode: JSONUtils.parse,
    encoding: JungleDB.Encoding.STRING
};
/**
 * A LMDB binary encoding.
 * @type {ILMDBEncoding}
 */
JungleDB.BINARY_ENCODING = {
    encode: x => Buffer.from(x),
    decode: x => x,
    encoding: JungleDB.Encoding.BINARY
};
/**
 * A LMDB string encoding.
 * @type {ILMDBEncoding}
 */
JungleDB.STRING_ENCODING = {
    encode: x => {
        if (typeof x !== 'string') {
            throw new Error('Invalid type, expected string');
        }
        return x;
    },
    decode: x => x,
    encoding: JungleDB.Encoding.STRING
};
/**
 * A LMDB number encoding.
 * @type {ILMDBEncoding}
 */
JungleDB.NUMBER_ENCODING = {
    encode: x => x,
    decode: x => x,
    encoding: JungleDB.Encoding.NUMBER
};
/**
 * A LMDB encoding that can handle generic values.
 * @type {ILMDBEncoding}
 */
JungleDB.GENERIC_ENCODING = GenericValueEncoding;
Class.register(JungleDB);

/**
 * This class implements a persistent index for LMDB.
 */
class PersistentIndex extends LMDBBaseBackend {
    /**
     * Creates a new PersistentIndex for a LMDB backend.
     * @param {LMDBBackend} objectStore The underlying LMDB backend.
     * @param {JungleDB} db The underlying JungleDB.
     * @param {string} indexName The index name.
     * @param {string|Array.<string>} [keyPath] The key path of the indexed attribute.
     * If the keyPath is not given, this is a primary index.
     * @param {boolean} [multiEntry] Whether the indexed attribute is considered to be iterable or not.
     * @param {boolean} [unique] Whether there is a unique constraint on the attribute.
     * @param {ILMDBEncoding} [keyEncoding] The key encoding for this index.
     */
    constructor(objectStore, db, indexName, keyPath, multiEntry = false, unique = false, keyEncoding = null) {
        const prefix = `_${objectStore.tableName}-${indexName}`;
        super(db, prefix, { encode: x => x, decode: x => x, valueEncoding: objectStore._keyEncoding || JungleDB.STRING_ENCODING },
            { keyEncoding: keyEncoding, dupSort: true });
        this._prefix = prefix;

        /** @type {LMDBBackend} */
        this._objectStore = objectStore;
        this._indexName = indexName;
        this._keyPath = keyPath;
        this._multiEntry = multiEntry;
        this._unique = unique;
    }

    /** The LMDB backend. */
    get backend() {
        return this;
    }

    /**
     * The key path associated with this index.
     * A key path is defined by a key within the object or alternatively a path through the object to a specific subkey.
     * For example, ['a', 'b'] could be used to use 'key' as the key in the following object:
     * { 'a': { 'b': 'key' } }
     * @type {string|Array.<string>}
     */
    get keyPath() {
        return this._keyPath;
    }

    /**
     * This value determines whether the index supports multiple secondary keys per entry.
     * If so, the value at the key path is considered to be an iterable.
     * @type {boolean}
     */
    get multiEntry() {
        return this._multiEntry;
    }

    /**
     * This value determines whether the index is a unique constraint.
     * @type {boolean}
     */
    get unique() {
        return this._unique;
    }

    /**
     * Initialises the persistent index by validating the version numbers
     * and loading the InMemoryIndex from the database.
     * @param {number} oldVersion
     * @param {number} newVersion
     * @param {?boolean|?function(oldVersion:number, newVersion:number):boolean} upgradeCondition
     * @returns {PersistentIndex} The fully initialised index.
     */
    init(oldVersion, newVersion, upgradeCondition) {
        const wasCreated = super.init(oldVersion, newVersion);

        let isUpgrade = false;
        if (upgradeCondition === null) {
            isUpgrade = wasCreated;
        } else {
            isUpgrade = upgradeCondition === true || (typeof upgradeCondition === 'function' && upgradeCondition(oldVersion, newVersion));
        }

        // Initialise the index on first construction.
        if (isUpgrade) {
            const txn = this._env.beginTxn();

            this._objectStore._readStream((value, primaryKey) => {
                this.put(primaryKey, value, undefined, txn);
            });

            txn.commit();
        }

        return this;
    }

    /**
     * Inserts a new key-value pair into the index.
     * For replacing an existing pair, the old value has to be passed as well.
     * @param {string} key The primary key of the pair.
     * @param {*} value The value of the pair. The indexed key will be extracted from this.
     * @param {*} [oldValue] The old value associated with the primary key.
     * @param txn
     */
    put(key, value, oldValue, txn) {
        const oldIKey = this._indexKey(key, oldValue);
        const newIKey = this._indexKey(key, value);

        // Only update index on changes.
        if (!ComparisonUtils.equals(oldIKey, newIKey)) {
            if (oldIKey !== undefined) {
                this._remove(key, oldIKey, txn);
            }
            if (newIKey !== undefined) {
                this._insert(key, newIKey, txn);
            }
        }
    }

    /**
     * Removes a key-value pair from the index.
     * @param {string} key The primary key of the pair.
     * @param {*} oldValue The old value of the pair. The indexed key will be extracted from this.
     * @param txn
     */
    remove(key, oldValue, txn) {
        const iKey = this._indexKey(key, oldValue);
        if (iKey !== undefined) {
            this._remove(key, iKey, txn);
        }
    }

    /**
     * Internally applies a transaction to the store's state.
     * This needs to be done in batch (as a db level transaction), i.e., either the full state is updated
     * or no changes are applied.
     * @param {EncodedLMDBTransaction} tx The transaction to apply.
     * @param txn
     * @override
     */
    applyEncodedTransaction(tx, txn) {
        if (tx._truncated) {
            this._truncate(txn);
        }

        for (const key of tx._removed) {
            super._remove(txn, key, tx.removedValue(key), true);
        }
        for (const [key, value] of tx._modified) {
            const result = super._put(txn, key, value, !this._unique, true);
            if (!result) {
                throw new Error(`Uniqueness constraint violated for key ${value} on path ${this._keyPath}`);
            }
        }
    }

    /**
     * Encode writes and estimate the encoded size of a transaction.
     * @param {Transaction} tx The transaction to encode.
     * @returns {EncodedLMDBTransaction}
     */
    encodeTransaction(tx) {
        const encodedTx = new EncodedLMDBTransaction(this);

        if (tx._truncated) {
            encodedTx.truncate();
        }

        for (const key of tx._removed) {
            const oldValue = this._objectStore.getSync(key);
            this.remove(key, oldValue, encodedTx);
        }
        for (const [key, value] of tx._modified) {
            const oldValue = this._objectStore.getSync(key);
            this.put(key, value, oldValue, encodedTx);
        }

        return encodedTx;
    }

    /**
     * Returns a promise of an array of objects whose secondary keys fulfill the given query.
     * If the optional query is not given, it returns all objects in the index.
     * If the query is of type KeyRange, it returns all objects whose secondary keys are within this range.
     * @param {KeyRange} [query] Optional query to check secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Array.<*>>} A promise of the array of objects relevant to the query.
     */
    async values(query = null, limit = null) {
        const results = this._getValues(query, limit);
        return this._retrieveValues(results);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated objects' secondary keys are in the given range.
     * If the optional query is not given, it returns all primary keys in the index.
     * If the query is of type KeyRange, it returns all primary keys for which the secondary key is within this range.
     * @param {KeyRange} [query] Optional query to check the secondary keys against.
     * @param {number} [limit] Limits the number of results if given.
     * @returns {Promise.<Set.<string>>} A promise of the set of primary keys relevant to the query.
     */
    async keys(query = null, limit = null) {
        const results = this._getValues(query, limit);
        return Set.from(results);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is maximal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async maxValues(query=null) {
        const results = this._getMinMaxValues(query, false);
        return this._retrieveValues(results);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are maximal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is maximal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is maximal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async maxKeys(query=null) {
        const results = this._getMinMaxValues(query, false);
        return Set.from(results);
    }

    /**
     * Returns a promise of an array of objects whose secondary key is minimal for the given range.
     * If the optional query is not given, it returns the objects whose secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the objects whose secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Array.<*>>} A promise of array of objects relevant to the query.
     */
    async minValues(query=null) {
        const results = this._getMinMaxValues(query, true);
        return this._retrieveValues(results);
    }

    /**
     * Returns a promise of a set of primary keys, whose associated secondary keys are minimal for the given range.
     * If the optional query is not given, it returns the set of primary keys, whose associated secondary key is minimal within the index.
     * If the query is of type KeyRange, it returns the set of primary keys, whose associated secondary key is minimal for the given range.
     * @param {KeyRange} [query] Optional query to check keys against.
     * @returns {Promise.<Set.<*>>} A promise of the key relevant to the query.
     */
    async minKeys(query=null) {
        const results = this._getMinMaxValues(query, true);
        return Set.from(results);
    }

    /**
     * Iterates over the primary keys in a given range of secondary keys and direction.
     * The order is determined by the secondary keys first and by the primary keys second.
     * The callback is called for each primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(key:string):boolean} callback A predicate called for each key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolves after all elements have been streamed.
     */
    async keyStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(value); // In an index, the value is the primary key
        }, ascending, query);
    }

    /**
     * Iterates over the values of the store in a given range of secondary keys and direction.
     * The order is determined by the secondary keys first and by the primary keys second.
     * The callback is called for each value and primary key fulfilling the query
     * until it returns false and stops the iteration.
     * @param {function(value:*, key:string):boolean} callback A predicate called for each value and key until returning false.
     * @param {boolean} ascending Determines the direction of traversal.
     * @param {KeyRange} query An optional KeyRange to narrow down the iteration space.
     * @returns {Promise} The promise resolved after all elements have been streamed.
     */
    async valueStream(callback, ascending=true, query=null) {
        this._readStream((value, key) => {
            return callback(this._objectStore.getSync(value), value); // In an index, the value is the primary key
        }, ascending, query);
    }

    /**
     * Returns the count of entries, whose secondary key is in the given range.
     * If the optional query is not given, it returns the count of entries in the index.
     * If the query is of type KeyRange, it returns the count of entries, whose secondary key is within the given range.
     * @param {KeyRange} [query]
     * @returns {Promise.<number>}
     */
    async count(query=null) {
        const results = this._getMinMaxValues(query);
        return results.length;
    }

    /**
     * Helper method to return the attribute associated with the key path if it exists.
     * @param {string} key The primary key of the key-value pair.
     * @param {*} obj The value of the key-value pair.
     * @returns {*} The attribute associated with the key path, if it exists, and undefined otherwise.
     * @private
     */
    _indexKey(key, obj) {
        if (obj === undefined) return undefined;
        if (this.keyPath) {
            return ObjectUtils.byKeyPath(obj, this.keyPath);
        }
        return key;
    }

    /**
     * A helper method to insert a primary-secondary key pair into the tree.
     * @param {string} primaryKey The primary key.
     * @param {*} iKeys The indexed key.
     * @param txn
     * @throws if the uniqueness constraint is violated.
     */
    _insert(primaryKey, iKeys, txn) {
        if (!this._multiEntry || !Array.isArray(iKeys)) {
            iKeys = [iKeys];
        }

        for (const secondaryKey of iKeys) {
            const result = super._put(txn, secondaryKey, primaryKey, !this._unique);
            if (!result) {
                throw new Error(`Uniqueness constraint violated for key ${secondaryKey} on path ${this._keyPath}`);
            }
        }
    }

    /**
     * A helper method to remove a primary-secondary key pair from the tree.
     * @param {string} primaryKey The primary key.
     * @param {*} iKeys The indexed key.
     * @param txn
     */
    _remove(primaryKey, iKeys, txn) {
        if (!this._multiEntry || !Array.isArray(iKeys)) {
            iKeys = [iKeys];
        }
        // Remove all keys.
        for (const secondaryKey of iKeys) {
            super._remove(txn, secondaryKey, this._unique ? undefined : primaryKey);
        }
    }

    /**
     * A helper method to retrieve the values corresponding to a set of keys.
     * @param {Array.<string|Array.<string>>} results The set of keys to get the corresponding values for.
     * @returns {Array.<*>} The array of values.
     * @protected
     */
    _retrieveValues(results) {
        const values = [];
        for (const key of results) {
            values.push(this._objectStore.getSync(key));
        }
        return values;
    }

    /**
     * @param {KeyRange} [query]
     * @param {number} [limit]
     * @return {Array.<string>}
     * @private
     */
    _getValues(query, limit = null) {
        let result = [];
        this._readStream((value, key) => {
            if (limit !== null && result.length >= limit) return false;
            result.push(value);
            return true;
        }, true, query);
        return result;
    }

    /**
     * @param {KeyRange} [query]
     * @param {boolean} [ascending]
     * @return {Array.<string>}
     * @private
     */
    _getMinMaxValues(query, ascending = true) {
        let values = [], targetKey = null;
        this._readStream((value, key) => {
            if (targetKey === null) {
                targetKey = key;
            }

            // Continue for as many values as the key is the same.
            if (ComparisonUtils.equals(key, targetKey)) {
                values.push(value);
                return true;
            }
            return false;
        }, ascending, query);
        return values;
    }
}
Class.register(PersistentIndex);

// Print stack traces to the console.
Error.prototype.toString = function () {
    return this.stack;
};

// Don't exit on uncaught exceptions.
process.on('uncaughtException', (err) => {
    console.error(`Uncaught exception: ${err.message || err}`);
});

//# sourceMappingURL=lmdb.js.map
