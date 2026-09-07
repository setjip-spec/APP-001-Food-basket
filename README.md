# APP-001 — Food basket

Продуктовая корзина для домашнего учёта запасов и регулярных закупок.

## Статус

- Версия приложения: **v1.0**
- GitHub: **основное рабочее место исходного кода APP-001**
- Runtime: **Google Apps Script Web App**
- Backend данных: **Google Sheets**

GitHub используется для истории изменений, веток, pull request и хранения актуального исходного кода. Google Apps Script остаётся средой выполнения, а Google Sheets — базой данных.

## Структура

```text
APP-001-Food-basket/
├─ src/
│  ├─ Code.gs
│  └─ Index.html
├─ docs/
│  └─ APP-001-TZ.md
├─ .github/workflows/
│  └─ validate.yml
├─ appsscript.json
├─ .clasp.json.example
└─ README.md
```

## Архитектура

```text
GitHub (канонический код)
        ↓
Google Apps Script Web App
        ↓
Google Sheets DATA
```

## Правило разработки

1. Все новые изменения исходников сначала делаются в GitHub.
2. Значимые изменения — отдельной веткой и pull request.
3. После проверки изменения попадают в `main`.
4. `main` считается актуальным кодом для развёртывания в Apps Script.
5. Google Docs-копии кода больше не являются основным источником истины.

## Данные

Пользовательские данные и история покупок остаются в Google Sheets. В GitHub хранятся код и документация приложения.
