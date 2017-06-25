'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getCachedLocal = exports.Frame = exports.Scope = exports.Variable = undefined;

var _estransform = require('./estransform');

var _util = require('./util');

var _types = require('./types');

/**
 * Scopes and Variables
 */

class Variable {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.isStackAllocated = type instanceof _types.StructType || type instanceof _types.ArrayType;
  }

  toString() {
    return `${(0, _types.tystr)(this.type, 0)} ${this.name}`;
  }

  getStackAccess(scope, loc) {
    (0, _util.assert)(this.isStackAllocated);
    (0, _util.assert)(typeof this.wordOffset !== 'undefined', 'stack-allocated variable offset not computed.');
    const byteOffset = this.wordOffset * _types.wordTy.size;
    return (0, _util.dereference)(scope.SP(), byteOffset, this.type, scope, loc);
  }
}

class Scope {
  constructor(parent, name) {
    this.name = name;
    this.parent = parent;
    this.root = parent && parent.root;
    this.variables = Object.create(null);
    this.frame = parent && parent.frame;
    // assert(this.frame instanceof Frame);
  }

  getVariable(name, local) {
    const variable = this.variables[name];
    if (variable instanceof Variable) {
      return variable;
    }

    if (this.parent && !local) {
      return this.parent.getVariable(name);
    }

    return null;
  }

  freshName(name, variable) {
    const mangles = this.frame.mangles;
    let fresh = 0;
    let freshName = name;
    while (mangles[freshName]) {
      freshName = `${name}$${++fresh}`;
    }
    if (variable) {
      mangles[freshName] = variable;
    }
    return freshName;
  }

  freshVariable(name, type) {
    const variable = new Variable(name, type);
    variable.name = this.freshName(name, variable);
    return variable;
  }

  freshTemp(ty, loc, inDeclarator) {
    const t = this.freshVariable('_', ty);
    const id = (0, _util.cast)(new _estransform.Identifier(t.name), ty);
    if (!inDeclarator) {
      const cachedLocals = this.frame.cachedLocals;
      cachedLocals[t.name] = new _estransform.VariableDeclarator(id);
    }
    return id;
  }

  cacheReference(node) {
    (0, _util.assert)(node);

    if (node instanceof _estransform.MemberExpression && !(node.object instanceof _estransform.Identifier)) {
      (0, _util.assert)(!node.computed);
      const t = this.freshTemp(node.object.ty, node.object.loc);
      node.object = new _estransform.AssignmentExpression(t, '=', node.object, node.object.loc);
      const use = new _estransform.MemberExpression(t, node.property, false, '[]', node.property.loc);
      return { def: node, use };
    }

    return { def: node, use: node };
  }

  addVariable(variable, external) {
    (0, _util.assert)(variable);
    (0, _util.assert)(!variable.frame);
    (0, _util.assert)(!this.variables[variable.name], `Scope already has a variable named ${variable.name}`);
    variable.frame = this.frame;

    const variables = this.variables;
    const name = variable.name;

    variables[name] = variable;
    if (!external) {
      variable.name = this.freshName(name, variable);
    }

    // console.log("added variable " + variable + " to scope " + this);
  }

  MEMORY() {
    return this.root.MEMORY();
  }

  getView(type) {
    return this.frame.getView(type);
  }

  MALLOC() {
    return this.frame.MALLOC();
  }

  FREE() {
    return this.frame.FREE();
  }

  MEMCPY(size) {
    return this.frame.MEMCPY(size);
  }

  MEMSET(size) {
    return this.frame.MEMSET(size);
  }

  MEMCHECK_CALL_PUSH() {
    return this.frame.MEMCHECK_CALL_PUSH();
  }

  MEMCHECK_CALL_RESET() {
    return this.frame.MEMCHECK_CALL_RESET();
  }

  MEMCHECK_CALL_POP() {
    return this.frame.MEMCHECK_CALL_POP();
  }

  toString() {
    return this.name;
  }
}

