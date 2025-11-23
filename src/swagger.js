const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Rules Voting API',
      version: '1.0.0',
      description: 'API для создания и голосования за правила',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      },
      {
        url: 'https://api.yourdomain.com',
        description: 'Production server'
      }
    ],
    tags: [
      {
        name: 'Rules',
        description: 'Операции с правилами'
      },
      {
        name: 'Stats',
        description: 'Статистика'
      },
      {
        name: 'Health',
        description: 'Проверка здоровья API'
      }
    ],
    components: {
      schemas: {
        Rule: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'ID правила',
              example: 1
            },
            title: {
              type: 'string',
              description: 'Название правила',
              example: 'Универсальное правило №1'
            },
            description: {
              type: 'string',
              description: 'Описание правила',
              example: 'Подробное описание правила'
            },
            author: {
              type: 'string',
              description: 'Имя автора',
              example: 'Иван Иванов'
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Дата создания'
            },
            rating: {
              type: 'integer',
              description: 'Рейтинг правила',
              example: 42
            },
            votesCount: {
              type: 'integer',
              description: 'Количество голосов',
              example: 50
            }
          }
        },
        CreateRule: {
          type: 'object',
          required: ['title', 'userId', 'userName'],
          properties: {
            title: {
              type: 'string',
              minLength: 3,
              maxLength: 200,
              description: 'Название правила (3-200 символов)',
              example: 'Новое правило'
            },
            description: {
              type: 'string',
              maxLength: 1000,
              description: 'Описание правила (макс 1000 символов)',
              example: 'Детальное описание правила'
            },
            userId: {
              type: 'integer',
              description: 'ID пользователя',
              example: 123456
            },
            userName: {
              type: 'string',
              description: 'Имя пользователя',
              example: 'Иван'
            }
          }
        },
        Vote: {
          type: 'object',
          required: ['userId', 'value'],
          properties: {
            userId: {
              type: 'integer',
              description: 'ID пользователя',
              example: 123456
            },
            userName: {
              type: 'string',
              description: 'Имя пользователя',
              example: 'Иван'
            },
            value: {
              type: 'integer',
              enum: [1, -1],
              description: '1 = за, -1 = против',
              example: 1
            }
          }
        },
        VoteResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            rating: {
              type: 'integer',
              description: 'Обновленный рейтинг',
              example: 43
            },
            votesCount: {
              type: 'integer',
              description: 'Общее количество голосов',
              example: 51
            }
          }
        },
        Stats: {
          type: 'object',
          properties: {
            totalRules: {
              type: 'integer',
              example: 100
            },
            totalUsers: {
              type: 'integer',
              example: 250
            },
            totalVotes: {
              type: 'integer',
              example: 500
            },
            positiveVotes: {
              type: 'integer',
              example: 350
            },
            negativeVotes: {
              type: 'integer',
              example: 150
            },
            topRule: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                title: { type: 'string' },
                rating: { type: 'integer' }
              }
            },
            avgVotesPerRule: {
              type: 'string',
              example: '5.00'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Ошибка при выполнении запроса'
            }
          }
        }
      }
    }
  },
  apis: ['./src/server.swagger.js'] // Путь к файлу с аннотациями
};

module.exports = swaggerJsdoc(options);
