'use strict';

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _util = require('./util');

var util = _interopRequireWildcard(_util);

var _esprima = require('./esprima');

var esprima = _interopRequireWildcard(_esprima);

var _escodegen = require('./escodegen');

var escodegen = _interopRequireWildcard(_escodegen);

var _estransform = require('./estransform');

var estransform = _interopRequireWildcard(_estransform);

var _compiler = require('./compiler');

var compiler = _interopRequireWildcard(_compiler);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const lang = estransform.lang;
const allFields = estransform.allFields;

function pretty(node, indent = '') {
  let s = '';

  if (node instanceof Array) {
    for (let i = 0, j = node.length; i < j; i += 1) {
      s += pretty(node[i], indent);
    }
    return s;
  }

  s += indent + node.type;

  const spec = lang[node.type];
  if (!spec) {
    s += ' ???\n';
    return null;
  }

  const fields = allFields(spec);
  const children = [];
  const values = [];
  // We do loc manually.
  fields.pop();
  for (let i = 0, j = fields.length; i < j; i++) {
    let fname = fields[i];
    if (fname.charAt(0) === '@') {
      fname = fname.substr(1);
      if (node[fname]) {
        children.push(pretty(node[fname], `${indent}  `));
      }
    } else if (typeof node[fname] !== 'undefined') {
      values.push(node[fname]);
    }
  }

  if (values.length) {
    s += ` '${values.join("' '")}'`;
  }

  const loc = node.loc;
  if (loc) {
    s += ` (${loc.start.line}:${loc.start.column}-${loc.end.line}:${loc.end.column})`;
  }

  s += `\n${children.join('')}`;

  return s;
}

function cli() {
  const argv = process.argv;
  const optparser = new util.OptParser([['E', 'only-parse', false, 'Only parse'], ['A', 'emit-ast', false, 'Do not generate JS, emit AST'], ['P', 'pretty-print', false, 'Pretty-print AST instead of emitting JSON (with -A)'], ['b', 'bare', false, 'Do not wrap in a module'], ['l', 'load-instead', false, "Emit load('memory') instead of require('memory')"], ['W', 'warn', true, 'Print warnings (enabled by default)'], ['Wconversion', null, false, 'Print intra-integer and pointer conversion warnings'], ['0', 'simple-log', false, 'Log simple messages. No colors and snippets.'], ['t', 'trace', false, 'Trace compiler execution'], ['o', 'output', '', 'Output file name'], ['m', 'memcheck', false, 'Compile with memcheck instrumentation'], ['h', 'help', false, 'Print this message'], ['w', 'nowarn', false, 'Inhibit all warning messages']]);

  const p = optparser.parse(argv);
  if (!p) {
    process.exit(1);
  }

  const options = p.options;
  const files = p.rest;

  if (!files.length || options.help) {
    console.log('ljc: [option(s)] file');
    console.log(optparser.usage());
    process.exit();
  }

  const filename = files[0];
  const path = filename.split('/');
  let basename = path.pop();
  basename = basename.substr(0, basename.lastIndexOf('.')) || basename;

  const source = _fs2.default.readFileSync(filename);
  options.filename = filename;
  options.basename = basename;
  const code = compile(source, options);

  if (options['pretty-print']) {
    console.log(pretty(code));
  } else if (options.output) {
    // var outname = (dir ? dir + "/" : "") + basename;
    // Don't overwrite the source file by mistake.
    if (options.output !== filename) {
      if (options['emit-ast']) {
        _fs2.default.writeFileSync(options.output, JSON.stringify(code, null, 2));
      } else {
        // Escodegen doesn't emit a final newline for some reason, so add one.
        _fs2.default.writeFileSync(options.output, `${code}\n`);
      }
    }
  } else {
    console.log(code);
  }
}

function compile(source, options) {
  // -W anything infers -W.
  for (const p in options) {
    if (p.charAt(0) === 'W') {
      options.warn = true;
      break;
    }
  }

  if (options.nowarn) {
    options.warn = false;
  }

  const logger = new util.Logger('ljc', options.filename, source, options);
  let code;

  try {
    let node = esprima.parse(source, {
      loc: true,
      comment: true,
      range: true,
      tokens: true
    });

    node = escodegen.attachComments(node, node.comments, node.tokens);

    if (options['only-parse']) {
      code = node;
    } else {
      node = compiler.compile(node, options.basename, logger, options);
      if (options['emit-ast']) {
        code = node;
      } else {
        code = escodegen.generate(node, {
          base: '',
          indent: '  ',
          comment: true
        });
      }
    }
  } catch (e) {
    if (e.index) {
      // Esprima error, make a loc out of it.
      const lc = { line: e.lineNumber, column: e.column - 1 };
      e.loc = { start: lc, end: lc };
      logger.error(e.message, { start: lc, end: lc });
      logger.flush();
      process.exit(1);
    }

    if (e.logged) {
      // Compiler error that has already been logged, so just flush and
      // process.exit.
      logger.flush();
      process.exit(1);
    }

    throw e;
  }

  logger.flush();
  return code;
}

exports.cli = cli;
exports.compile = compile;