const API_URL = '/api';

// Генерируем уникальный числовой ID пользователя для веба
let userId = localStorage.getItem('userId');
if (!userId) {
    // Генерируем большое число из timestamp и случайного числа
    userId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    localStorage.setItem('userId', userId.toString());
}

// Экранирование HTML для защиты от XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Валидация правила на клиенте
function validateRuleClient(title, description) {
    const errors = [];

    if (!title || title.trim().length < 3) {
        errors.push('Название правила должно быть не менее 3 символов');
    } else if (title.length > 200) {
        errors.push('Название правила не должно превышать 200 символов');
    }

    if (description && description.length > 1000) {
        errors.push('Описание не должно превышать 1000 символов');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

// Переключение вкладок
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        // Обновляем активные кнопки
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Обновляем активные вкладки
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // Загружаем данные для вкладки
        if (tabName === 'all') {
            loadAllRules();
        } else if (tabName === 'top') {
            loadTopRules();
        }
    });
});

// Debounce функция для поиска
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Поиск
const searchInput = document.getElementById('search-input');
const debouncedSearch = debounce((searchQuery, sortBy) => {
    loadAllRules(sortBy, searchQuery);
}, 300);

searchInput.addEventListener('input', (e) => {
    const sortBy = document.getElementById('sort-select').value;
    debouncedSearch(e.target.value, sortBy);
});

// Сортировка
document.getElementById('sort-select').addEventListener('change', (e) => {
    const searchQuery = document.getElementById('search-input').value;
    loadAllRules(e.target.value, searchQuery);
});

// Загрузка всех правил
async function loadAllRules(sortBy = 'rating', searchQuery = '') {
    const rulesList = document.getElementById('rules-list');
    rulesList.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const params = new URLSearchParams({
            sortBy,
            limit: 100,
            ...(searchQuery && { search: searchQuery })
        });

        const response = await fetch(`${API_URL}/rules?${params}`);
        const data = await response.json();
        const rules = data.rules || data; // Обратная совместимость

        if (rules.length === 0) {
            rulesList.innerHTML = searchQuery
                ? '<p class="loading">Ничего не найдено. Попробуйте другой запрос.</p>'
                : '<p class="loading">Пока нет правил. Создайте первое!</p>';
            return;
        }

        rulesList.innerHTML = rules.map(rule => createRuleCard(rule)).join('');
        attachVoteListeners();
    } catch (error) {
        console.error('Error loading rules:', error);
        rulesList.innerHTML = '<p class="loading">Ошибка загрузки правил</p>';
    }
}

// Загрузка топ правил
async function loadTopRules() {
    const topRulesList = document.getElementById('top-rules-list');
    topRulesList.innerHTML = '<div class="loading">Загрузка...</div>';

    try {
        const response = await fetch(`${API_URL}/rules/top/10`);
        const rules = await response.json();

        if (rules.length === 0) {
            topRulesList.innerHTML = '<p class="loading">Пока нет правил. Создайте первое!</p>';
            return;
        }

        topRulesList.innerHTML = rules.map((rule, index) =>
            createRuleCard(rule, index + 1)
        ).join('');
        attachVoteListeners();
    } catch (error) {
        console.error('Error loading top rules:', error);
        topRulesList.innerHTML = '<p class="loading">Ошибка загрузки топ правил</p>';
    }
}

// Создание карточки правила
function createRuleCard(rule, position = null) {
    const ratingClass = rule.rating > 0 ? 'positive' : rule.rating < 0 ? 'negative' : 'neutral';
    const ratingEmoji = rule.rating > 0 ? '🔥' : rule.rating < 0 ? '❄️' : '⚖️';
    const positionBadge = position ? `<span class="top-position">${position}</span>` : '';

    // Экранируем пользовательский контент для защиты от XSS
    const safeTitle = escapeHtml(rule.title);
    const safeDescription = escapeHtml(rule.description);
    const safeAuthor = escapeHtml(rule.author);

    return `
        <div class="rule-card" data-rule-id="${rule.id}">
            <div class="rule-header">
                <div class="rule-title">
                    ${positionBadge}${safeTitle}
                </div>
                <div class="rule-rating ${ratingClass}">
                    ${ratingEmoji} ${rule.rating}
                </div>
            </div>
            ${rule.description ? `<div class="rule-description">${safeDescription}</div>` : ''}
            <div class="rule-meta">
                <span>👤 ${safeAuthor}</span>
                <span>📊 ${rule.votesCount} голосов</span>
            </div>
            <div class="vote-buttons">
                <button class="vote-btn upvote" data-rule-id="${rule.id}" data-vote="1">
                    👍 Согласен
                </button>
                <button class="vote-btn downvote" data-rule-id="${rule.id}" data-vote="-1">
                    👎 Не согласен
                </button>
            </div>
        </div>
    `;
}

