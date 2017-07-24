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

class Node {
    /**
     * @param id
     * @param [keys]
     */
    constructor(id, keys=[]) {
        this._keys = keys;
        this._id = id;
    }

    get id() {
        return this._id;
    }

    get keys() {
        return this._keys;
    }

    toJSON() {
        return {
            _id: this._id,
            _keys: this._keys
        };
    }

    /**
     * @param {Object} o
     * @returns {Node}
     */
    static fromJSON(o) {
        if (o.isLeaf === true) {
            return LeafNode.fromJSON(o);
        } else if (o.isLeaf === false) {
            return InnerNode.fromJSON(o);
        }
        return undefined;
    }
}
Class.register(Node);

class LeafNode extends Node {
    /**
     * @param id
     * @param [keys]
     * @param [records]
     */
    constructor(id, keys=[], records=[]) {
        if (keys.length !== records.length) {
            throw 'Keys and records must have the same length';
        }
        super(id, keys);
        this._records = records;
        this.prevLeaf = null;
        this.nextLeaf = null;
    }

    get records() {
        return this._records;
    }

    isLeaf() {
        return true;
    }

    toJSON() {
        const o = super.toJSON();
        o.isLeaf = true;
        o._records = this._records;
        o.prevLeaf = this.prevLeaf ? this.prevLeaf.id : this.prevLeaf;
        o.nextLeaf = this.nextLeaf ? this.nextLeaf.id : this.nextLeaf;
        return o;
    }

    /**
     * @param {Object} o
     * @returns {Node}
     */
    static fromJSON(o) {
        const leaf = new LeafNode(o._id, o._keys, o._records);
        leaf.prevLeaf = o.prevLeaf;
        leaf.nextLeaf = o.nextLeaf;
        return leaf;
    }

