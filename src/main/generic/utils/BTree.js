/*
 B+ Tree processing
 Version 1.0.3
 Written by Graham O'Neill, April 2013
 Modified by Pascal Berrang, July 2017
 http://goneill.co.nz/btree.php

 ------------------------------------------------------------------------------

 Copyright (c) 2013 Graham O'Neill

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
    constructor() {
        this.keys = [];
    }
}

class LeafNode extends Node {
    constructor() {
        super();
        this.records = [];
        this.prevLeaf = null;
        this.nextLeaf = null;
    }

    isLeaf() {
        return true;
    }

    getItem(key, near) {
        const vals = this.keys;
        if (near === BTree.NEAR_MODE.GE) {
            for (let i=0, len=vals.length; i<len; i++) {
                if (key <= vals[i]) return i;
            }
        } else if (near === BTree.NEAR_MODE.LE) {
            for (let i=vals.length - 1; i>=0; i--) {
                if (key >= vals[i]) return i;
            }
        } else {
            for (let i=0, len=vals.length; i<len; i++) {
                if (key === vals[i]) return i;
            }
        }
        return -1;
    }

    addKey(key, record) {
        const vals = this.keys;
        let itm = vals.length;
        for (let i=0, len=itm; i<len; i++) {
            if (key === vals[i]) {
                itm = -1;
                break;
            }
            if (key <= vals[i]) {
                itm = i;
                break;
            }
        }
        if (itm !== -1) {
            for (let i=vals.length; i>itm; i--) {
                vals[i] = vals[i-1];
                this.records[i] = this.records[i-1];
            }
            vals[itm] = key;
            this.records[itm] = record;
        }
        return itm;
    }

    split() {
        const mov = Math.floor(this.keys.length/2);
        const newL = new LeafNode();
        for (let i=mov-1; i>=0; i--) {
            newL.keys[i] = this.keys.pop();
            newL.records[i] = this.records.pop();
        }
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
        for (let i=0, len=frNod.keys.length; i<len; i++) {
            this.keys.push(frNod.keys[i]);
            this.records.push(frNod.records[i]);
        }
        this.nextLeaf = frNod.nextLeaf;
        if (frNod.nextLeaf !== null) frNod.nextLeaf.prevLeaf = this;
        frNod.prevLeaf = null;
        frNod.nextLeaf = null;
        let itm = paNod.keys.length-1;
        for (let i=itm; i>=0; i--) {
            if (paNod.keys[i] === frKey) {
                itm = i;
                break;
            }
        }
        for (var i=itm, len=paNod.keys.length-1; i<len; i++) {
            paNod.keys[i] = paNod.keys[i+1];
            paNod.nodptr[i+1] = paNod.nodptr[i+2];
        }
        paNod.keys.pop();
        paNod.nodptr.pop();
    }

}

class InnerNode extends Node {
    constructor() {
        super();
        this.nodptr = [];
    }

    isLeaf() {
        return false;
    }

    getItem(key) {
        const vals = this.keys;
        for (let i=0, len=vals.length; i<len; i++) {
            if (key < vals[i]) return i;
        }
        return vals.length;
    }

    addKey(key, ptrL, ptrR) {
        const vals = this.keys;
        let itm = vals.length;
        for (let i=0, len=vals.length; i<len; i++) {
            if (key <= vals[i]) {
                itm = i;
                break;
            }
        }
        for (let i=vals.length; i>itm; i--) {
            vals[i] = vals[i-1];
            this.nodptr[i+1] = this.nodptr[i];
        }
        vals[itm] = key;
        this.nodptr[itm] = ptrL;
        this.nodptr[itm+1] = ptrR;
    }

    split() {
        const mov = Math.ceil(this.keys.length/2) - 1;
        const newN = new InnerNode();
        newN.nodptr[mov] = this.nodptr.pop();
        for (let i=mov-1; i>=0; i--) {
            newN.keys[i] = this.keys.pop();
            newN.nodptr[i] = this.nodptr.pop();
        }
        return newN;
    }

    /**
     * @param {InnerNode} frNod
     * @param {InnerNode} paNod
     * @param frKey
     */
    merge(frNod, paNod, paItm) {
        const del = paNod.keys[paItm];
        this.keys.push(del);
        for (let i=0, len=frNod.keys.length; i<len; i++) {
            this.keys.push(frNod.keys[i]);
            this.nodptr.push(frNod.nodptr[i]);
        }
        this.nodptr.push(frNod.nodptr[frNod.nodptr.length-1]);
        for (var i=paItm, len=paNod.keys.length-1; i<len; i++) {
            paNod.keys[i] = paNod.keys[i+1];
            paNod.nodptr[i+1] = paNod.nodptr[i+2];
        }
        paNod.keys.pop();
        paNod.nodptr.pop();
        return del;
    }
}

