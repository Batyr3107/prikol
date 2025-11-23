// Тесты для утилит
const {
  sanitizeText,
  validateRule,
  validateVote,
  validateUserId,
  calculateRating,
  escapeHtml,
  countVotes
} = require('./utils');

describe('sanitizeText', () => {
  test('должен удалять null bytes', () => {
    expect(sanitizeText('test\0text')).toBe('testtext');
  });

  test('должен удалять control characters', () => {
    expect(sanitizeText('test\x00\x1F\x7Ftext')).toBe('testtext');
  });

  test('должен нормализовать множественные пробелы', () => {
    expect(sanitizeText('test    text')).toBe('test text');
  });

  test('должен удалять пробелы в начале и конце', () => {
    expect(sanitizeText('  test  ')).toBe('test');
  });

  test('должен возвращать пустую строку для null', () => {
    expect(sanitizeText(null)).toBe('');
  });

  test('должен возвращать пустую строку для undefined', () => {
    expect(sanitizeText(undefined)).toBe('');
  });
});

describe('validateUserId', () => {
  test('должен принимать корректные положительные числа', () => {
    expect(validateUserId(123)).toBe(true);
    expect(validateUserId('456')).toBe(true);
  });

  test('должен отклонять отрицательные числа', () => {
    expect(validateUserId(-1)).toBe(false);
    expect(validateUserId('-5')).toBe(false);
  });

  test('должен отклонять ноль', () => {
    expect(validateUserId(0)).toBe(false);
  });

  test('должен отклонять Infinity', () => {
    expect(validateUserId(Infinity)).toBe(false);
    expect(validateUserId(-Infinity)).toBe(false);
  });

  test('должен отклонять NaN', () => {
    expect(validateUserId(NaN)).toBe(false);
    expect(validateUserId('abc')).toBe(false);
  });

  test('должен отклонять числа больше MAX_SAFE_INTEGER', () => {
    expect(validateUserId(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  test('должен принимать MAX_SAFE_INTEGER', () => {
    expect(validateUserId(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  test('должен отклонять пустые значения', () => {
    expect(validateUserId(null)).toBe(false);
    expect(validateUserId(undefined)).toBe(false);
    expect(validateUserId('')).toBe(false);
  });
});

describe('validateRule', () => {
  test('должен принимать корректное правило', () => {
    const result = validateRule('Тестовое правило', 'Описание');
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('должен санитизировать данные', () => {
    const result = validateRule('  Test  ', '  Description  ');
    expect(result.sanitized.title).toBe('Test');
    expect(result.sanitized.description).toBe('Description');
  });

  test('должен отклонять пустое название', () => {
    const result = validateRule('', 'Описание');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Название правила обязательно');
  });

  test('должен отклонять слишком короткое название', () => {
    const result = validateRule('ab', 'Описание');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('не менее 3 символов');
  });

  test('должен отклонять слишком длинное название', () => {
    const longTitle = 'a'.repeat(201);
    const result = validateRule(longTitle, 'Описание');
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('не должно превышать 200 символов');
  });

  test('должен отклонять слишком длинное описание', () => {
    const longDesc = 'a'.repeat(1001);
    const result = validateRule('Название', longDesc);
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('не должно превышать 1000 символов');
  });

  test('должен принимать правило без описания', () => {
    const result = validateRule('Название', '');
    expect(result.isValid).toBe(true);
  });
});

describe('validateVote', () => {
  test('должен принимать 1', () => {
    expect(validateVote(1)).toBe(true);
    expect(validateVote('1')).toBe(true);
  });

  test('должен принимать -1', () => {
    expect(validateVote(-1)).toBe(true);
    expect(validateVote('-1')).toBe(true);
  });

  test('должен отклонять другие значения', () => {
    expect(validateVote(0)).toBe(false);
    expect(validateVote(2)).toBe(false);
    expect(validateVote(-2)).toBe(false);
    expect(validateVote('abc')).toBe(false);
  });
});

describe('calculateRating', () => {
  test('должен правильно суммировать голоса', () => {
    const votes = [
      { value: 1 },
      { value: 1 },
      { value: -1 }
    ];
    expect(calculateRating(votes)).toBe(1);
  });

  test('должен возвращать 0 для пустого массива', () => {
    expect(calculateRating([])).toBe(0);
  });

  test('должен возвращать 0 для null', () => {
    expect(calculateRating(null)).toBe(0);
  });

  test('должен возвращать 0 для undefined', () => {
    expect(calculateRating(undefined)).toBe(0);
  });
});

describe('escapeHtml', () => {
  test('должен экранировать специальные символы', () => {
    expect(escapeHtml('<script>alert("XSS")</script>'))
      .toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
  });

  test('должен экранировать амперсанд', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  test('должен экранировать кавычки', () => {
    expect(escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
    expect(escapeHtml("It's OK")).toBe('It&#039;s OK');
  });

  test('должен возвращать пустую строку для null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('countVotes', () => {
  test('должен правильно считать положительные голоса', () => {
    const votes = [{ value: 1 }, { value: 1 }, { value: -1 }];
    expect(countVotes(votes, 1)).toBe(2);
  });

  test('должен правильно считать отрицательные голоса', () => {
    const votes = [{ value: 1 }, { value: 1 }, { value: -1 }];
    expect(countVotes(votes, -1)).toBe(1);
  });

  test('должен возвращать 0 для пустого массива', () => {
    expect(countVotes([], 1)).toBe(0);
  });

  test('должен возвращать 0 для null', () => {
    expect(countVotes(null, 1)).toBe(0);
  });
});
