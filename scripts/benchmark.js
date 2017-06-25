/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const glob = require('glob');
const vm = require('vm');
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
console.log('Benchmarks');
glob.sync(path.join(__dirname, '../benchmarks/*.ljs')).forEach(file => {
  const basename = path.basename(file, '.ljs');
  const content = fs.readFileSync(file, 'UTF-8');
  console.log(`Benchmark ${file} - no memecheck`);
  console.log(`Compiling`);
  let code = compile(
    content,
    Object.assign({}, baseLJSOptions, {
      filename: file,
      basename,
      memcheck: false,
    }),
  );
  console.log(`Running benchmark`);
  eval(code); // eslint-disable-line no-eval
  console.log(`Success ${file}`);

  console.log(`Benchmark ${file} - with memecheck`);
  code = compile(
    fs.readFileSync(file, 'UTF-8'),
    Object.assign({}, baseLJSOptions, {
      filename: file,
      basename,
      memcheck: true,
    }),
  );

  console.log(`Running benchmark`);
  vm.runInNewContext(code, { require, console }, `${basename}`.js);
  console.log(`Success ${file}`);
});