    /**
     * complexity O([order/2, order-1])
     * @param key
     * @param near
     * @returns {number}
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
                if (key === keys[i]) return i;
            }
        }
        return -1;
    }

    /**
     * @param key
     * @param record
     * @returns {number}
     */
    addKey(key, record) {
        let insertPos = this._keys.length;
        // Find position to insert.
        for (let i=0, len=insertPos; i<len; ++i) {
            // Key already exists.
            if (key === this._keys[i]) {
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
     * @param {number} newId
     * @returns {LeafNode}
     */
    split(newId) {
        const mov = Math.floor(this._keys.length/2);
        const newKeys = [], newRecords = [];
        for (let i = 0; i < mov; ++i) {
            newKeys.unshift(this._keys.pop());
            newRecords.unshift(this._records.pop());
        }
        const newL = new LeafNode(newId, newKeys, newRecords);
        newL.prevLeaf = this;
        newL.nextLeaf = this.nextLeaf;
        if (this.nextLeaf !== null) this.nextLeaf.prevLeaf = newL;
        this.nextLeaf = newL;
        return newL;
    }

    /**
     * @param {LeafNode} frNod
     * @param {InnerNode} paNod
     * @param frKey
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

class InnerNode extends Node {
    /**
     * @param id
     * @param [keys]
     * @param [nodePointers]
     */
    constructor(id, keys=[], nodePointers=[]) {
        super(id, keys);
        this._nodePointers = nodePointers;
    }

    isLeaf() {
        return false;
    }

    get nodePointers() {
        return this._nodePointers;
    }

    toJSON() {
        const o = super.toJSON();
        const nodePointers = [];
        for (let i=0; i<this._nodePointers.length; ++i) {
            nodePointers.push(this._nodePointers[i] ? this._nodePointers[i].id : this._nodePointers[i]);
        }
        o.isLeaf = false;
        o._nodePointers = nodePointers;
        return o;
    }

    /**
     * @param {Object} o
     * @returns {Node}
     */
    static fromJSON(o) {
        return new InnerNode(o._id, o._keys, o._nodePointers);
    }

    getItem(key) {
        const len = this._keys.length;
        for (let i=0; i<len; ++i) {
            if (key < this._keys[i]) return i;
        }
        return this._keys.length;
    }

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

    split(newId) {
        const mov = Math.ceil(this._keys.length/2) - 1;
        const newNodePointers = [this._nodePointers.pop()];
        const newKeys = [];
        for (let i=mov-1; i>=0; --i) {
            newKeys.unshift(this._keys.pop());
            newNodePointers.unshift(this._nodePointers.pop());
        }
        return new InnerNode(newId, newKeys, newNodePointers);
    }

    /**
     * @param {InnerNode} frNod
     * @param {InnerNode} paNod
     * @param {number} paItm
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
 * @implements {IBTree}
 */
class BTree {
    constructor(order=7) {
        this._nodeId = 0; // Needed for persistence.
        this._root = new LeafNode(this._nodeId++);
        this._maxkey = order-1;
        this._minkyl = Math.floor(order/2);
        this._minkyn = Math.floor(this._maxkey/2);
        this._leaf = null;
        this._item = -1;

        this._key = '';
        this._record = -1;
        this._length = 0;
        this._eof = true;
        this._found = false;
    }

    /** @type {number} */
    get length() {
        return this._length;
    }

    /** @type {*} */
    get currentKey() {
        return this._key;
    }

    /** @type {*} */
    get currentRecord() {
        return this._record;
    }

    /**
     * @returns {TreeTransaction}
     */
    transaction() {
        return new TreeTransaction(this);
    }

    insert(key, rec, modified=null) {
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
            BTree.modifyNode(modified, this._leaf);

            this._found = false;
            this._record = rec;
            this._length++;
            if (this._leaf.keys.length > this._maxkey) {
                let pL = this._leaf;
                let pR = this._leaf.split(this._nodeId++);
                BTree.modifyNode(modified, pL); // we splitted nodes
                BTree.modifyNode(modified, pR);
                let ky = pR.keys[0];
                this._item = this._leaf.getItem(key, false);
                if (this._item === -1) {
                    this._leaf = this._leaf.nextLeaf;
                    this._item = this._leaf.getItem(key, false);
                }
                while (true) { // eslint-disable-line no-constant-condition
                    if (stack.length === 0) {
                        const newN = new InnerNode(this._nodeId++);
                        newN.keys[0] = ky;
                        newN.nodePointers[0] = pL;
                        newN.nodePointers[1] = pR;
                        BTree.modifyNode(modified, newN);
                        this._root = newN;
                        break;
                    }
                    const nod = stack.pop();
                    nod.addKey(ky, pL, pR);
                    BTree.modifyNode(modified, nod);
                    if (nod.keys.length <= this._maxkey) break;
                    pL = nod;
                    pR = nod.split(this._nodeId++);
                    BTree.modifyNode(modified, pL);
                    BTree.modifyNode(modified, pR);
                    ky = nod.keys.pop();
                }
            }
        }
        return (!this._found);
    }

    remove(key, modified=null, removed=null) {
        if (typeof key === 'undefined') {
            if (this._item === -1) {
                this._eof = true;
                this._found = false;
                return false;
            }
            key = this._leaf.keys[this._item];
        }
        this._del(key, modified, removed);
        if (!this._found) {
            this._item = -1;
            this._eof = true;
            this._key = '';
            this._record = -1;
        } else {
            this.seek(key,true);
            this._found = true;
        }
        return (this._found);
    }

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
            this._key = '';
            this._found = false;
            this._record = -1;
        } else {
            this._eof = false;
            this._found = (this._leaf.keys[this._item] === key);
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (!this._eof);
    }

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
            this._key = '';
            this._record = -1;
        } else {
            this._found = true;
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (this._found);
    }

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

    goTop() {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._leaf = this._leaf.nodePointers[0];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this._eof = true;
            this._found = false;
            this._key = '';
            this._record = -1;
        } else {
            this._item = 0;
            this._eof = false;
            this._found = true;
            this._key = this._leaf.keys[0];
            this._record = this._leaf.records[0];
        }
        return (this._found);
    }

