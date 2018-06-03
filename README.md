# jungle-db [![Build Status](https://travis-ci.org/nimiq-network/jungle-db.svg?branch=master)](https://travis-ci.org/nimiq-network/jungle-db)

JungleDB is a simple database abstraction layer for NodeJS (LevelDB or LMDB) and browsers (IndexedDB) supporting advanced features such as transactions with read-isolation and secondary indices.

## Quickstart

The easiest option to use jungle-db is to install it from the npm repository.
```bash
npm install @nimiq/jungle-db
```

Or alternatively using `yarn add @nimiq/jungle-db`.

## Usage

### Getting started
Depending on your target and preferences, include one of the files in the dist folder into your application.

* Modern Browsers: `indexeddb.js`
* Browser backwards compatibility: `indexeddb-babel.js`
* NodeJS LevelDB: `leveldb.js`
* NodeJS LMDB: `lmdb.js`

In NodeJS, you can use `var JDB = require('@nimiq/jungle-db');` to include the LMDB backend.
In order to use the LevelDB backend, `var JDB = require('@nimiq/jungle-db/dist/leveldb.js');` has to be used.

**Note on Edge browser:** At the time of writing, Edge does not provide full IndexedDB support.
That means that using certain types of indices might fail on Edge.
If you observe a `DataError` in Edge while using JungleDB,
it is most likely that you are using one of the features not supported by Edge.
One of the unsupported features are binary keys.

Then, create a `JungleDB` instance and potential object stores as follows:
```javascript
// Create a JungleDB instance
// The maxDbSize option is only required for LMDB based databases
const db = new JDB.JungleDB('myDatabase', 1);

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
const db = new JungleDB('myDatabase', 2);

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

### Encoding
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
Possible backend specific encodings are:
* `JungleDB.JSON_ENCODING` for JSON objects
* `JungleDB.NUMBER_ENCODING` for numbers
* `JungleDB.STRING_ENCODING` for strings
* `JungleDB.BINARY_ENCODING` for binary types
* `JungleDB.GENERIC_ENCODING` for a generic value (the code automatically determines the encoding and prepends a type byte)

The `createIndex(name, keyPath, options)` method also supports an optional `keyEncoding` option to specify the backend specific encoding of the secondary key.

### Database Options
There are options specific to some of the backends. Especially the LMDB backend is highly configurable.
If an option does not apply for the current backend, it is simply ignored.

#### LMDB Options

* `maxDbSize: number`: The maximum size of the database in bytes (default: 5MB).
* `autoResize: boolean`: This flag indicates whether the database should be automatically resized if needed (default: false).
     If enabled, the DB will be resized by max(`minResize`, spaceNeeded).
* `minResize: number`: The minimum number of bytes the database will be resized (default: 100MB).
* `maxDbs: number`: The maximum number of object stores + indices for this JungleDB instance.
    This value defaults to the correct number of object stores + indices created.

Here is an example to make use of these options.
```javascript
// Create a JungleDB instance with a new version
const db = new JDB.JungleDB('myDatabase', 2, {
    autoResize: true,
    maxDbSize: 1024*1024*100
});
```

## Documentation

A large fraction of the code is documented using [ESDoc](https://esdoc.org) and a hosted version of this documentation can be found [here](https://doc.esdoc.org/github.com/nimiq-network/jungle-db/).

## Installing from Source

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
