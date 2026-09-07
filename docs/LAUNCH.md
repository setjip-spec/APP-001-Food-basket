# APP-001 — как запускать

## 1. Пользовательский запуск

После первичной настройки GitHub Pages приложение открывается по одной ссылке:

**https://setjip-spec.github.io/APP-001-Food-basket/**

Эту ссылку используем как основную. Прямая Apps Script `/exec`-ссылка остаётся технической резервной ссылкой.

## 2. Что нужно сделать один раз прямо сейчас

На GitHub:

1. Открыть `setjip-spec/APP-001-Food-basket`.
2. Нажать **Settings**.
3. Слева открыть **Pages**.
4. В `Build and deployment`:
   - Source → **Deploy from a branch**;
   - Branch → **main**;
   - Folder → **/(root)**.
5. Нажать **Save**.
6. Подождать публикацию.
7. Нажать **Visit site** или открыть `https://setjip-spec.github.io/APP-001-Food-basket/`.

В корне репозитория уже есть `index.html` и `.nojekyll`.

## 3. Почему приложение всё ещё использует Google

GitHub Pages сейчас является удобной постоянной точкой запуска.

Само приложение v1.0 продолжает выполнять серверные функции в Google Apps Script, потому что там уже работает связка с Google Sheets DATA.

Схема:

`GitHub Pages → Apps Script Web App → Google Sheets`

## 4. Как запускать после будущих изменений

### Если изменился только корневой GitHub Pages launcher

После попадания изменения в `main` GitHub Pages публикует его автоматически.

### Если изменился код приложения в `src/`

Пока не настроен автоматический `clasp` deployment, Apps Script нужно синхронизировать отдельно. Но исходником всегда остаётся GitHub — нельзя делать постоянную правку только в Apps Script Editor.

## 5. Следующий инфраструктурный шаг

Привязать существующий Google Apps Script проект к этому репозиторию через `clasp` и затем GitHub Actions.

После этого целевая схема будет:

`изменение GitHub → проверки → main → автоматический push в Apps Script → GitHub Pages открывает обновлённую версию`.

Для привязки потребуется **Script ID** существующего Apps Script-проекта (`Apps Script → Project Settings → Script ID`). Это не `/exec` URL и не Deployment ID.

## 6. Аварийный запуск

Если GitHub Pages временно не работает, приложение можно открыть напрямую:

https://script.google.com/macros/s/AKfycbxBqlHi4S8A4WufIBkmw5dYv_OB_FpJqbQmATJNTUsiQGFKYTmNASpwzfolc6XN0si9/exec
