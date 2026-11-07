import { describe, expect, test } from 'bun:test';
import { AmountError, evalAmount, formatExpr } from './amount';

describe('Calculator (amount.ts)', () => {
  describe('evalAmount', () => {
    test('operator precedence', () => {
      // Multiplication / division before addition / subtraction
      expect(evalAmount('2 + 3 * 4')).toBe(1400); // 14 rupees = 1400 paise
      expect(evalAmount('10 - 2 * 3')).toBe(400); // 4 rupees = 400 paise
      expect(evalAmount('20 / 4 * 2')).toBe(1000); // (20 / 4) * 2 = 10 rupees = 1000 paise
      expect(evalAmount('10 - 5 - 2')).toBe(300); // 3 rupees = 300 paise
    });

    test('brackets', () => {
      expect(evalAmount('(2 + 3) * 4')).toBe(2000);
      expect(evalAmount('((1 + 2) * (3 + 4))')).toBe(2100);
      expect(evalAmount('100 / (2 + 3)')).toBe(2000);
    });

    test('unary minus and unary plus', () => {
      expect(evalAmount('-5 + 15')).toBe(1000);
      expect(evalAmount('-(-10)')).toBe(1000);
      expect(evalAmount('5 - -5')).toBe(1000);
      expect(evalAmount('-(2 - 7)')).toBe(500);
      expect(evalAmount('+10 + +5')).toBe(1500);
    });

    test('Unicode aliases (×, ÷, −)', () => {
      expect(evalAmount('50 × 2')).toBe(10000);
      expect(evalAmount('100 ÷ 4')).toBe(2500);
      expect(evalAmount('20 − 5')).toBe(1500);
      expect(evalAmount('−5 + 15')).toBe(1000);
      expect(evalAmount('(10 + 10) × 2 ÷ 4 − 5 + 10')).toBe(1500);
    });

    test('decimals and spaces', () => {
      expect(evalAmount('50 * 83.4')).toBe(417000);
      expect(evalAmount('  50   *   83.4  ')).toBe(417000);
      expect(evalAmount('.5 * 10')).toBe(500);
      expect(evalAmount('0.25 + 0.75')).toBe(100);
      expect(evalAmount('  1.5   +   2.5  ')).toBe(400);
    });

    test('rounding half away from zero', () => {
      // 100 / 3 rupees = 33.333333... rupees = 3333.3333... paise -> 3333 paise
      expect(evalAmount('100 / 3')).toBe(3333);
      // 100 / 6 rupees = 16.666666... rupees = 1666.6666... paise -> 1667 paise
      expect(evalAmount('100 / 6')).toBe(1667);
      // 50 * 83.4 -> 417000 paise
      expect(evalAmount('50 * 83.4')).toBe(417000);
      // Float precision 1.005 rupees -> 100.5 paise -> 101 paise
      expect(evalAmount('1.005')).toBe(101);
      // 0.005 rupees -> 0.5 paise -> 1 paisa
      expect(evalAmount('0.005')).toBe(1);
    });

    describe('error cases', () => {
      test('empty input throws AmountError', () => {
        expect(() => evalAmount('')).toThrow(AmountError);
        expect(() => evalAmount('   ')).toThrow(AmountError);
      });

      test('bad syntax throws AmountError', () => {
        expect(() => evalAmount('abc')).toThrow(AmountError);
        expect(() => evalAmount('5 + $')).toThrow(AmountError);
        expect(() => evalAmount('1.2.3')).toThrow(AmountError);
        expect(() => evalAmount('..')).toThrow(AmountError);
        expect(() => evalAmount('(1 + 2')).toThrow(AmountError);
        expect(() => evalAmount('1 + 2)')).toThrow(AmountError);
        expect(() => evalAmount(')(')).toThrow(AmountError);
        expect(() => evalAmount('()')).toThrow(AmountError);
        expect(() => evalAmount('5 +')).toThrow(AmountError);
        expect(() => evalAmount('* 5')).toThrow(AmountError);
        expect(() => evalAmount('5 * * 5')).toThrow(AmountError);
      });

      test('division by zero throws AmountError', () => {
        expect(() => evalAmount('1 / 0')).toThrow(AmountError);
        expect(() => evalAmount('10 ÷ 0')).toThrow(AmountError);
        expect(() => evalAmount('10 / (5 - 5)')).toThrow(AmountError);
      });

      test('result <= 0 throws AmountError', () => {
        expect(() => evalAmount('0')).toThrow(AmountError);
        expect(() => evalAmount('-5')).toThrow(AmountError);
        expect(() => evalAmount('5 - 10')).toThrow(AmountError);
        expect(() => evalAmount('0.001')).toThrow(AmountError); // 0.1 paise -> 0 paise <= 0
      });

      test('result > 1 crore rupees throws AmountError', () => {
        // Exactly 1 crore (10,000,000 rupees = 1,000,000,000 paise) is allowed
        expect(evalAmount('10000000')).toBe(1_000_000_000);
        // Above 1 crore throws
        expect(() => evalAmount('10000001')).toThrow(AmountError);
        expect(() => evalAmount('10000000.01')).toThrow(AmountError);
        expect(() => evalAmount('10000000 * 2')).toThrow(AmountError);
      });
    });
  });

  describe('formatExpr', () => {
    test('normalises operators and spaces', () => {
      expect(formatExpr('50*83.4')).toBe('50 × 83.4');
      expect(formatExpr('50×83.4')).toBe('50 × 83.4');
      expect(formatExpr('10/2')).toBe('10 ÷ 2');
      expect(formatExpr('10÷2')).toBe('10 ÷ 2');
      expect(formatExpr('10-5')).toBe('10 − 5');
      expect(formatExpr('10−5')).toBe('10 − 5');
      expect(formatExpr('10+5')).toBe('10 + 5');
    });

    test('handles brackets and unary signs', () => {
      expect(formatExpr('(50+10)*83.4')).toBe('(50 + 10) × 83.4');
      expect(formatExpr('-5 * 2')).toBe('−5 × 2');
      expect(formatExpr('5 * -2')).toBe('5 × −2');
      expect(formatExpr('-(10 + 5)')).toBe('−(10 + 5)');
      expect(formatExpr('(-5 + 10)')).toBe('(−5 + 10)');
    });

    test('empty or invalid expressions', () => {
      expect(formatExpr('')).toBe('');
      expect(formatExpr('   ')).toBe('');
      expect(() => formatExpr('abc')).toThrow(AmountError);
      expect(() => formatExpr('(1 + 2')).toThrow(AmountError);
      expect(() => formatExpr('()')).toThrow(AmountError);
    });
  });
});