class BTree {
    constructor(order) {
        this._root = new LeafNode();
        this._maxkey = order-1;
        this._minkyl = Math.floor(order/2);
        this._minkyn = Math.floor(this._maxkey/2);
        this._leaf = null;
        this._item = -1;

        this.key = '';
        this.records = -1;
        this._length = 0;
        this.eof = true;
        this.found = false;
    }

    /** @type {number} */
    get length() {
        return this._length;
    }

    insert(key, rec) {
        const stack = [];
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            stack.push(this._leaf);
            this._item = this._leaf.getItem(key);
            this._leaf = this._leaf.nodptr[this._item];
        }
        this._item = this._leaf.addKey(key, rec);
        this.key = key;
        this.eof = false;
        if (this._item === -1) {
            this.found = true;
            this._item = this._leaf.getItem(key, false);
            this.records = this._leaf.records[this._item];
        } else {
            this.found = false;
            this.records = rec;
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
                        newN.nodptr[0] = pL;
                        newN.nodptr[1] = pR;
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
        return (!this.found);
    }

    remove(key) {
        if (typeof key === 'undefined') {
            if (this._item === -1) {
                this.eof = true;
                this.found = false;
                return false;
            }
            key = this._leaf.keys[this._item];
        }
        this._del(key);
        if (!this.found) {
            this._item = -1;
            this.eof = true;
            this.key = '';
            this.records = -1;
        } else {
            this.seek(key,true);
            this.found = true;
        }
        return (this.found);
    }