// Прикрепление обработчиков голосования
function attachVoteListeners() {
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', handleVote);
    });
}

// Обработка голосования
async function handleVote(e) {
    const button = e.currentTarget;
    const ruleId = button.dataset.ruleId;
    const value = parseInt(button.dataset.vote);

    const userName = localStorage.getItem('userName') || prompt('Введите ваше имя:');
    if (userName && !localStorage.getItem('userName')) {
        localStorage.setItem('userName', userName);
    }

    if (!userName) return;

    try {
        const response = await fetch(`${API_URL}/rules/${ruleId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                userName: userName,
                value: value
            })
        });

        const result = await response.json();

        if (result.success) {
            // Обновляем отображение рейтинга
            const ruleCard = button.closest('.rule-card');
            const ratingDiv = ruleCard.querySelector('.rule-rating');
            const votesSpan = ruleCard.querySelector('.rule-meta span:last-child');

            // Обновляем рейтинг
            ratingDiv.textContent = `${result.rating > 0 ? '🔥' : result.rating < 0 ? '❄️' : '⚖️'} ${result.rating}`;
            ratingDiv.className = `rule-rating ${result.rating > 0 ? 'positive' : result.rating < 0 ? 'negative' : 'neutral'}`;

            // Обновляем количество голосов
            votesSpan.textContent = `📊 ${result.votesCount} голосов`;

            // Визуальная обратная связь
            button.style.transform = 'scale(0.95)';
            setTimeout(() => {
                button.style.transform = '';
            }, 200);
        }
    } catch (error) {
        console.error('Error voting:', error);
        alert('Ошибка при голосовании');
    }
}

// Создание правила
document.getElementById('create-rule-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userName = document.getElementById('user-name').value.trim();
    const title = document.getElementById('rule-title').value.trim();
    const description = document.getElementById('rule-description').value.trim();
    const messageDiv = document.getElementById('create-message');

    // Валидация имени пользователя
    if (!userName || userName.length < 2) {
        messageDiv.className = 'message error';
        messageDiv.textContent = '❌ Имя должно содержать не менее 2 символов';
        return;
    }

    // Валидация правила
    const validation = validateRuleClient(title, description);
    if (!validation.isValid) {
        messageDiv.className = 'message error';
        messageDiv.textContent = '❌ ' + validation.errors.join(', ');
        return;
    }

    // Сохраняем имя пользователя
    localStorage.setItem('userName', userName);

    try {
        const response = await fetch(`${API_URL}/rules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                userName: userName,
                title: title,
                description: description
            })
        });

        const result = await response.json();

        if (response.ok) {
            messageDiv.className = 'message success';
            messageDiv.textContent = '✅ Правило успешно создано!';

            // Очищаем форму
            document.getElementById('rule-title').value = '';
            document.getElementById('rule-description').value = '';

            // Через 2 секунды переключаемся на вкладку "Все правила"
            setTimeout(() => {
                document.querySelector('[data-tab="all"]').click();
                messageDiv.style.display = 'none';
            }, 2000);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error creating rule:', error);
        messageDiv.className = 'message error';
        messageDiv.textContent = '❌ Ошибка при создании правила';
    }
});

// Автозаполнение имени из localStorage
window.addEventListener('load', () => {
    const savedName = localStorage.getItem('userName');
    if (savedName) {
        document.getElementById('user-name').value = savedName;
    }

    // Загружаем правила при первой загрузке
    loadAllRules();
});
