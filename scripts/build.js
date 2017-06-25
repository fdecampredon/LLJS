/* eslint-disable import/no-extraneous-dependencies */
const fs = require('fs');
const path = require('path');
const babel = require('babel-core');
const glob = require('glob');

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
console.log('Compiling JS Files');
const jsFiles = glob.sync(path.join(__dirname, '../src/*.js'));
jsFiles.forEach(file => {
  const out = path.join(__dirname, '../lib/', `${path.basename(file)}`);
  console.log(`${file} -> ${out}`);
  const { code } = babel.transformFileSync(file, {
    presets: [
      [
        'env',
        {
          targets: {
            node: 'current',
          },
        },
      ],
    ],
  });

  fs.writeFileSync(out, code);
});
console.log('======================');

const { compile } = require('../lib/ljc');

console.log('Compiling ljs files');
const ljsFiles = glob.sync(path.join(__dirname, '../src/*.ljs'));
ljsFiles.forEach(file => {
  const basename = path.basename(file, '.ljs');
  const out = path.join(__dirname, '../lib/', `${basename}.js`);
  console.log(`${file} -> ${out}`);
  const code = compile(
    fs.readFileSync(file, 'UTF-8'),
    Object.assign({}, baseLJSOptions, {
      filename: file,
      basename,
    }),
  );
  fs.writeFileSync(out, code);
});
console.log('======================');
