export class AmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountError';
    Object.setPrototypeOf(this, AmountError.prototype);
  }
}

type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MUL' | 'DIV' | 'LPAREN' | 'RPAREN';

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'PLUS', value: '+' });
      i++;
      continue;
    }

    if (ch === '-' || ch === '\u2212') {
      tokens.push({ type: 'MINUS', value: '-' });
      i++;
      continue;
    }

    if (ch === '*' || ch === '\u00D7') {
      tokens.push({ type: 'MUL', value: '*' });
      i++;
      continue;
    }

    if (ch === '/' || ch === '\u00F7') {
      tokens.push({ type: 'DIV', value: '/' });
      i++;
      continue;
    }

    if (/[0-9]/.test(ch) || ch === '.') {
      let numStr = '';
      let dotCount = 0;

      while (i < len && (/[0-9]/.test(expr[i]) || expr[i] === '.')) {
        if (expr[i] === '.') {
          dotCount++;
        }
        numStr += expr[i];
        i++;
      }

      if (dotCount > 1 || numStr === '.') {
        throw new AmountError(`Invalid number format: "${numStr}"`);
      }

      tokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    throw new AmountError(`Unexpected character: "${ch}"`);
  }

  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) {
      throw new AmountError('Unexpected end of expression');
    }
    this.pos++;
    return tok;
  }

  parse(): number {
    if (this.tokens.length === 0) {
      throw new AmountError('Empty expression');
    }
    const result = this.parseAdditive();
    if (this.pos < this.tokens.length) {
      const remaining = this.peek();
      throw new AmountError(`Unexpected token: "${remaining?.value}"`);
    }
    return result;
  }

  validate(): void {
    if (this.tokens.length === 0) {
      throw new AmountError('Empty expression');
    }
    this.validateAdditive();
    if (this.pos < this.tokens.length) {
      const remaining = this.peek();
      throw new AmountError(`Unexpected token: "${remaining?.value}"`);
    }
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();

    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok || (tok.type !== 'PLUS' && tok.type !== 'MINUS')) {
        break;
      }
      this.consume();
      const right = this.parseMultiplicative();
      if (tok.type === 'PLUS') {
        left += right;
      } else {
        left -= right;
      }
    }

    return left;
  }

  private validateAdditive(): void {
    this.validateMultiplicative();
    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok || (tok.type !== 'PLUS' && tok.type !== 'MINUS')) {
        break;
      }
      this.consume();
      this.validateMultiplicative();
    }
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();

    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok || (tok.type !== 'MUL' && tok.type !== 'DIV')) {
        break;
      }
      this.consume();
      const right = this.parseUnary();
      if (tok.type === 'MUL') {
        left *= right;
      } else {
        if (Math.abs(right) === 0) {
          throw new AmountError('Division by zero');
        }
        left /= right;
      }
    }

    return left;
  }

  private validateMultiplicative(): void {
    this.validateUnary();
    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (!tok || (tok.type !== 'MUL' && tok.type !== 'DIV')) {
        break;
      }
      this.consume();
      this.validateUnary();
    }
  }

  private parseUnary(): number {
    const tok = this.peek();
    if (!tok) {
      throw new AmountError('Unexpected end of expression');
    }

    if (tok.type === 'PLUS') {
      this.consume();
      return this.parseUnary();
    }

    if (tok.type === 'MINUS') {
      this.consume();
      return -this.parseUnary();
    }

    return this.parsePrimary();
  }

  private validateUnary(): void {
    const tok = this.peek();
    if (!tok) {
      throw new AmountError('Unexpected end of expression');
    }

    if (tok.type === 'PLUS' || tok.type === 'MINUS') {
      this.consume();
      this.validateUnary();
      return;
    }

    this.validatePrimary();
  }

  private parsePrimary(): number {
    const tok = this.peek();
    if (!tok) {
      throw new AmountError('Unexpected end of expression');
    }

    if (tok.type === 'NUMBER') {
      this.consume();
      const num = parseFloat(tok.value);
      if (Number.isNaN(num)) {
        throw new AmountError(`Invalid number: "${tok.value}"`);
      }
      return num;
    }

    if (tok.type === 'LPAREN') {
      this.consume();
      const val = this.parseAdditive();
      const closing = this.peek();
      if (!closing || closing.type !== 'RPAREN') {
        throw new AmountError('Missing closing parenthesis');
      }
      this.consume();
      return val;
    }

    throw new AmountError(`Unexpected token: "${tok.value}"`);
  }

  private validatePrimary(): void {
    const tok = this.peek();
    if (!tok) {
      throw new AmountError('Unexpected end of expression');
    }

    if (tok.type === 'NUMBER') {
      this.consume();
      return;
    }

    if (tok.type === 'LPAREN') {
      this.consume();
      this.validateAdditive();
      const closing = this.peek();
      if (!closing || closing.type !== 'RPAREN') {
        throw new AmountError('Missing closing parenthesis');
      }
      this.consume();
      return;
    }

    throw new AmountError(`Unexpected token: "${tok.value}"`);
  }
}

function roundHalfAwayFromZero(num: number): number {
  const fixed = Number(num.toFixed(10));
  const sign = fixed < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(fixed) + 0.5);
}

const MAX_RUPEES = 10_000_000; // ₹1 crore
const MAX_PAISE = MAX_RUPEES * 100; // 1,000,000,000 paise

export function evalAmount(expr: string): number {
  if (!expr || expr.trim() === '') {
    throw new AmountError('Expression cannot be empty');
  }

  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  const valueRupees = parser.parse();

  if (!Number.isFinite(valueRupees) || Number.isNaN(valueRupees)) {
    throw new AmountError('Invalid result');
  }

  const paise = roundHalfAwayFromZero(valueRupees * 100);

  if (paise <= 0) {
    throw new AmountError(`Result must be greater than zero: got ${paise} paise`);
  }

  if (paise > MAX_PAISE) {
    throw new AmountError(`Result exceeds ₹1 crore (10,000,000 rupees): got ${paise} paise`);
  }

  return paise;
}

export function formatExpr(expr: string): string {
  if (!expr || expr.trim() === '') {
    return '';
  }

  const tokens = tokenize(expr);
  if (tokens.length === 0) {
    return '';
  }

  // Validate syntax
  const parser = new Parser(tokens);
  parser.validate();

  let result = '';
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : undefined;

    const isUnary =
      (tok.type === 'PLUS' || tok.type === 'MINUS') &&
      (!prev ||
        prev.type === 'PLUS' ||
        prev.type === 'MINUS' ||
        prev.type === 'MUL' ||
        prev.type === 'DIV' ||
        prev.type === 'LPAREN');

    if (tok.type === 'NUMBER') {
      result += tok.value;
    } else if (tok.type === 'LPAREN') {
      result += '(';
    } else if (tok.type === 'RPAREN') {
      result += ')';
    } else if (isUnary) {
      result += tok.type === 'MINUS' ? '\u2212' : '+';
    } else {
      // Binary operator
      let symbol = '+';
      if (tok.type === 'MINUS') symbol = '\u2212';
      else if (tok.type === 'MUL') symbol = '\u00D7';
      else if (tok.type === 'DIV') symbol = '\u00F7';

      result += ` ${symbol} `;
    }
  }

  return result;
}
