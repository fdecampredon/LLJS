'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.realign = exports.dereference = exports.alignTo = exports.isAlignedTo = exports.div4 = exports.log2 = exports.isPowerOfTwo = exports.isInteger = exports.cast = exports.extend = exports.clone = exports.quote = exports.assert = exports.Logger = exports.OptParser = undefined;

var _estransform = require('./estransform');

var _estransform2 = _interopRequireDefault(_estransform);

var _types = require('./types');

var Types = _interopRequireWildcard(_types);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/* eslint-disable no-bitwise */
const CastExpression = _estransform2.default.CastExpression;
const BinaryExpression = _estransform2.default.BinaryExpression;
const Literal = _estransform2.default.Literal;
const MemberExpression = _estransform2.default.MemberExpression;
const SequenceExpression = _estransform2.default.SequenceExpression;

function realign(expr, lalign) {
  assert(expr.ty instanceof Types.PointerType);
  const ralign = expr.ty.base.align.size;

  if (lalign === ralign) {
    return expr;
  }

  let ratio;
  let op;
  if (lalign < ralign) {
    ratio = ralign / lalign;
    op = '<<';
  } else {
    ratio = lalign / ralign;
    op = '>>';
  }

  return new BinaryExpression(op, expr, new Literal(log2(ratio)), expr.loc);
}

function alignAddress(base, byteOffset, ty) {
  let address = realign(base, ty.align.size);
  if (byteOffset !== 0) {
    assert(isAlignedTo(byteOffset, ty.align.size), `unaligned byte offset ${byteOffset} for type ${quote(ty)} with alignment ${ty.align.size}`);
    const offset = byteOffset / ty.align.size;
    address = new BinaryExpression('+', address, new Literal(offset), address.loc);
  }
  // Remember (coerce) the type of the address for realign, but *do not* cast.
  address.ty = new Types.PointerType(ty);
  return address;
}

function dereference(address, byteOffset, ty, scope, loc) {
  assert(scope);
  address = copy(address, address.ty);
  address = alignAddress(address, byteOffset, ty);
  let expr;
  if (ty instanceof Types.ArrayType) {
    expr = address;
  } else {
    expr = new MemberExpression(scope.getView(ty), address, true, loc);
  }
  // Remember (coerce) the type so we can realign, but *do not* cast.
  expr.ty = ty;
  return expr;
}

function isInteger(x) {
  return (parseInt(x, 10) | 0) === Number(x);
}

function isPowerOfTwo(x) {
  return x && (x & x - 1) === 0;
}

function log2(x) {
  assert(isPowerOfTwo(x), `Value ${x} is not a power of two.`);
  return Math.log(x) / Math.LN2;
}

function div4(x) {
  assert(x % 4 === 0, `Value ${x} is not divisible by four.`);
  return x / 4;
}

function isAlignedTo(offset, alignment) {
  return offset & ~(alignment - 1);
}

