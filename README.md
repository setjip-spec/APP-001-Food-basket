# APP-001 — Food basket

Продуктовая корзина для домашнего учёта запасов и регулярных закупок.

## Статус

- Версия: **v1.0**
- Канонический код: **GitHub / main**
- Пользовательский запуск: **GitHub Pages**
- Backend/runtime: **Google Apps Script Web App**
- DATA: **Google Sheets**
- Аварийный резерв: **Google Drive / 03 MINI APPS — BACKUP SAFE**

## Запуск

Целевая пользовательская ссылка:

**https://setjip-spec.github.io/APP-001-Food-basket/**

В текущей архитектуре GitHub Pages работает как постоянная точка входа и открывает рабочий Google Apps Script Web App в полноэкранном iframe.

Схема:

```text
GitHub main
   ↓
GitHub Pages
   ↓
Google Apps Script Web App
   ↓
Google Sheets DATA
```

### Первичная настройка GitHub Pages — один раз

1. Открыть репозиторий.
2. `Settings` → `Pages`.
3. `Build and deployment` → `Source` → **Deploy from a branch**.
4. Branch → **main**.
5. Folder → **/(root)**.
6. `Save`.
7. Подождать публикацию и открыть `Visit site`.

В корне уже лежат `index.html` и `.nojekyll`, поэтому после включения Pages URL должен стать рабочим.

## Как теперь разрабатывать

1. Все изменения кода делаются в этом GitHub-репозитории.
2. Актуальный код находится в `main`.
3. Значимые изменения лучше делать отдельной веткой и через Pull Request.
4. Если меняется только GitHub Pages launcher/static-часть — публикация Pages обновляется автоматически после `main`.
5. Если меняется backend Apps Script — изменения сначала делаются в GitHub, затем синхронизируются с существующим Apps Script-проектом.
6. После проверки milestone создаётся Google BACKUP SAFE snapshot.

Нельзя считать правку завершённой, если она осталась только в Google Apps Script Editor и не попала обратно в GitHub.

## Структура

```text
APP-001-Food-basket/
├─ index.html                 # GitHub Pages launcher
├─ .nojekyll                  # direct static publishing
├─ src/
│  ├─ 01_Server.gs ...        # Apps Script backend, модульно
│  ├─ Index.html              # Apps Script HTML entry
│  ├─ Body*.html
│  ├─ Style*.html
│  └─ Script*.html
├─ docs/
│  └─ APP-001-TZ.md           # актуальное ТЗ
├─ .github/workflows/
│  └─ validate.yml
├─ appsscript.json
├─ .clasp.json.example
└─ README.md
```

## Google BACKUP SAFE

Google Drive теперь не является местом ежедневной разработки. Он используется как независимый аварийный резерв.

Для стабильных версий сохраняются:

- копия DATA;
- копия ТЗ;
- резерв ключевых исходников / snapshot;
- BACKUP MANIFEST с версией, датой, GitHub URL и инструкцией восстановления.

Порядок восстановления: сначала Git history/revert, затем Google BACKUP SAFE.

## Важно про Apps Script

Сейчас GitHub Pages даёт удобную пользовательскую ссылку, но backend всё ещё выполняется в Google Apps Script. Чтобы будущие изменения backend автоматически попадали в Google без ручного копирования, следующим инфраструктурным шагом будет привязка существующего Apps Script проекта через `clasp`/GitHub Actions.
