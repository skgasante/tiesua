/** Structured mathematical representation. Single source of truth for
 * display, structured speech and (next stage) independent verification.
 * Every node carries a stable id so speech segments can reference the
 * exact node they came from. Parentheses are preserved as `group` nodes:
 * mathematically transparent, but essential for faithful speech. */

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export type MathNode =
  | { kind: 'number'; id: string; value: string }
  | { kind: 'variable'; id: string; name: string }
  | { kind: 'binary'; id: string; op: BinaryOp; left: MathNode; right: MathNode; implicit?: boolean }
  | { kind: 'unary'; id: string; op: '-'; expr: MathNode }
  | { kind: 'group'; id: string; expr: MathNode }
  | { kind: 'equation'; id: string; left: MathNode; right: MathNode };

export type ExpressionNode = Exclude<MathNode, { kind: 'equation' }>;

/** Compact structural signature, ignoring node ids. Used to prove two
 * expressions are structurally different (or identical). */
export function signature(node: MathNode): string {
  switch (node.kind) {
    case 'number': return `num(${node.value})`;
    case 'variable': return `var(${node.name})`;
    case 'unary': return `neg(${signature(node.expr)})`;
    case 'group': return `grp(${signature(node.expr)})`;
    case 'binary': return `(${signature(node.left)}${node.op}${signature(node.right)})`;
    case 'equation': return `eq(${signature(node.left)},${signature(node.right)})`;
  }
}

/** Human-readable structural outline for the on-screen structure view. */
export function outline(node: MathNode, depth = 0): { label: string; nodeId: string; depth: number }[] {
  const pad = (label: string) => ({ label, nodeId: node.id, depth });
  switch (node.kind) {
    case 'number': return [pad(`number ${node.value}`)];
    case 'variable': return [pad(`unknown ${node.name}`)];
    case 'unary': return [pad('negative of'), ...outline(node.expr, depth + 1)];
    case 'group': return [pad('bracketed group'), ...outline(node.expr, depth + 1)];
    case 'binary': {
      const names: Record<BinaryOp, string> = {
        '+': 'sum', '-': 'difference', '*': 'product', '/': 'fraction / division', '^': 'power',
      };
      return [pad(names[node.op]), ...outline(node.left, depth + 1), ...outline(node.right, depth + 1)];
    }
    case 'equation':
      return [pad('equation'), ...outline(node.left, depth + 1), ...outline(node.right, depth + 1)];
  }
}