function alignTo(offset, alignment) {
  return offset + (alignment - 1) & ~(alignment - 1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function clone(obj) {
  const o = {};
  for (const key in obj) {
    o[key] = obj[key];
  }
  return o;
}

function extend(old, props) {
  const newObj = Object.create(old);
  if (props) {
    for (const key in props) {
      newObj[key] = props[key];
    }
  }
  return newObj;
}

function quote(s) {
  return `\`${s}'`;
}

function cast(node, ty, force) {
  if ((node.ty || force) && node.ty !== ty) {
    node = new CastExpression(undefined, node, node.loc);
    node.force = force;
  }
  node.ty = ty;
  return node;
}

function copy(node, ty) {
  node = new SequenceExpression([node], node.loc);
  node.ty = ty;
  return node;
}

function flushLeft(s, width) {
  let str = s;
  for (let i = 0, j = width - str.length; i < j; i++) {
    str += ' ';
  }
  return str;
}

class OptParser {
  constructor(flatspec) {
    // ['a', 'arg', default, 'help string']
    const longs = this.longs = {};
    const shorts = this.shorts = {};
    this.spec = flatspec.map(s => {
      const o = { name: s[1], short: s[0], default: s[2], help: s[3] };
      if (s[1]) {
        longs[s[1]] = o;
      }
      if (s[0]) {
        shorts[s[0]] = o;
      }
      return o;
    });
  }
  parse(argv) {
    const spec = this.spec;
    const opts = {};
    const argc = argv.length;
    let finished = 0;

    let i;
    for (i = 0; i < argc; i++) {
      const arg = argv[i];
      let match;

      if (arg.charAt(0) === '-' && finished > 0) {
        console.error('malformed options');
        return null;
      }

      if (arg.match(/^--.+=/)) {
        match = arg.match(/^--([^=]+)=(.*)/);
        if (!this.longs[match[1]]) {
          console.error(`unknown option --${match[1]}`);
          return null;
        }
        opts[match[1]] = match[2];
      } else if (arg.match(/^--.+/)) {
        match = arg.match(/^--(.+)/);
        if (!this.longs[match[1]]) {
          console.error(`unknown option --${match[1]}`);
          return null;
        }
        const lspec = this.longs[match[1]];
        if (typeof lspec.default === 'number') {
          if (!opts[match[1]]) {
            opts[match[1]] = 1;
          } else {
            opts[match[1]]++;
          }
        } else if (typeof lspec.default === 'string' && argv[i + 1] && argv[i + 1].charAt(0) !== '-') {
          opts[match[1]] = argv[i + 1];
          i++;
        } else {
          opts[match[1]] = true;
        }
      } else if (arg.match(/^-[^-]+/)) {
        match = arg.match(/^-(.+)/);
        const sspec = this.shorts[match[1]];
        if (sspec) {
          const optname = sspec.name ? sspec.name : match[1];

          if (typeof sspec.default === 'number') {
            if (!opts[optname]) {
              opts[optname] = 1;
            } else {
              opts[optname]++;
            }
          } else if (typeof sspec.default === 'string' && argv[i + 1] && argv[i + 1].charAt(0) !== '-') {
            opts[optname] = argv[i + 1];
            i++;
          } else {
            opts[optname] = true;
          }
        } else {
          const letters = arg.slice(1).split('');
          for (let j = 0, k = letters.length; j < k; j++) {
            const sspec = this.shorts[letters[j]];
            if (!sspec) {
              console.error(`unknown option -${letters[j]}`);
              return null;
            }
            if (typeof sspec.default === 'number') {
              if (!opts[sspec.name]) {
                opts[sspec.name] = 1;
              } else {
                opts[sspec.name]++;
              }
            } else {
              opts[sspec.name] = true;
            }
          }
        }
      }
    }

    finished = i - 1;

    for (let i = 0, j = spec.length; i < j; i++) {
      const s = spec[i];
      if (!(s.name in opts)) {
        opts[s.name] = s.default;
      }
    }

    return { options: opts, rest: argv.slice(finished) };
  }

  usage() {
    const spec = this.spec;
    let str = '\nOptions:\n';
    const indent = '  ';
    for (let i = 0, j = spec.length; i < j; i++) {
      const s = spec[i];
      str += indent;
      if (s.name) {
        if (s.short) {
          str += flushLeft(`-${s.short}`, 4) + flushLeft(`--${s.name}`, 18);
        } else {
          str += flushLeft('', 4) + flushLeft(`--${s.name}`, 18);
        }
      } else {
        str += flushLeft(`-${s.short}`, 22);
      }
      str += `${s.help}\n`;
    }
    return str;
  }
}

/**
 * Logger
 */

const red = 1;
const green = 2;
const magenta = 5;

const bold = 1;

const startANSI = '\x1Bc[';
const clearANSI = `${startANSI}0m`;

function ansi(s, style, fg, bg) {
  const modifiers = [];
  if (style) {
    modifiers.push(style);
  }
  if (fg) {
    modifiers.push(`3${fg}`);
  }
  if (bg) {
    modifiers.push(`4${fg}`);
  }
  return `${startANSI + modifiers.join(';')}m${s}${clearANSI}`;
}

function compareLocations(a, b) {
  let cmp = a.start.line - b.start.line;
  if (cmp === 0) {
    cmp = a.end.line - b.end.line;
    if (cmp === 0) {
      cmp = a.start.column - b.start.column;
      if (cmp === 0) {
        cmp = a.end.column - b.end.column;
      }
    }
  }
  return cmp;
}

const severity = { info: 1, warn: 2, error: 3 };

class Logger {
  constructor(program, name, source, options) {
    this.id = 1;
    this.program = program;
    this.name = name;
    this.options = options;
    this.verbosity = options.trace ? 3 : options.warn ? 2 : 1;
    this.buffer = [];
    this.context = [];
    if (typeof source !== 'string' && !(source instanceof String)) {
      this.source = String(source).split('\n');
    } else {
      this.source = source.split('\n');
    }
  }

  push(node) {
    this.context.push(node);
  }

  pop() {
    this.context.pop();
  }

  _format(prefix, kind, message) {
    if (this.options['simple-log']) {
      return `${prefix} ${kind} ${message}`;
    }

    switch (kind) {
      case 'info':
        kind = ansi('info:', bold);
        break;
      case 'warn':
        kind = ansi('warning:', bold, magenta);
        break;
      default:
        kind = ansi('error:', bold, red);
        break;
    }

    return `${ansi(prefix, bold)} ${kind} ${ansi(message, bold)}`;
  }

  _underlinedSnippet(loc) {
    const indent = '  ';
    let underline = '';
    const line = this.source[loc.start.line - 1];

    for (let i = 0, j = line.length; i < j; i++) {
      if (i === loc.start.column) {
        underline += '^';
      } else if (loc.end.line > loc.start.line || i > loc.start.column && i <= loc.end.column - 1 && !line.charAt(i).match(/\s/)) {
        underline += '~';
      } else {
        underline += ' ';
      }
    }

    return `${indent + line}\n${indent}${ansi(underline, bold, green)}`;
  }

  _bufferMessage(kind, message, loc) {
    if (!loc) {
      const node = this.context[this.context.length - 1];
      if (node && node.loc) {
        loc = node.loc;
      }
    }
    this.buffer.push({
      loc,
      kind,
      message,
      id: this.id++
    });
  }

  info(message, loc) {
    if (this.verbosity >= 3) {
      this._bufferMessage('info', message, loc);
    }
  }

  warn(message, loc) {
    if (this.verbosity >= 2) {
      this._bufferMessage('warn', message, loc);
    }
  }

  error(message, loc) {
    if (this.verbosity >= 1) {
      this._bufferMessage('error', message, loc);
    }
  }

  flush() {
    const humanReadable = !this.options['simple-log'];

    // Sort by location. Messages without location are sorted by the order
    // in which they're added.
    const buf = this.buffer.sort((a, b) => {
      const aloc = a.loc;
      const bloc = b.loc;

      if (!aloc && !bloc) {
        return a.id - b.id;
      }
      if (!aloc && bloc) {
        return -1;
      }
      if (aloc && !bloc) {
        return 1;
      }

      let cmp = compareLocations(aloc, bloc);
      if (cmp === 0) {
        cmp = severity[a.kind] - severity[b.kind];
      }
      return cmp;
    });

    let prev;
    for (let i = 0, buflen = buf.length; i < buflen; i++) {
      const b = buf[i];
      const loc = b.loc;

      let prefix = `${this.name}:`;
      if (loc) {
        prefix += `${loc.start.line}:${loc.start.column}:`;

        if (prev && prev.loc && compareLocations(loc, prev.loc) === 0 && humanReadable) {
          let spacer = '';
          for (let j = 0, k = prefix.length; j < k; j++) {
            spacer += ' ';
          }
          prefix = spacer;
        }
      }

      const formatted = this._format(prefix, b.kind, b.message);
      switch (b.kind) {
        case 'info':
          console.info(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        default:
          console.error(formatted);
          break;
      }

      if (loc && humanReadable) {
        const next = buf[i + 1];
        if (!next || next.loc && compareLocations(loc, next.loc) !== 0) {
          console.info(this._underlinedSnippet(loc));
        }
      }

      prev = b;
    }
  }
}

exports.OptParser = OptParser;
exports.Logger = Logger;
exports.assert = assert;
exports.quote = quote;
exports.clone = clone;
exports.extend = extend;
exports.cast = cast;
exports.isInteger = isInteger;
exports.isPowerOfTwo = isPowerOfTwo;
exports.log2 = log2;
exports.div4 = div4;
exports.isAlignedTo = isAlignedTo;
exports.alignTo = alignTo;
exports.dereference = dereference;
exports.realign = realign;