    goBottom() {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._leaf = this._leaf.nodePointers[this._leaf.nodePointers.length-1];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this._eof = true;
            this._found = false;
            this._key = '';
            this._record = -1;
        } else {
            this._item = this._leaf.keys.length-1;
            this._eof = false;
            this._found = true;
            this._key = this._leaf.keys[this._item];
            this._record = this._leaf.records[this._item];
        }
        return (this._found);
    }

    pack(modified=null) {
        let len;
        let i;
        this.goTop(0);
        if (this._leaf === this._root) return false;

        // Pack leaves
        let toN = new LeafNode(this._nodeId++);
        let toI = 0;
        let frN = this._leaf;
        let frI = 0;
        let parKey = [];
        let parNod = [];
        while (true) { // eslint-disable-line no-constant-condition
            BTree.modifyNode(modified, toN);
            BTree.modifyNode(modified, frN);
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
                const tmp = new LeafNode(this._nodeId++);
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
            BTree.modifyNode(modified, frN);
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
                    toN = new InnerNode(this._nodeId++);
                    toI = 0;
                    parNod.push(toN);
                }
                toN.keys[toI] = kidKey[i];
                toN.nodePointers[toI] = kidNod[i];
                toI++;
                BTree.modifyNode(modified, toN);
            }
            mov = this._minkyn - toN.keys.length + 1;
            if (mov > 0 && parNod.length > 1) {
                frN = parNod[parNod.length-2];
                BTree.modifyNode(modified, frN);
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


    _del(key, modified=null, removed=null) {
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
        BTree.modifyNode(modified, this._leaf);
        this._length--;

        // Leaf still valid: done
        if (this._leaf === this._root) {
            return;
        }
        if (this._leaf.keys.length >= this._minkyl) {
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0], modified);
            return;
        }
        let delKey;

        // Steal from left sibling if possible
        let sibL = (parPtr === 0) ? null : parNod.nodePointers[parPtr - 1];
        if (sibL !== null && sibL.keys.length > this._minkyl) {
            delKey = (this._item === 0) ? key : this._leaf.keys[0];
            this._leaf.keys.unshift(sibL.keys.pop());
            this._leaf.records.unshift(sibL.records.pop());
            BTree._fixNodes(stack, delKey, this._leaf.keys[0], modified);
            BTree.modifyNode(modified, sibL);
            return;
        }

        // Steal from right sibling if possible
        let sibR = (parPtr === parNod.keys.length) ? null : parNod.nodePointers[parPtr + 1];
        if (sibR !== null && sibR.keys.length > this._minkyl) {
            this._leaf.keys.push(sibR.keys.shift());
            this._leaf.records.push(sibR.records.shift());
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0], modified);
            BTree._fixNodes(stack, this._leaf.keys[this._leaf.keys.length-1], sibR.keys[0], modified);
            BTree.modifyNode(modified, sibR);
            return;
        }

        // Merge left to make one leaf
        if (sibL !== null) {
            delKey = (this._item === 0) ? key : this._leaf.keys[0];
            sibL.merge(this._leaf, parNod, delKey);
            BTree.modifyNode(modified, sibL);
            BTree.modifyNode(removed, this._leaf);
            this._leaf = sibL;
        } else {
            delKey = sibR.keys[0];
            this._leaf.merge(sibR, parNod, delKey);
            BTree.modifyNode(modified, this._leaf);
            BTree.modifyNode(removed, sibR);
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0], modified);
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
                BTree.modifyNode(modified, curNod);
                BTree.modifyNode(modified, sibR);
                BTree.modifyNode(modified, parNod);
                break;
            }

            // Steal from left sibling if possible
            sibL = (parItm === 0) ? null : parNod.nodePointers[parItm-1];
            if (sibL !== null && sibL.keys.length > this._minkyn) {
                curNod.keys.unshift(parNod.keys[parItm-1]);
                parNod.keys[parItm-1] = sibL.keys.pop();
                curNod.nodePointers.unshift(sibL.nodePointers.pop());
                BTree.modifyNode(modified, curNod);
                BTree.modifyNode(modified, sibL);
                BTree.modifyNode(modified, parNod);
                break;
            }

            // Merge left to make one node
            if (sibL !== null) {
                delKey = sibL.merge(curNod, parNod, parItm-1);
                BTree.modifyNode(removed, curNod);
                BTree.modifyNode(modified, sibL);
                curNod = sibL;
            } else if (sibR !== null) {
                delKey = curNod.merge(sibR, parNod, parItm);
                BTree.modifyNode(removed, sibR);
                BTree.modifyNode(modified, curNod);
            }

            // Next level
            if (stack.length === 0 && parNod.keys.length === 0) {
                this._root = curNod;
                break;
            }
            curNod = parNod;
        }
    }

    static _fixNodes(stk, frKey, toKey, modified) {
        let keys, lvl = stk.length, mor = true;
        do {
            lvl--;
            keys = stk[lvl].keys;
            for (let i=keys.length-1; i>=0; --i) {
                if (keys[i] === frKey) {
                    keys[i] = toKey;
                    BTree.modifyNode(modified, stk[lvl]);
                    mor = false;
                    break;
                }
            }
        } while (mor && lvl>0);
    }

    goToLowerBound(lower, lowerOpen=false) {
        if (lower !== undefined) {
            let success = this.seek(lower, BTree.NEAR_MODE.GE);
            if (success && lowerOpen) {
                success = this.skip();
            }
            return success;
        }
        return this.goTop();
    }

    goToUpperBound(upper, upperOpen=false) {
        if (upper !== undefined) {
            let success = this.seek(upper, BTree.NEAR_MODE.LE);
            if (success && upperOpen) {
                success = this.skip(-1);
            }
            return success;
        }
        return this.goBottom();
    }

    /**
     * @param {Set|*} s
     * @param {Node} node
     */
    static modifyNode(s, node) {
        if (s instanceof Set) {
            s.add(node);
        }
    }

    /**
     * @param {number} rootId
     * @param {Map.<number,Object>} nodes
     * @param {number} [order]
     */
    static loadFromJSON(rootId, nodes, order) {
        const tree = new BTree(order);
        const root = Node.fromJSON(nodes.get(rootId));
        tree._root = root;
        const queue = [root];
        let maxId = 0;
        // Restore all nodes and pointers
        while (queue.length > 0) {
            const node = queue.shift();
            maxId = Math.max(node.id, maxId);

            if (node.isLeaf()) {
                let tmp = nodes.get(prevLeaf);
                node.prevLeaf = tmp ? Node.fromJSON(tmp) : null;
                if (node.prevLeaf) {
                    queue.push(node.prevLeaf);
                }
                tmp = nodes.get(nextLeaf);
                node.nextLeaf = tmp ? Node.fromJSON(tmp) : null;
                if (node.nextLeaf) {
                    queue.push(node.nextLeaf);
                }
            } else {
                for (let i=0; i<node.nodePointers.length; ++i) {
                    let tmp = nodes.get(node.nodePointers[i]);
                    tmp = tmp ? Node.fromJSON(tmp) : null;
                    if (tmp) {
                        queue.push(tmp);
                    }
                    node.nodePointers[i] = tmp;
                }
            }
        }
        tree._nodeId = maxId + 1; // Needed for persistence
    }

    /**
     * @param {Map.<number,Object>} nodes
     * @returns {number} root
     */
    dump(nodes) {
        nodes.clear();
        const queue = [this._root];
        // Save all nodes and pointers
        while (queue.length > 0) {
            const node = queue.shift();

            nodes.set(node.id, node.toJSON());

            if (node.isLeaf()) {
                if (node.prevLeaf) {
                    queue.push(node.prevLeaf);
                }
                if (node.nextLeaf) {
                    queue.push(node.nextLeaf);
                }
            } else {
                for (let i=0; i<node.nodePointers.length; ++i) {
                    if (node.nodePointers[i]) {
                        queue.push(node.nodePointers[i]);
                    }
                }
            }
        }
        return this._root.id;
    }
}
BTree.NEAR_MODE = {
    NONE: 0,
    LE: 1,
    GE: 2
};
Class.register(BTree);