    seek(key, near=BTree.NEAR_MODE.NONE) {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._item = this._leaf.getItem(key);
            this._leaf = this._leaf.nodptr[this._item];
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
            this.eof = true;
            this.key = '';
            this.found = false;
            this.records = -1;
        } else {
            this.eof = false;
            this.found = (this._leaf.keys[this._item] === key);
            this.key = this._leaf.keys[this._item];
            this.records = this._leaf.records[this._item];
        }
        return (!this.eof);
    }

    skip(cnt) {
        if (typeof cnt !== 'number') cnt = 1;
        if (this._item === -1 || this._leaf === null) this.eof = true;
        if (cnt > 0) {
            while (!this.eof && this._leaf.keys.length - this._item - 1 < cnt) {
                cnt = cnt - this._leaf.keys.length + this._item;
                this._leaf = this._leaf.nextLeaf;
                if (this._leaf === null) {
                    this.eof = true;
                } else {
                    this._item = 0;
                }
            }
            if (!this.eof) this._item = this._item + cnt;
        } else {
            cnt = -cnt;
            while (!this.eof && this._item < cnt) {
                cnt = cnt - this._item - 1;
                this._leaf = this._leaf.prevLeaf;
                if (this._leaf === null) {
                    this.eof = true;
                } else {
                    this._item = this._leaf.keys.length-1;
                }
            }
            if (!this.eof) {
                this._item = this._item - cnt;
            }
        }
        if (this.eof) {
            this._item = -1;
            this.found = false;
            this.key = '';
            this.records = -1;
        } else {
            this.found = true;
            this.key = this._leaf.keys[this._item];
            this.records = this._leaf.records[this._item];
        }
        return (this.found);
    }

    goto(cnt) {
        if (cnt < 0) {
            this.goBottom();
            if (!this.eof) this.skip(cnt+1);
        } else {
            this.goTop();
            if (!this.eof) this.skip(cnt-1);
        }
        return (this.found);
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
            this._leaf = this._leaf.nodptr[0];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this.eof = true;
            this.found = false;
            this.key = '';
            this.records = -1;
        } else {
            this._item = 0;
            this.eof = false;
            this.found = true;
            this.key = this._leaf.keys[0];
            this.records = this._leaf.records[0];
        }
        return (this.found);
    }

    goBottom() {
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            this._leaf = this._leaf.nodptr[this._leaf.nodptr.length-1];
        }
        if (this._leaf.keys.length === 0) {
            this._item = -1;
            this.eof = true;
            this.found = false;
            this.key = '';
            this.records = -1;
        } else {
            this._item = this._leaf.keys.length-1;
            this.eof = false;
            this.found = true;
            this.key = this._leaf.keys[this._item];
            this.records = this._leaf.records[this._item];
        }
        return (this.found);
    }

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
            for (i = toN.keys.length-1; i>=0; i--) {
                toN.keys[i+mov] = toN.keys[i];
                toN.records[i+mov] = toN.records[i];
            }
            for (i = mov-1; i>=0; i--) {
                toN.keys[i] = frN.keys.pop();
                toN.records[i] = frN.records.pop();
            }
        }
        for (i=1, len=parNod.length; i<len; i++) {
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
                    toN = new node();
                    toI = 0;
                    parNod.push(toN);
                }
                toN.keys[toI] = kidKey[i];
                toN.nodptr[toI] = kidNod[i];
                toI++;
            }
            mov = this._minkyn - toN.keys.length + 1;
            if (mov > 0 && parNod.length > 1) {
                for (i = toN.keys.length-1; i>=0; i--) {
                    toN.keys[i+mov] = toN.keys[i];
                    toN.nodptr[i+mov] = toN.nodptr[i];
                }
                frN = parNod[parNod.length-2];
                for (i = mov-1; i>=0; i--) {
                    toN.keys[i] = frN.keys.pop();
                    toN.nodptr[i] = frN.nodptr.pop();
                }
            }
            i = 0;
            len = parNod.length;
            for (; i<len; i++) {
                parKey.push(parNod[i].keys.pop());
            }
        }
        this._root = parNod[0];
        this.goTop();
        return (this.found);
    }


    _del(key) {
        let i;
        const stack = [];
        let parNod = null;
        let parPtr = -1;
        this._leaf = this._root;
        while (!this._leaf.isLeaf()) {
            stack.push(this._leaf);
            parNod = this._leaf;
            parPtr = this._leaf.getItem(key);
            this._leaf = this._leaf.nodptr[parPtr];
        }
        this._item = this._leaf.getItem(key,false);

        // Key not in tree
        if (this._item === -1) {
            this.found = false;
            return;
        }
        this.found = true;

        // Delete key from leaf
        for (let i=this._item, len=this._leaf.keys.length-1; i<len; i++) {
            this._leaf.keys[i] = this._leaf.keys[i+1];
            this._leaf.records[i] = this._leaf.records[i+1];
        }
        this._leaf.keys.pop();
        this._leaf.records.pop();
        this._length--;

        // Leaf still valid: done
        if (this._leaf === this._root) return;
        if (this._leaf.keys.length >= this._minkyl) {
            if (this._item === 0) BTree._fixNodes(stack, key, this._leaf.keys[0]);
            return;
        }
        let delKey;

        // Steal from left sibling if possible
        let sibL = (parPtr === 0) ? null : parNod.nodptr[parPtr - 1];
        if (sibL !== null && sibL.keys.length > this._minkyl) {
            delKey = (this._item === 0) ? key : this._leaf.keys[0];
            for (i = this._leaf.keys.length; i>0; i--) {
                this._leaf.keys[i] = this._leaf.keys[i-1];
                this._leaf.records[i] = this._leaf.records[i-1];
            }
            this._leaf.keys[0] = sibL.keys.pop();
            this._leaf.records[0] = sibL.records.pop();
            BTree._fixNodes(stack, delKey, this._leaf.keys[0]);
            return;
        }

        // Steal from right sibling if possible
        let sibR = (parPtr === parNod.keys.length) ? null : parNod.nodptr[parPtr + 1];
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
            sibR = (parItm === parNod.keys.length) ? null : parNod.nodptr[parItm+1];
            if (sibR !== null && sibR.keys.length > this._minkyn) {
                curNod.keys.push(parNod.keys[parItm]);
                parNod.keys[parItm] = sibR.keys.shift();
                curNod.nodptr.push(sibR.nodptr.shift());
                break;
            }

            // Steal from left sibling if possible
            sibL = (parItm === 0) ? null : parNod.nodptr[parItm-1];
            if (sibL !== null && sibL.keys.length > this._minkyn) {
                for (i = curNod.keys.length; i>0; i--) {
                    curNod.keys[i] = curNod.keys[i-1];
                }
                for (i = curNod.nodptr.length; i>0; i--) {
                    curNod.nodptr[i] = curNod.nodptr[i-1];
                }
                curNod.keys[0] = parNod.keys[parItm-1];
                parNod.keys[parItm-1] = sibL.keys.pop();
                curNod.nodptr[0] = sibL.nodptr.pop();
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

    static _fixNodes(stk, frKey, toKey) {
        let vals, lvl = stk.length, mor = true;
        do {
            lvl--;
            vals = stk[lvl].keys;
            for (let i=vals.length-1; i>=0; i--) {
                if (vals[i] === frKey) {
                    vals[i] = toKey;
                    mor = false;
                    break;
                }
            }
        } while (mor && lvl>0);
    }

    goToLowerBound(lower, lowerOpen=false) {
        if (lower === undefined) {
            let success = this.seek(lower, BTree.NEAR_MODE.GE);
            if (success && lowerOpen) {
                success = this.skip();
            }
            return success;
        }
        return this.goTop();
    }

    goToUpperBound(upper, upperOpen=false) {
        if (upper === undefined) {
            let success = this.seek(upper, BTree.NEAR_MODE.LE);
            if (success && upperOpen) {
                success = this.skip(-1);
            }
            return success;
        }
        return this.goBottom();
    }

}
BTree.NEAR_MODE = {
    NONE: 0,
    LE: 1,
    GE: 2
};
