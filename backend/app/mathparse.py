"""Controlled mathematical parsing for TieSua.

Learner text is tokenised and parsed into a small AST by this module,
then converted into SymPy objects node-by-node from an allowlist
(numbers, the unknown ``x``, + - * / ^, brackets, one ``=``).
Learner strings are never passed to eval, exec, sympify or any
parser that can evaluate Python code.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import sympy as sp

MAX_INPUT_CHARS = 500
MAX_TOKENS = 120
MAX_NUMBER_DIGITS = 12

X = sp.Symbol("x")


class MathParseError(Exception):
    def __init__(self, message: str, kind: str = "incomplete"):
        super().__init__(message)
        self.kind = kind  # incomplete | unsupported


@dataclass
class Node:
    kind: str  # number | variable | binary | unary | group | equation
    value: str = ""
    op: str = ""
    left: "Node | None" = None
    right: "Node | None" = None
    expr: "Node | None" = None
    children: list = field(default_factory=list)


_NORMALISE = {"×": "*", "✕": "*", "÷": "/", "−": "-", "–": "-", "—": "-", "＝": "="}
_TOKEN_RE = re.compile(r"\d+(?:\.\d+)?|\.\d+|[a-zA-Z]|[+\-*/^=()]")


def tokenize(text: str) -> list[str]:
    if len(text) > MAX_INPUT_CHARS:
        raise MathParseError("That input is too long. Try a shorter step.", "unsupported")
    src = "".join(_NORMALISE.get(c, c) for c in text)
    tokens: list[str] = []
    pos = 0
    for m in _TOKEN_RE.finditer(src):
        gap = src[pos:m.start()].strip()
        if gap:
            raise MathParseError(f"I don't recognise “{gap}”. Use numbers, x, brackets and + - * / ^ =", "unsupported")
        tokens.append(m.group(0))
        pos = m.end()
    if src[pos:].strip():
        raise MathParseError("I found symbols I don't recognise at the end.", "unsupported")
    if len(tokens) > MAX_TOKENS:
        raise MathParseError("That step has too many parts. Try splitting it into smaller steps.", "unsupported")
    return tokens


class _Parser:
    def __init__(self, tokens: list[str]):
        self.tokens = tokens
        self.pos = 0

    def peek(self) -> str | None:
        return self.tokens[self.pos] if self.pos < len(self.tokens) else None

    def next(self) -> str:
        tok = self.peek()
        if tok is None:
            raise MathParseError("The expression ended unexpectedly. Try writing the whole step again.")
        self.pos += 1
        return tok

    def parse(self) -> Node:
        if not self.tokens:
            raise MathParseError("Nothing to check yet. Write a step first.")
        left = self.parse_add_sub()
        node = left
        if self.peek() == "=":
            self.next()
            right = self.parse_add_sub()
            node = Node("equation", left=left, right=right)
        if self.peek() is not None:
            raise MathParseError("I found something extra after the end. Check for repeated symbols or a second equals sign.")
        return node

    def parse_add_sub(self) -> Node:
        left = self.parse_mul_div()
        while self.peek() in ("+", "-"):
            op = self.next()
            left = Node("binary", op=op, left=left, right=self.parse_mul_div())
        return left

    def _starts_atom(self, tok: str | None) -> bool:
        return tok is not None and (tok == "(" or tok[0].isdigit() or tok[0].isalpha() or tok == ".")

    def parse_mul_div(self) -> Node:
        left = self.parse_unary()
        while True:
            if self.peek() in ("*", "/"):
                op = self.next()
                left = Node("binary", op=op, left=left, right=self.parse_unary())
            elif self._starts_atom(self.peek()):
                left = Node("binary", op="*", left=left, right=self.parse_unary())
            else:
                return left

    # Powers bind tighter than a leading minus: -x^2 means -(x^2).
    def parse_power(self) -> Node:
        base = self.parse_atom()
        if self.peek() == "^":
            self.next()
            return Node("binary", op="^", left=base, right=self.parse_unary())
        return base

    def parse_unary(self) -> Node:
        if self.peek() == "-":
            self.next()
            return Node("unary", op="-", expr=self.parse_unary())
        if self.peek() == "+":
            self.next()
            return self.parse_unary()
        return self.parse_power()

    def parse_atom(self) -> Node:
        tok = self.next()
        if tok == "(":
            inner = self.parse_add_sub()
            if self.peek() != ")":
                raise MathParseError("A bracket was opened but not closed. Check every open bracket has a close bracket.")
            self.next()
            return Node("group", expr=inner)
        if tok[0].isdigit() or tok.startswith("."):
            digits = tok.replace(".", "").replace("-", "")
            if len(digits) > MAX_NUMBER_DIGITS:
                raise MathParseError("That number is too large for TieSua. Try a smaller number.", "unsupported")
            return Node("number", value=tok)
        if tok.isalpha():
            return Node("variable", value=tok.lower())
        raise MathParseError("I expected a number, x, or an open bracket there. Try writing the step again.")


def parse_math(text: str) -> Node:
    return _Parser(tokenize(text)).parse()


def to_sympy(node: Node) -> sp.Expr:
    """Convert a validated AST into SymPy. Allowlist only; exact
    rational arithmetic for integers and decimals."""
    if node.kind == "number":
        # Rational('2.5') == 5/2 exactly; never a binary float.
        return sp.Rational(node.value) if "." in node.value else sp.Integer(node.value)
    if node.kind == "variable":
        if node.value != "x":
            raise MathParseError(
                f"TieSua is solving for x just now, and doesn't know “{node.value}”. Try using x.",
                "unsupported",
            )
        return X
    if node.kind == "group":
        return to_sympy(node.expr)  # type: ignore[arg-type]
    if node.kind == "unary":
        inner = to_sympy(node.expr)  # type: ignore[arg-type]
        return -inner if inner.is_number else sp.Mul(sp.Integer(-1), inner, evaluate=False)
    if node.kind == "equation":
        return sp.Eq(to_sympy(node.left), to_sympy(node.right), evaluate=False)  # type: ignore[arg-type]
    if node.kind == "binary":
        left = to_sympy(node.left)  # type: ignore[arg-type]
        right = to_sympy(node.right)  # type: ignore[arg-type]
        # Pure-number subtrees evaluate exactly (2/4 -> 1/2). Compound
        # expressions keep their learner-facing structure ((x+2)/4
        # stays a fraction, not x/4 + 1/2) via evaluate=False; all
        # checking goes through simplify/solve, which evaluate fully.
        both_numbers = bool(left.is_number and right.is_number)
        if node.op == "+":
            return left + right if both_numbers else sp.Add(left, right, evaluate=False)
        if node.op == "-":
            if both_numbers:
                return left - right
            neg = -right if right.is_number else sp.Mul(sp.Integer(-1), right, evaluate=False)
            return sp.Add(left, neg, evaluate=False)
        if node.op == "*":
            return left * right if both_numbers else sp.Mul(left, right, evaluate=False)
        if node.op == "/":
            if sp.simplify(right) == 0:
                raise MathParseError("That step divides by zero, which is not allowed in mathematics.", "division-by-zero")
            return left / right if both_numbers else sp.Mul(left, sp.Pow(right, sp.Integer(-1), evaluate=False), evaluate=False)
        if node.op == "^":
            if not (right.is_number and abs(float(right)) <= 10):
                raise MathParseError("That power is too large or not a plain number. Try a small power.", "unsupported")
            return left ** right if both_numbers else sp.Pow(left, right, evaluate=False)
    raise MathParseError("That mathematical form is not supported yet.", "unsupported")


# ---------------------------------------------------------------- words
_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}


def _numbers_to_digits(text: str) -> str:
    # Expand hyphenated number words (twenty-one) without touching
    # minus signs: a bare '-' token is an operator, never a hyphen.
    expanded: list[str] = []
    for token in text.split():
        if "-" in token and not token.startswith("-") and token != "-":
            parts = token.split("-")
            if all(p in _ONES or p in _TENS or p in ("hundred", "and") for p in parts):
                expanded.extend(parts)
                continue
        expanded.append(token)
    words = expanded
    # Standard number-word accumulation, so "one hundred and five"
    # becomes 105 (not 1 + an unknown word "hundred").
    out: list[str] = []
    current: int | None = None

    def flush() -> None:
        nonlocal current
        if current is not None:
            out.append(str(current))
            current = None

    for w in words:
        if w in _ONES:
            current = (current or 0) + _ONES[w]
        elif w in _TENS:
            current = (current or 0) + _TENS[w]
        elif w == "hundred":
            current = (current or 1) * 100
        elif w == "and" and current is not None:
            continue
        else:
            flush()
            out.append(w)
    flush()
    return " ".join(out)


def words_to_symbols(text: str) -> str:
    """Convert spoken-style maths ('x plus two all over four') into the
    symbol grammar. Deterministic phrase replacement only."""
    t = f" {text.lower().replace(',', ' ').strip().rstrip('.')} "
    if " all over " in t:
        # An equation boundary outranks the fraction: in "x plus two,
        # all over four, equals three" the "equals three" belongs to
        # the whole equation, not to the denominator. Split the
        # spoken equality first, then let each side handle its own
        # "all over" grouping.
        eq_match = re.search(r"\b(is equal to|is equals|equal to|equals|is)\b", t)
        if eq_match:
            left_eq = t[:eq_match.start()].strip()
            right_eq = t[eq_match.end():].strip()
            return f"{words_to_symbols(left_eq)} = {words_to_symbols(right_eq)}"
        left, right = t.split(" all over ", 1)
        return f"({words_to_symbols(left.strip())}) / ({words_to_symbols(right.strip())})"
    replacements = [
        ("open bracket", " ( "), ("close bracket", " ) "),
        ("divided by", " / "), ("multiplied by", " * "),
        ("to the power of", " ^ "),
        # Equality phrasing must be consumed whole: leaving a bare
        # "is" behind splits into an unknown variable "i" and the
        # learner is wrongly told they used the wrong letter.
        ("equals to", " = "), ("is equal to", " = "), ("is equals", " = "), ("equal to", " = "), ("equals", " = "),
        ("makes", " = "), ("gives", " = "),
        ("plus", " + "), ("minus", " - "), ("times", " * "), ("over", " / "),
        ("negative", " -"), ("(", " ( "), (")", " ) "),
    ]
    for old, new in replacements:
        t = t.replace(old, new)
    # A remaining standalone "is" is equality ("x is five"); word
    # boundaries protect words like "division" and "this".
    t = re.sub(r"\bis\b", " = ", t)
    t = _numbers_to_digits(t)
    return re.sub(r"\s+", " ", t).strip()
