# jungle-db [![Build Status](https://travis-ci.org/nimiq-network/jungle-db.svg?branch=master)](https://travis-ci.org/nimiq-network/jungle-db)

JungleDB is a simple database abstraction layer for NodeJS (LevelDB or LMDB) and browsers (IndexedDB) supporting advanced features such as transactions with read-isolation and secondary indices.

## Quickstart

1. Clone this repository `git clone https://github.com/nimiq-network/jungle-db`.
2. Run `npm install` or `yarn`
3. Run `npm run build` or `yarn build`
4. Open `clients/browser/index.html` in your browser to access a simple browser example.


### Run Example

#### Run Browser Example
Open `clients/browser/index.html` in your browser.

#### Run NodeJs Example

Start the example by running `clients/nodejs/index.js`.

```bash
cd clients/nodejs/
node index.js
```

### Usage

## Getting started
Depending on your target and preferences, include one of the files in the dist folder into your application.

* Modern Browsers: `indexeddb.js`
* Browser backwards compatibility: `indexeddb-babel.js`
* NodeJS LevelDB: `leveldb.js`
* NodeJS LMDB: `lmdb.js`

Then, create a `JungleDB` instance and potential object stores as follows:
```javascript
// Create a JungleDB instance
// The maxDbSize option is only required for LMDB based databases
const db = new JungleDB('myDatabase', 1, undefined, { maxDbSize: 1024*1024 });

// Create an object store
db.createObjectStore('myStore');

// Switch to an async context
(async function() {
    // Connect to your database
    await db.connect();

    // Now you can easily put/get/remove objects and use transactions.
    const store = db.getObjectStore('myStore');

    const tx = store.transaction();
    await tx.put('test', 'value');
    
    // Prints value
    console.log(await tx.get('test'));
    // Prints undefined due to read isolation
    console.log(await store.get('test'));
    
    await tx.commit();
    
    // Prints value
    console.log(await store.get('test'));
    await store.remove('test');
})();
```

If your next application version now includes an index, you can use upgrade conditions:
```javascript
// Create a JungleDB instance with a new version
// The maxDbSize option is only required for LMDB based databases
const db = new JungleDB('myDatabase', 2, undefined, { maxDbSize: 1024*1024 });

// Create an object store
// The upgrade condition specifies that the store needs to be physically created
// if the database version is less than 1 (since we created it in version 1).
const st = db.createObjectStore('myStore', { upgradeCondition: version => version < 1 });
st.createIndex('myIndex', 'i', { upgradeCondition: version => version < 2 });

// Switch to an async context
(async function() {
    // Connect to your database
    await db.connect();

    // Now you can easily put/get/remove objects and use transactions.
    const store = db.getObjectStore('myStore');

    const tx = store.transaction();
    await tx.put('test', {'i': 1, 'data': 'value'});
    
    // Prints {'i': 1, 'data': 'value'}
    console.log(await tx.get('test'));
    // Prints undefined due to read isolation
    console.log(await store.get('test'));
    
    await tx.commit();
    
    // Prints {'i': 1, 'data': 'value'}
    console.log(await store.get('test'));
    
    // Prints [{'i': 1, 'data': 'value'}]
    console.log(await store.index('myIndex').values(KeyRange.only(1)));
    console.log(await store.values(Query.eq('myIndex', 1)));
    
    await store.remove('test');
})();
```

## Encoding
JungleDB allows to specify custom encodings for values (primary keys are currently restricted to strings only).
The encoding is only applied immediately before writing/after reading from the underlying backend.
A custom encoding – implementing the `ICodec` interface – can be passed to the `JungleDB.createObjectStore(tableName, options)` method in the `options` argument as follows:

```javascript
db.createObjectStore('test', {
    codec: {
        encode: value => yourEncodeFunction(value),
        decode: (value, key) => yourDecodeFunction(value, key),
        valueEncoding: JungleDB.JSON_ENCODING // This property is only used for levelDB and LMDB.
    }    
});
``` 

The `valueEncoding` property defines a backend specific encoding.
While the default JSON encoding is sufficient for most cases, it can be used to optimise storage in case only binary data is stored.
There is also the possibility to define different backend specific encodings for LevelDB and LMDB using `leveldbValueEncoding` and `lmdbValueEncoding`.

### Benchmarks

#### Run IndexedDB Benchmarks
Open `benchmark/indexeddb/index.html` in your browser

#### Run LevelDB Benchmarks

Start the example by running `benchmark/leveldb/index.js`.

```bash
cd benchmark/leveldb/
node index.js
```

#### Run LMDB Benchmarks

Start the example by running `benchmark/lmdb/index.js`.

```bash
cd benchmark/lmdb/
node index.js
```

### Test and Build

#### Run Testsuite
- `npm test` or `yarn test` runs browser and NodeJS tests.
- `npm run test-indexeddb` or `yarn test-indexeddb` runs the testsuite in your browser only.
- `npm run test-leveldb` or `yarn test-leveldb` runs the LevelDB testsuite for NodeJS only.
- `npm run test-lmdb` or `yarn test-lmdb` runs the LMDB testsuite for NodeJS only.

#### Run ESLint
`npm run lint` or `yarn lint` runs the ESLint javascript linter.

#### Build
Executing `npm run build` or `yarn build` concatenates all sources into `dist/{indexeddb,leveldb,lmdb}.js`

## Contribute

If you'd like to contribute to the development of JungleDB please follow our [Code of Conduct](https://github.com/nimiq-network/core/blob/master/.github/CODE_OF_CONDUCT.md) and [Contributing Guidelines](https://github.com/nimiq-network/core/blob/master/.github/CONTRIBUTING.md).

## License

This project is under the [Apache License 2.0](./LICENSE.md).
