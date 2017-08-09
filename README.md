# jungle-db [![Build Status](https://travis-ci.org/nimiq-network/jungle-db.svg?branch=master)](https://travis-ci.org/nimiq-network/jungle-db)

JungleDB is a simple database abstraction layer for NodeJS (LevelDB) and Browsers (IndexedDB) supporting advanced features such as transactions with read-isolation and secondary indices.

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

#### Run Browser Benchmarks
Open `benchmark/browser/index.html` in your browser

#### Run NodeJs Benchmarks

Start the example by running `benchmark/nodejs/index.js`.

```bash
cd benchmark/nodejs/
node index.js
```


## Developers
Developers are free to choose between npm and yarn for managing the dependencies.
### Installation for Core Developers (using npm)
- NodeJs latest version (> 7.9.0)
- Dependencies: `npm install`
- NodeJs dependencies:

	```bash
	cd src/main/platform/nodejs/
	npm install
	cd clients/nodejs/
	npm install
	```

### Installation for Developers (using yarn)
- NodeJs latest version (> 7.9.0)
- Dependencies: `yarn install`
- NodeJs dependencies:

	```bash
	cd src/main/platform/nodejs/
	yarn install
	cd clients/nodejs/
	yarn install
	```

### Test and Build

#### Run Testsuite
- `npm test` or `yarn test` runs browser and NodeJS tests.
- `npm run test-browser` or `yarn test-browser` runs the testsuite in your browser only.
- `npm run test-node` or `yarn test-node` runs the testsuite in NodeJS only.

#### Run ESLint
`npm run lint` or `yarn lint` runs the ESLint javascript linter.

#### Build
Executing `npm run build` or `yarn build` concatenates all sources into `dist/{web,node}.js`

## Contribute

If you'd like to contribute to the development of JungleDB please follow our [Code of Conduct](https://github.com/nimiq-network/core/blob/betanet/.github/CONDUCT.md) and [Contributing Guidelines](https://github.com/nimiq-network/core/blob/betanet/.github/CONTRIBUTING.md).

## License

This project is under the [Apache License 2.0](./LICENSE.md).
