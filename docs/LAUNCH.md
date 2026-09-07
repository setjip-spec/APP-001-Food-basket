# APP-001 — запуск

## Основной пользовательский URL

**https://setjip-spec.github.io/APP-001-Food-basket/**

Это единственная штатная пользовательская ссылка APP-001.

## Новый стандарт запуска

APP-001 должна запускаться непосредственно как GitHub Pages Web App.

Google Apps Script Web App больше не используется как штатный runtime, iframe или резервный пользовательский запуск.

Целевая схема:

`GitHub main → GitHub Pages → browser runtime → DATA layer`

## Первичная настройка Pages

Для нового репозитория один раз:

1. Repository → `Settings`.
2. `Pages`.
3. `Build and deployment` → `Deploy from a branch`.
4. Branch → `main`.
5. Folder → `/(root)` если `index.html` лежит в корне.
6. `Save`.
7. После публикации открыть `Visit site`.

После этого обычные static-изменения, попавшие в `main`, публикуются через GitHub Pages.

## Если проекту нужна сборка

Для Vite/React/TypeScript или другого build-процесса использовать GitHub Actions Pages deployment. Пользовательский URL остаётся GitHub Pages.

## DATA

GitHub Pages не является базой данных. Перед реализацией выбирается DATA MODE:

- `LOCAL`: IndexedDB/localStorage + JSON export/import;
- `CLOUD DATA`: внешний API/облачное хранилище для синхронизации между устройствами;
- `EXTERNAL BACKEND`: отдельный backend, если нужны секреты, серверная логика, auth или интеграции.

Google Sheets/Drive можно использовать как DATA/recovery-хранилище только отдельным безопасным способом; Google Apps Script Web App не используется.

## Текущая миграция APP-001

На момент принятия нового регламента корневой `index.html` ещё открывает legacy Apps Script через iframe. Это временная несовместимость.

Чтобы APP-001 считалась полностью переведённой на новый стандарт, нужно:

1. перенести UI и бизнес-логику в самостоятельный GitHub Pages frontend;
2. выбрать DATA MODE;
3. перенести/импортировать текущие данные;
4. убрать Apps Script iframe/runtime;
5. проверить полный пользовательский цикл;
6. создать новый Google BACKUP SAFE snapshot.
