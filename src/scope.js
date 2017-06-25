import {
  Literal,
  Identifier,
  VariableDeclarator,
  MemberExpression,
  AssignmentExpression,
} from './estransform';
import { assert, cast, alignTo, dereference } from './util';
import {
  StructType,
  ArrayType,
  tystr,
  wordTy,
  mallocTy,
  freeTy,
  memsetTy,
  memset2Ty,
  memset4Ty,
  memcpyTy,
  memcpy2Ty,
  memcpy4Ty,
  spTy,
  builtinTypes,
} from './types';

/**
 * Scopes and Variables
 */

class Variable {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.isStackAllocated =
      type instanceof StructType || type instanceof ArrayType;
  }

  toString() {
    return `${tystr(this.type, 0)} ${this.name}`;
  }

  getStackAccess(scope, loc) {
    assert(this.isStackAllocated);
    assert(
      typeof this.wordOffset !== 'undefined',
      'stack-allocated variable offset not computed.',
    );
    const byteOffset = this.wordOffset * wordTy.size;
    return dereference(scope.SP(), byteOffset, this.type, scope, loc);
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
    const id = cast(new Identifier(t.name), ty);
    if (!inDeclarator) {
      const cachedLocals = this.frame.cachedLocals;
      cachedLocals[t.name] = new VariableDeclarator(id);
    }
    return id;
  }

  cacheReference(node) {
    assert(node);

    if (
      node instanceof MemberExpression &&
      !(node.object instanceof Identifier)
    ) {
      assert(!node.computed);
      const t = this.freshTemp(node.object.ty, node.object.loc);
      node.object = new AssignmentExpression(
        t,
        '=',
        node.object,
        node.object.loc,
      );
      const use = new MemberExpression(
        t,
        node.property,
        false,
        '[]',
        node.property.loc,
      );
      return { def: node, use };
    }

    return { def: node, use: node };
  }

  addVariable(variable, external) {
    assert(variable);
    assert(!variable.frame);
    assert(
      !this.variables[variable.name],
      `Scope already has a variable named ${variable.name}`,
    );
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
    const id = cast(new Identifier(frame.freshVariable(cname, ty).name), ty);
    const init = new MemberExpression(
      frame.root.MEMORY(),
      new Identifier(name),
      false,
    );
    cachedLocals[cname] = new VariableDeclarator(id, init, false);
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
    assert(this.root === this);
    if (!this.cachedMEMORY) {
      this.cachedMEMORY = new Identifier(this.freshVariable('$M').name);
    }
    return this.cachedMEMORY;
  }

  MALLOC() {
    return getCachedLocal(this, 'malloc', mallocTy);
  }

  FREE() {
    return getCachedLocal(this, 'free', freeTy);
  }

  MEMCPY(size) {
    assert(size === 1 || size === 2 || size === 4);
    let name;
    let ty;
    // eslint-disable-next-line default-case
    switch (size) {
      case 1:
        name = 'memcpy';
        ty = memcpyTy;
        break;
      case 2:
        name = 'memcpy2';
        ty = memcpy2Ty;
        break;
      case 4:
        name = 'memcpy4';
        ty = memcpy4Ty;
        break;
    }
    return getCachedLocal(this, name, ty);
  }

  MEMSET(size) {
    assert(size === 1 || size === 2 || size === 4);
    let name;
    let ty;
    // eslint-disable-next-line default-case
    switch (size) {
      case 1:
        name = 'memset';
        ty = memsetTy;
        break;
      case 2:
        name = 'memset2';
        ty = memset2Ty;
        break;
      case 4:
        name = 'memset4';
        ty = memset4Ty;
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
    assert(ty);
    assert(ty.align);

    const alignType = ty.align;
    if (typeof alignType.signed === 'undefined') {
      return getCachedLocal(this, `F${alignType.size}`);
    }
    return getCachedLocal(
      this,
      (alignType.signed ? 'I' : 'U') + alignType.size,
    );
  }

  SP() {
    if (!this.cachedSP) {
      this.cachedSP = cast(
        new Identifier(this.freshVariable('$SP').name),
        spTy,
      );
    }
    return this.cachedSP;
  }

  realSP() {
    return cast(
      new MemberExpression(
        this.getView(builtinTypes.uint),
        new Literal(1),
        true,
      ),
      spTy,
    );
  }

  close() {
    const wordSize = wordTy.size;
    let wordOffset = 0;
    const mangles = this.mangles;
    // The SP and frame sizes are in *words*, since we expect most accesses
    // are to ints, but the alignment is by *double word*, to fit doubles.
    for (const name in mangles) {
      const variable = mangles[name];
      if (mangles[name].isStackAllocated) {
        const size = variable.type.size;
        variable.wordOffset = wordOffset;
        wordOffset += alignTo(size, wordSize * 2) / wordSize;
      }
    }

    this.frameSizeInWords = wordOffset;
  }
}

export { Variable, Scope, Frame, getCachedLocal };