function getCachedLocal(frame, name, ty) {
  const cachedLocals = frame.cachedLocals;
  const cname = `$${name}`;
  if (!cachedLocals[cname]) {
    const id = (0, _util.cast)(new _estransform.Identifier(frame.freshVariable(cname, ty).name), ty);
    const init = new _estransform.MemberExpression(frame.root.MEMORY(), new _estransform.Identifier(name), false);
    cachedLocals[cname] = new _estransform.VariableDeclarator(id, init, false);
  }
  return cachedLocals[cname].id;
}

class Frame extends Scope {
  constructor(parent, name) {
    super(parent, name);
    this.root = parent ? parent.root : this;
    this.cachedLocals = Object.create(null);
    this.frame = this;
    this.mangles = Object.create(null);
  }

  MEMORY() {
    (0, _util.assert)(this.root === this);
    if (!this.cachedMEMORY) {
      this.cachedMEMORY = new _estransform.Identifier(this.freshVariable('$M').name);
    }
    return this.cachedMEMORY;
  }

  MALLOC() {
    return getCachedLocal(this, 'malloc', _types.mallocTy);
  }

  FREE() {
    return getCachedLocal(this, 'free', _types.freeTy);
  }

  MEMCPY(size) {
    (0, _util.assert)(size === 1 || size === 2 || size === 4);
    let name;
    let ty;
    // eslint-disable-next-line default-case
    switch (size) {
      case 1:
        name = 'memcpy';
        ty = _types.memcpyTy;
        break;
      case 2:
        name = 'memcpy2';
        ty = _types.memcpy2Ty;
        break;
      case 4:
        name = 'memcpy4';
        ty = _types.memcpy4Ty;
        break;
    }
    return getCachedLocal(this, name, ty);
  }

  MEMSET(size) {
    (0, _util.assert)(size === 1 || size === 2 || size === 4);
    let name;
    let ty;
    // eslint-disable-next-line default-case
    switch (size) {
      case 1:
        name = 'memset';
        ty = _types.memsetTy;
        break;
      case 2:
        name = 'memset2';
        ty = _types.memset2Ty;
        break;
      case 4:
        name = 'memset4';
        ty = _types.memset4Ty;
        break;
    }
    return getCachedLocal(this, name, ty);
  }

  MEMCHECK_CALL_PUSH() {
    return getCachedLocal(this, 'memcheck_call_push', 'dyn');
  }

  MEMCHECK_CALL_RESET() {
    return getCachedLocal(this, 'memcheck_call_reset', 'dyn');
  }

  MEMCHECK_CALL_POP() {
    return getCachedLocal(this, 'memcheck_call_pop', 'dyn');
  }

  getView(ty) {
    (0, _util.assert)(ty);
    (0, _util.assert)(ty.align);

    const alignType = ty.align;
    if (typeof alignType.signed === 'undefined') {
      return getCachedLocal(this, `F${alignType.size}`);
    }
    return getCachedLocal(this, (alignType.signed ? 'I' : 'U') + alignType.size);
  }

  SP() {
    if (!this.cachedSP) {
      this.cachedSP = (0, _util.cast)(new _estransform.Identifier(this.freshVariable('$SP').name), _types.spTy);
    }
    return this.cachedSP;
  }

  realSP() {
    return (0, _util.cast)(new _estransform.MemberExpression(this.getView(_types.builtinTypes.uint), new _estransform.Literal(1), true), _types.spTy);
  }

  close() {
    const wordSize = _types.wordTy.size;
    let wordOffset = 0;
    const mangles = this.mangles;
    // The SP and frame sizes are in *words*, since we expect most accesses
    // are to ints, but the alignment is by *double word*, to fit doubles.
    for (const name in mangles) {
      const variable = mangles[name];
      if (mangles[name].isStackAllocated) {
        const size = variable.type.size;
        variable.wordOffset = wordOffset;
        wordOffset += (0, _util.alignTo)(size, wordSize * 2) / wordSize;
      }
    }

    this.frameSizeInWords = wordOffset;
  }
}

exports.Variable = Variable;
exports.Scope = Scope;
exports.Frame = Frame;
exports.getCachedLocal = getCachedLocal;