# APP-001 — Food basket

Продуктовая корзина для домашнего учёта запасов и регулярных закупок.

## Статус

- Версия функционала: **v1.0**
- Статус: **ТЕСТИРУЕТСЯ — GitHub Pages + Supabase**
- Канонический код и ТЗ: **GitHub / main**
- Пользовательский запуск: **GitHub Pages only**
- Cloud DATA: **Supabase / MINI-APPS-CLOUD**
- Google: **BACKUP SAFE / recovery / legacy export only**

## Основные ссылки

- Репозиторий: https://github.com/setjip-spec/APP-001-Food-basket
- Live: https://setjip-spec.github.io/APP-001-Food-basket/
- ТЗ: https://github.com/setjip-spec/APP-001-Food-basket/blob/main/docs/APP-001-TZ.md
- Links map: https://github.com/setjip-spec/APP-001-Food-basket/blob/main/docs/LINKS.md
- Google BACKUP SAFE: https://drive.google.com/drive/folders/1UNEywMhCmrgZZDATxVtd5R3had_9gVDV
- Legacy DATA Sheet: https://docs.google.com/spreadsheets/d/124tsSSYjG0Cax61MXlH1ZVuz4JfNt0Zjxx34BM4VRok/edit

## Текущая архитектура

APP-001 больше не использует Google Apps Script Web App как пользовательский runtime.

```text
GitHub main
   ↓
GitHub Pages
   ↓
HTML / CSS / JavaScript в браузере
   ↓
Supabase Auth + Postgres JSON state
```

Google Sheets, старый Apps Script и папка старых исходников сохраняются только как legacy/recovery до завершения проверки миграции.

## Облачные данные

Проект Supabase: **MINI-APPS-CLOUD**.

APP-001 хранит состояние пользователя в общей облачной схеме мастерской:

- `mini_app_state` — текущее состояние приложения по `user_id + app_id`;
- `mini_app_backups` — облачные snapshots важных состояний;
- `app_id = APP-001` отделяет продуктовую корзину от будущих APP-002, APP-003 и далее;
- Row Level Security разрешает авторизованному пользователю читать и менять только свои строки.

В браузере используется только publishable key. Secret/service-role ключи во frontend и GitHub не используются.

## Скорость работы

Сортировки, фильтры, изменение количества, цены, собранности и другие действия черновика выполняются локально сразу. Сеть не должна блокировать каждое нажатие.

`Сохранить корзину` отправляет корзину в Supabase одной операцией. Остальные явные действия сохранения также отправляют текущее состояние в облако напрямую, без Google Sheets и Apps Script.

Для защиты от одновременного редактирования на двух устройствах используется номер ревизии. Если облачная версия изменилась на другом устройстве, приложение не должно молча перетирать её.

## Миграция из Google

На 2026-09-07 состояние APP-001 перенесено из legacy Google Sheets в Supabase:

- 37 продуктов;
- 25 записей цен;
- 4 текущие позиции корзины;
- 1 покупка;
- 25 позиций истории покупки;
- актуальные настройки и категории.

Перед миграцией создан recovery-контур Google BACKUP SAFE. В Supabase также создан migration snapshot.

## Как теперь разрабатывать

1. Новая логика фиксируется в ТЗ.
2. Код меняется только в GitHub.
3. `main` — каноническая версия.
4. GitHub Pages автоматически публикует изменения `main`.
5. Supabase используется как cloud DATA/Auth, а не как место хранения frontend-кода.
6. Для рискованных изменений предпочтительна отдельная ветка + Pull Request.
7. Stable/milestone версия получает Google BACKUP SAFE snapshot.
8. Live URL, GitHub URL, cloud DATA и backup фиксируются в `docs/LINKS.md` и общем REGISTRY.

## Структура

```text
APP-001-Food-basket/
├─ index.html                 # GitHub Pages entry point
├─ cloud-backend.js           # Supabase/Auth/data adapter
├─ .nojekyll
├─ src/                       # UI partials + legacy Apps Script recovery source
├─ docs/
│  ├─ APP-001-TZ.md
│  ├─ LINKS.md
│  ├─ LAUNCH.md
│  └─ BACKUP.md
├─ .github/workflows/
└─ README.md
```

## Критерий завершения миграции

Статус `РАБОЧИЙ` ставится только после пользовательской проверки на реальной GitHub Pages-ссылке: вход → загрузка данных → редактирование → сохранение → повторный вход/перезагрузка → корзина → покупка → история → проверка тех же данных на втором устройстве.
