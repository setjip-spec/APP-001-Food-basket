# APP-001 — Food basket

Продуктовая корзина для домашнего учёта запасов и регулярных закупок.

## Статус

- Версия функционала: **v1.0**
- Статус: **НА ДОРАБОТКЕ — инфраструктурная миграция**
- Канонический код и ТЗ: **GitHub / main**
- Пользовательский запуск: **GitHub Pages only**
- Google: **DATA / BACKUP SAFE / recovery only**

## Основные ссылки

- Репозиторий: https://github.com/setjip-spec/APP-001-Food-basket
- Live: https://setjip-spec.github.io/APP-001-Food-basket/
- ТЗ: https://github.com/setjip-spec/APP-001-Food-basket/blob/main/docs/APP-001-TZ.md
- Links map: https://github.com/setjip-spec/APP-001-Food-basket/blob/main/docs/LINKS.md
- Google BACKUP SAFE: https://drive.google.com/drive/folders/1UNEywMhCmrgZZDATxVtd5R3had_9gVDV
- Legacy DATA Sheet: https://docs.google.com/spreadsheets/d/124tsSSYjG0Cax61MXlH1ZVuz4JfNt0Zjxx34BM4VRok/edit

## Новый стандарт мастерской

Пользовательский Web App больше не должен зависеть от Google Apps Script Web App. Целевая схема:

```text
GitHub main
   ↓
GitHub Pages
   ↓
browser runtime
   ↓
LOCAL DATA или отдельный cloud data/backend при необходимости
```

Google Drive / Sheets остаются только независимым хранилищем данных, резервов и recovery-копий.

## Важно про текущую APP-001

Текущий `index.html` ещё является legacy launcher и открывает старую Apps Script-версию. Поэтому live URL уже правильный, но внутренняя архитектура ещё не полностью соответствует новому регламенту.

Следующий обязательный шаг: убрать Apps Script iframe/runtime и перенести APP-001 в самостоятельный GitHub Pages frontend.

Перед миграцией нужно выбрать DATA MODE:

- **LOCAL** — IndexedDB/localStorage + JSON export/import. Самый быстрый и простой вариант для одного пользователя/устройства.
- **CLOUD DATA** — если нужна синхронизация между ПК/телефоном; GitHub Pages остаётся frontend, а данные живут во внешнем API/хранилище.

## Как теперь разрабатывать

1. Любая новая логика сначала фиксируется в `docs/APP-001-TZ.md`.
2. Код меняется только в GitHub.
3. `main` — канон.
4. После попадания static frontend в `main` GitHub Pages публикует его.
5. Для рискованных изменений используется ветка + Pull Request.
6. Stable/milestone версия получает Google BACKUP SAFE snapshot.
7. Live URL, GitHub URL и backup всегда фиксируются в `docs/LINKS.md` и общем REGISTRY.

## Структура

```text
APP-001-Food-basket/
├─ index.html
├─ .nojekyll
├─ src/                       # текущие/legacy исходники до миграции
├─ docs/
│  ├─ APP-001-TZ.md
│  ├─ LINKS.md
│  ├─ LAUNCH.md
│  └─ BACKUP.md
├─ .github/workflows/
└─ README.md
```

## Backup

Google не является рабочим местом разработки. Он нужен как вторая независимая линия защиты, чтобы при потере/удалении GitHub можно было пересоздать репозиторий, вернуть ТЗ и восстановить DATA.
