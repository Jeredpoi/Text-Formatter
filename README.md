# TFExtra — BetterDiscord Plugin

> Расширяет панель форматирования Discord: ANSI-цвета, заголовки, списки, гиперссылки и многое другое.

## Скачать

**[Скачать TF.plugin.js (последняя версия)](https://raw.githubusercontent.com/Jeredpoi/Text-Formatter/claude/fix-formatting-plugin-bugs-mkalO/TF.plugin.js)**

## Установка

1. Скачай файл `TF.plugin.js` по ссылке выше
2. Положи его в папку плагинов BetterDiscord:
   - **Windows:** `%APPDATA%\BetterDiscord\plugins\`
   - **Linux:** `~/.config/BetterDiscord/plugins/`
   - **macOS:** `~/Library/Application Support/BetterDiscord/plugins/`
3. В Discord: **Настройки → BetterDiscord → Plugins** → включи **TFExtra**

## Возможности

### Форматирование текста
| Кнопка | Действие | Горячая клавиша |
|--------|----------|-----------------|
| <u>U</u> | Подчёркивание | `Ctrl+Shift+U` |
| H1 / H2 / H3 | Заголовки | `Ctrl+Shift+1/2/3` |
| -# | Маленький текст | — |
| • | Список | — |
| 1. | Нумерованный список | — |
| `</>` | Код-блок | `Ctrl+Shift+K` |
| 🔗 | Гиперссылка `[текст](url)` | `Ctrl+Shift+L` |
| ✕fmt | Очистить всё форматирование | — |

### ANSI-цвета (только в code-block)
- **Цвет текста:** красный, зелёный, жёлтый, синий, пурпурный, циан, белый
- **Цвет фона:** те же цвета (квадратные свотчи)
- Кнопка **✕** — убрать ANSI-окраску с выделенного текста

## Версия

**5.1.3** — исправления багов + отладочные логи (открываются в DevTools: `Ctrl+Shift+I` → Console → фильтр `TFExtra`)

## Требования

- [BetterDiscord](https://betterdiscord.app/)
