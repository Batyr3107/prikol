module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    // Разрешаем console для logger
    'no-console': 'off',

    // Неиспользуемые переменные (игнорируем переменные начинающиеся с _)
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],

    // Требуем const где возможно
    'prefer-const': 'error',

    // Запрещаем var
    'no-var': 'error',

    // Требуем точку с запятой
    'semi': ['error', 'always'],

    // Одинарные кавычки
    'quotes': ['error', 'single', { avoidEscape: true }],

    // Запятые в конце
    'comma-dangle': ['error', 'never'],

    // Пробелы в объектах
    'object-curly-spacing': ['error', 'always'],

    // Пробелы в массивах
    'array-bracket-spacing': ['error', 'never'],

    // Пробелы вокруг стрелок
    'arrow-spacing': 'error',

    // Отступы (2 пробела)
    'indent': ['error', 2, { SwitchCase: 1 }],

    // Максимальная длина строки (предупреждение)
    'max-len': ['warn', {
      code: 120,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreComments: true
    }],

    // Требуем строгого равенства
    'eqeqeq': ['error', 'always'],

    // Запрещаем trailing spaces
    'no-trailing-spaces': 'error',

    // Требуем пустую строку в конце файла
    'eol-last': ['error', 'always'],

    // Максимум пустых строк подряд
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }]
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    '*.db',
    '.env*'
  ]
};
