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

### API
We're currently annotating all classes and methods to get a complete API documentation.

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
