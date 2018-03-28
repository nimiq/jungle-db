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
                if (key <= keys[i]) return i;
            }
        } else if (near === BTree.NEAR_MODE.LE) {
            for (let i=keys.length - 1; i>=0; --i) {
                if (key >= keys[i]) return i;
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
            if (key <= this._keys[i]) {
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
            if (paNod.keys[i] === frKey) {
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
            if (key <= this._keys[i]) {
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
            if (success && lowerOpen) {
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
            if (success && upperOpen) {
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
