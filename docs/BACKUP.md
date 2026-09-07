# APP-001 — Google BACKUP SAFE

Google Drive используется как независимый аварийный резерв APP-001.

## Папка

`03 MINI APPS — BACKUP SAFE / APP-001 — Food basket`

Текущий backup-контур:

https://drive.google.com/drive/folders/1UNEywMhCmrgZZDATxVtd5R3had_9gVDV

## Когда делать snapshot

Обязательно:

- при фиксации stable/milestone версии;
- перед destructive-изменением DATA;
- перед крупной миграцией backend/runtime;
- после аварийного восстановления.

## Что хранить

Минимум:

1. копию Google Sheets DATA;
2. копию актуального ТЗ;
3. резерв исходников/ключевых исходников;
4. BACKUP MANIFEST с APP-ID, версией, датой, GitHub URL и live URL.

## Восстановление

1. Сначала использовать Git history / revert.
2. Если GitHub недоступен или повреждён — использовать Google BACKUP SAFE.
3. DATA snapshot нельзя бездумно подменять рабочей таблицей: он может быть старее текущих пользовательских данных.
4. После восстановления сделать новый snapshot и описать причину.

## Первый snapshot

Создан `v1.0 — 2026-09-07` при переходе мастерской на GitHub-first разработку.
