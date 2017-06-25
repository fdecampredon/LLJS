/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const Mocha = require('mocha');
const { compile } = require('../lib/ljc');

const baseLJSOptions = {
  'only-parse': false,
  'emit-ast': false,
  'pretty-print': false,
  bare: false,
  'load-instead': false,
  warn: true,
  null: false,
  'simple-log': true,
  trace: false,
  memcheck: false,
  help: false,
  nowarn: false,
};

console.log('======================');
console.log('Running src tests');
glob.sync(path.join(__dirname, '../src/**/*.ljs')).forEach(file => {
  const basename = path.basename(file, '.ljs');
  console.log(`Compiling ${file}`);
  const code = compile(
    fs.readFileSync(file, 'UTF-8'),
    Object.assign({}, baseLJSOptions, {
      filename: file,
      basename,
      memcheck: basename === 'test-memcheck',
    }),
  );
  console.log(`Running ${file}`);
  eval(code); // eslint-disable-line no-eval
  console.log(`Success ${file}`);
});

console.log('======================');
console.log('Running mocha tests');
const mocha = new Mocha();
glob.sync(path.join(__dirname, '../test/**/*.ljs')).forEach(file => {
  const basename = path.basename(file, '.ljs');
  console.log(`Compiling ${file}`);
  const out = path.join(__dirname, '../temp/', `${basename}.js`);
  const code = compile(
    fs.readFileSync(file, 'UTF-8'),
    Object.assign({}, baseLJSOptions, {
      filename: file,
      basename,
      memcheck: true,
    }),
  );
  fs.writeFileSync(out, code);
  mocha.addFile(out);
});
// Run the tests.
mocha.run(failures => {
  process.on('exit', () => {
    process.exit(failures); // exit with non-zero status if there were failures
  });
});
console.log('======================');