/**
 * @implements {IBTree}
 */
class TreeTransaction {
    /**
     * @param {BTree} tree
     */
    constructor(tree) {
        this._tree = tree;

        // We potentially need to keep track of modifications to persist them.
        // To ensure consistency, the caller needs to collect modifications over multiple calls synchronously.
        // Hence, the observer pattern is not applicable here, and we keep modifications in the state if requested.
        this._modified = new Set();
        this._removed = new Set();
    }

    /**
     * @param {TreeTransaction} treeTx
     */
    merge(treeTx) {
        if (!(treeTx instanceof TreeTransaction)) {
            return;
        }
        this._removed = this._removed.union(treeTx.removed);
        this._modified = this._modified.union(treeTx.modified).difference(this._removed);
    }

    /**
     * @type {Set.<Node>}
     */
    get modified() {
        return this._modified;
    }

    /**
     * @type {Set.<Node>}
     */
    get removed() {
        return this._removed;
    }

    /**
     * @type {Node}
     */
    get root() {
        return this._tree._root;
    }

    /** @type {number} */
    get length() {
        return this._tree.length;
    }

    /** @type {*} */
    get currentKey() {
        return this._tree.currentKey;
    }

    /** @type {*} */
    get currentRecord() {
        // Potentially untracked modification.
        this._modified.add(this._tree.currentLeaf);
        return this._tree.currentRecord;
    }

    insert(key, rec) {
        return this._tree.insert(key, rec, this._modified);
    }

    remove(key) {
        return this._tree.remove(key, this._modified, this._removed);
    }

    seek(key, near=BTree.NEAR_MODE.NONE) {
        return this._tree.seek(key, near);
    }

    skip(cnt = 1) {
        return this._tree.skip(cnt);
    }

    goto(cnt) {
        return this._tree.goto(cnt);
    }

    keynum() {
        return this._tree.keynum();
    }

    goTop() {
        return this._tree.goTop();
    }

    goBottom() {
        return this._tree.goBottom();
    }

    pack() {
        return this._tree.pack();
    }

    goToLowerBound(lower, lowerOpen=false) {
        return this._tree.goToLowerBound(lower, lowerOpen);
    }

    goToUpperBound(upper, upperOpen=false) {
        return this._tree.goToUpperBound(upper, upperOpen);
    }
}
Class.register(TreeTransaction);
