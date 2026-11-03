"""Cross-language parser audit (backend side). Expected values in
tests/parser-vectors.json were hand-computed independently of
either parser, at several points per expression (negative, zero,
fractional), including domain exclusions marked "undefined"."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import sympy as sp

from backend.app.mathparse import X, parse_math, to_sympy

VECTORS = json.loads(Path(__file__).resolve().parents[2].joinpath("tests", "parser-vectors.json").read_text())["vectors"]


def test_all_vectors_match_independent_values():
    failures = []
    for v in VECTORS:
        value = to_sympy(parse_math(v["expr"]))
        evaluations = v["evaluations"]
        if not evaluations:
            if not isinstance(value, sp.Eq):
                failures.append(f"{v['expr']}: expected an equation, got {value}")
            continue
        for point, expected in evaluations.items():
            actual = value.subs(X, sp.Rational(point))
            actual = sp.simplify(actual) if not isinstance(actual, sp.Eq) else actual
            if expected == "undefined":
                if not (actual == sp.zoo or actual == sp.nan or getattr(actual, "is_finite", True) is False):
                    failures.append(f"{v['expr']} at x={point}: expected undefined, got {actual}")
            elif actual != sp.Rational(expected):
                failures.append(f"{v['expr']} at x={point}: expected {expected}, got {actual}")
    assert failures == []
