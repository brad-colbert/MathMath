/**
 * The definitions above a point on the sheet, for symbolic evaluation. These are expressions rather
 * than values, because `c := 1/3` then `c + 1 →` must give exactly 4/3.
 */
import type { Scope } from '../engine/evaluate.js';
import type { Expr, Target } from '../model/ast.js';

export interface Definition {
  /** Parameters, for a function. */
  params: string[] | null;
  /** Null for targets with no single expression, such as `v[i] := …`. */
  body: Expr | null;
  /** Definitions as they stood here, so a redefinition below doesn't reach back. */
  env: Defs;
  scope: Scope;
  /** An argument that's already been expanded. */
  bound?: true;
}

export class Defs {
  constructor(private parent: Defs | null = null, private name = '', private entry: Definition | null = null) {}

  find(name: string): Definition | undefined {
    for (let d: Defs | null = this; d; d = d.parent) if (d.entry && d.name === name) return d.entry;
    return undefined;
  }

  add(name: string, entry: Definition): Defs {
    return new Defs(this, name, entry);
  }

  /** The definitions after a sheet definition. */
  with(t: Target, value: Expr, scope: Scope): Defs {
    switch (t.k) {
      case 'var': return this.add(t.name, { params: null, body: value, env: this, scope });
      case 'fn': return this.add(t.name, { params: t.params, body: value, env: this, scope });
      case 'index':
      case 'col': return this.add(t.name, { params: null, body: null, env: this, scope });
      case 'multi': return t.targets.reduce<Defs>((d, x) => d.with(x, value, scope), this);
      case 'unsupported': return this;
    }
  }
}
