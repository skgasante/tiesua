import type { MathNode } from '../math/ast';
import { planText, toSpeechPlan } from '../speech/speechPlan';

/** Accessible visual rendering of the AST (semantic HTML/CSS, no
 * images). Fractions are stacked so sighted learners and judges see
 * the same structure the speech plan describes. */
export function MathView({ node }: { node: MathNode }) {
  return <span role="img" aria-label={planText(toSpeechPlan(node, 'natural'))}><MathContent node={node} /></span>;
}

function MathContent({ node }: { node: MathNode }) {
  switch (node.kind) {
    case 'number': return <span>{node.value}</span>;
    case 'variable': return <span className="math-var">{node.name}</span>;
    case 'unary': return <span>−<MathContent node={node.expr} /></span>;
    case 'group': return <span>(<MathContent node={node.expr} />)</span>;
    case 'equation':
      return <span className="math-eq"><MathContent node={node.left} /><span className="math-op">=</span><MathContent node={node.right} /></span>;
    case 'binary': {
      if (node.op === '/') {
        return (
          <span className="math-frac">
            <span className="math-frac-top"><MathContent node={node.left} /></span>
            <span className="math-frac-bottom"><MathContent node={node.right} /></span>
          </span>
        );
      }
      const symbol = node.op === '*' ? '×' : node.op === '-' ? '−' : node.op;
      return <span><MathContent node={node.left} /><span className="math-op">{symbol}</span><MathContent node={node.right} /></span>;
    }
  }
}
