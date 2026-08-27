/**
 * @name TFExtra
 * @description Встраивает подчёркивание, заголовки, списки, код-блок, гиперссылку, сброс форматирования и 14 ANSI-цветов прямо в нативный попап форматирования Discord.
 * @version 6.0.0
 * @author TF / Zerebos base
 */

/*@cc_on
@if (@_jscript)
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    shell.Popup("It looks like you've mistakenly tried to run me directly.\n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\nAre you sure it's even installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();
@else@*/

// BetterDiscord 1.14+ API. Типы: npm i -D @betterdiscord/types
const { DOM, ReactUtils, Webpack, Logger, Data, UI } = BdApi;
const PLUGIN_NAME = "TFExtra";
const VERSION     = "6.0.0";

// Попап форматирования Discord при выделении текста использует класс buttons_XXXXX
// Но такой же класс есть и в панели снизу — различаем по наличию нативных кнопок Discord внутри
const TOOLBAR_SEL = '[class*="buttons_"]';

const ANSI = {
    // Цвет текста
    ansiRed:       ["```ansi\n\u001b[1;31m", "\u001b[0m\n```"],
    ansiGreen:     ["```ansi\n\u001b[1;32m", "\u001b[0m\n```"],
    ansiYellow:    ["```ansi\n\u001b[1;33m", "\u001b[0m\n```"],
    ansiBlue:      ["```ansi\n\u001b[1;34m", "\u001b[0m\n```"],
    ansiMagenta:   ["```ansi\n\u001b[1;35m", "\u001b[0m\n```"],
    ansiCyan:      ["```ansi\n\u001b[1;36m", "\u001b[0m\n```"],
    ansiWhite:     ["```ansi\n\u001b[1;37m", "\u001b[0m\n```"],
    // Цвет фона
    ansiBgRed:     ["```ansi\n\u001b[41m", "\u001b[0m\n```"],
    ansiBgGreen:   ["```ansi\n\u001b[42m", "\u001b[0m\n```"],
    ansiBgYellow:  ["```ansi\n\u001b[43m", "\u001b[0m\n```"],
    ansiBgBlue:    ["```ansi\n\u001b[44m", "\u001b[0m\n```"],
    ansiBgMagenta: ["```ansi\n\u001b[45m", "\u001b[0m\n```"],
    ansiBgCyan:    ["```ansi\n\u001b[46m", "\u001b[0m\n```"],
    ansiBgWhite:   ["```ansi\n\u001b[47m", "\u001b[0m\n```"],
};

// Матчит и fg (1;31) и bg (41) коды
const ANSI_RE = () => /```ansi\n\u001b\[(?:\d+;)*\d+m([\s\S]*?)\u001b\[0m\n```/g;

// Группы для панели настроек
const GROUPS = [
    { id: "inline", name: "Инлайн-форматирование" },
    { id: "block",  name: "Блочное форматирование" },
    { id: "utils",  name: "Утилиты" },
    { id: "ansiFg", name: "ANSI — цвет текста" },
    { id: "ansiBg", name: "ANSI — цвет фона" },
];

// hotkey.code — физическая клавиша (KeyboardEvent.code). Обязательна для цифр и
// нелатинских раскладок: на Shift+1 браузер отдаёт e.key="!", на кириллице e.key="Г".
const BTNS = [
    // ── Инлайн-форматирование ──────────────────────────────────────────────
    { id:"underline",  group:"inline", type:"wrap",  wrap:["__","__"],       label:"U̲", labelStyle:"text-decoration:underline;font-weight:700;font-size:13px;",                   title:"Подчёркивание",           hotkey:{ctrl:true,shift:true,key:"U",code:"KeyU"}, defaultVisible:true },
    // ── Блочное форматирование ─────────────────────────────────────────────
    { id:"h1",         group:"block",  type:"lineprefix", prefix:"# ",       label:"H1",      labelStyle:"font-size:11px;font-weight:700;",                                              title:"Заголовок 1",             hotkey:{ctrl:true,shift:true,key:"1",code:"Digit1"}, defaultVisible:true },
    { id:"h2",         group:"block",  type:"lineprefix", prefix:"## ",      label:"H2",      labelStyle:"font-size:11px;font-weight:700;",                                              title:"Заголовок 2",             hotkey:{ctrl:true,shift:true,key:"2",code:"Digit2"}, defaultVisible:true },
    { id:"h3",         group:"block",  type:"lineprefix", prefix:"### ",     label:"H3",      labelStyle:"font-size:11px;font-weight:700;",                                              title:"Заголовок 3",             hotkey:{ctrl:true,shift:true,key:"3",code:"Digit3"}, defaultVisible:true },
    { id:"smallText",  group:"block",  type:"lineprefix", prefix:"-# ",      label:"-#",      labelStyle:"font-size:11px;font-weight:700;",                                              title:"Маленький текст",         hotkey:null,                                        defaultVisible:true },
    { id:"list",       group:"block",  type:"lineprefix", prefix:"- ",       label:"•",       labelStyle:"font-size:14px;font-weight:700;",                                              title:"Список",                  hotkey:null,                                        defaultVisible:true },
    { id:"numList",    group:"block",  type:"numbered",                      label:"1.",      labelStyle:"font-size:12px;font-weight:700;",                                              title:"Нумерованный список",     hotkey:null,                                        defaultVisible:true },
    { id:"codeblock",  group:"block",  type:"wrap",  wrap:["```\n","\n```"], label:"</>",     labelStyle:"font-family:monospace;font-weight:700;font-size:11px;letter-spacing:-0.5px;", title:"Код-блок",                hotkey:{ctrl:true,shift:true,key:"K",code:"KeyK"},  defaultVisible:true },
    // ── Утилиты ────────────────────────────────────────────────────────────
    { id:"hyperlink",  group:"utils",  type:"link",                          label:"🔗",      labelStyle:"font-size:13px;",                                                              title:"Гиперссылка",             hotkey:{ctrl:true,shift:true,key:"L",code:"KeyL"},  defaultVisible:true },
    { id:"clearAll",   group:"utils",  type:"clearall",                      label:"✕fmt",    labelStyle:"font-size:10px;font-weight:700;opacity:0.8;",                                  title:"Очистить форматирование", hotkey:null,                                        defaultVisible:true },
    // ── ANSI цвет текста (круглые свотчи) ─────────────────────────────────
    { id:"ansiRed",     group:"ansiFg", type:"ansi", swatch:"#ed4245",                                          title:"Текст: Красный",   hotkey:null, defaultVisible:true },
    { id:"ansiGreen",   group:"ansiFg", type:"ansi", swatch:"#57f287",                                          title:"Текст: Зелёный",   hotkey:null, defaultVisible:true },
    { id:"ansiYellow",  group:"ansiFg", type:"ansi", swatch:"#faa61a",                                          title:"Текст: Жёлтый",    hotkey:null, defaultVisible:true },
    { id:"ansiBlue",    group:"ansiFg", type:"ansi", swatch:"#5865f2",                                          title:"Текст: Синий",     hotkey:null, defaultVisible:true },
    { id:"ansiMagenta", group:"ansiFg", type:"ansi", swatch:"#c678dd",                                          title:"Текст: Пурпурный", hotkey:null, defaultVisible:true },
    { id:"ansiCyan",    group:"ansiFg", type:"ansi", swatch:"#56b6c2",                                          title:"Текст: Циан",      hotkey:null, defaultVisible:true },
    { id:"ansiWhite",   group:"ansiFg", type:"ansi", swatch:"#dce0e8", swatchBorder:"rgba(255,255,255,0.45)",   title:"Текст: Белый",     hotkey:null, defaultVisible:true },
    { id:"ansiReset",   group:"ansiFg", type:"reset", label:"✕", labelStyle:"font-size:12px;font-weight:700;opacity:0.7;", title:"Убрать ANSI", hotkey:null, defaultVisible:true },
    // ── ANSI цвет фона (квадратные свотчи) ────────────────────────────────
    { id:"ansiBgRed",     group:"ansiBg", type:"ansi", swatch:"#c0392b", square:true,                                        title:"Фон: Красный",   hotkey:null, defaultVisible:true },
    { id:"ansiBgGreen",   group:"ansiBg", type:"ansi", swatch:"#27ae60", square:true,                                        title:"Фон: Зелёный",   hotkey:null, defaultVisible:true },
    { id:"ansiBgYellow",  group:"ansiBg", type:"ansi", swatch:"#e67e22", square:true,                                        title:"Фон: Жёлтый",    hotkey:null, defaultVisible:true },
    { id:"ansiBgBlue",    group:"ansiBg", type:"ansi", swatch:"#5865f2", square:true,                                        title:"Фон: Синий",     hotkey:null, defaultVisible:true },
    { id:"ansiBgMagenta", group:"ansiBg", type:"ansi", swatch:"#8e44ad", square:true,                                        title:"Фон: Пурпурный", hotkey:null, defaultVisible:true },
    { id:"ansiBgCyan",    group:"ansiBg", type:"ansi", swatch:"#16a085", square:true,                                        title:"Фон: Циан",      hotkey:null, defaultVisible:true },
    { id:"ansiBgWhite",   group:"ansiBg", type:"ansi", swatch:"#dce0e8", square:true, swatchBorder:"rgba(0,0,0,0.25)",       title:"Фон: Белый",     hotkey:null, defaultVisible:true },
];

const CSS = `
.tfx-sep {
    width: 1px;
    background: var(--background-modifier-accent, rgba(255,255,255,0.15));
    margin: 4px 3px;
    align-self: stretch;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
}
.tfx-btn {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 5px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--interactive-normal);
    transition: background 80ms ease, color 80ms ease, transform 80ms ease;
    position: relative;
    user-select: none;
    flex-shrink: 0;
    box-sizing: border-box;
    border: none;
    outline: none;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    line-height: 1;
}
.tfx-btn:hover { background: var(--background-modifier-hover, rgba(255,255,255,0.08)); color: var(--interactive-hover); }
.tfx-btn:active { transform: scale(0.88); }
.tfx-btn.tfx-active { background: rgba(88,101,242,0.22); color: var(--text-link, #00b0f4); }
.tfx-btn.tfx-active:hover { background: rgba(88,101,242,0.35); }
.tfx-btn.tfx-hidden { display: none !important; }
.tfx-sw {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.22);
    box-shadow: 0 1px 4px rgba(0,0,0,0.45);
    pointer-events: none;
    flex-shrink: 0;
}
.tfx-sw-sq { border-radius: 3px; }
.tfx-tip-hk { display:block; margin-top:2px; font-size:10px; opacity:0.55; font-family:monospace; }
.tfx-link-inp {
    width: 100%;
    padding: 8px 10px;
    margin-top: 8px;
    background: var(--input-background, rgba(0,0,0,0.3));
    border: 1px solid var(--input-border, rgba(255,255,255,0.15));
    border-radius: 4px;
    color: var(--text-normal, #fff);
    font-size: 14px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 150ms;
}
.tfx-link-inp:focus { border-color: #5865f2; }
`;

function defaultSettings() {
    const vis = {};
    for (const b of BTNS) vis[b.id] = b.defaultVisible;
    return { visible: vis, debugLogs: false };
}

function hkLabel(hk) {
    if (!hk) return "";
    return [hk.ctrl && "Ctrl", hk.alt && "Alt", hk.shift && "Shift", hk.key].filter(Boolean).join("+");
}

module.exports = class TFExtra {
    _snap        = null;
    settings     = defaultSettings();
    _mutObs      = null;
    _keyHandler  = null;
    _injected    = new WeakSet();
    _scanQueued  = false;
    _taClassKey  = undefined; // undefined = ещё не искали, null = не нашли

    start() {
        this._loadSettings();
        DOM.addStyle(PLUGIN_NAME, CSS);
        this._removeAllButtons();
        this._startObserver();
        this._registerHotkeys();
        Logger.info(PLUGIN_NAME, `v${VERSION} started`);
    }

    stop() {
        DOM.removeStyle(PLUGIN_NAME);
        this._mutObs?.disconnect();
        this._mutObs = null;
        if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler, true);
        this._keyHandler = null;
        this._removeAllButtons();
        this._injected = new WeakSet();
        Logger.info(PLUGIN_NAME, "stopped");
    }

    _removeAllButtons() {
        document.querySelectorAll(".tfx-sep, .tfx-btn").forEach(el => el.remove());
    }

    /** Отладочный лог. Выключен по умолчанию — иначе консоль забивается на каждый keydown. */
    _log(...args) {
        if (this.settings.debugLogs) Logger.debug(PLUGIN_NAME, ...args);
    }

    _loadSettings() {
        const s = Data.load(PLUGIN_NAME, "settings");
        const def = defaultSettings();
        if (s) {
            this.settings = {
                visible: { ...def.visible, ...s.visible },
                debugLogs: s.debugLogs === true,
            };
        }
        if (!Object.values(this.settings.visible).some(Boolean)) {
            this.settings = def;
            this._saveSettings();
        }
    }
    _saveSettings() { Data.save(PLUGIN_NAME, "settings", this.settings); }

    // ── Настройки (нативная панель BetterDiscord 1.14) ────────────────────────
    getSettingsPanel() {
        const categories = GROUPS.map(g => ({
            type: "category",
            id: g.id,
            name: g.name,
            collapsible: true,
            shown: g.id === "inline" || g.id === "block",
            settings: BTNS.filter(b => b.group === g.id).map(b => ({
                type: "switch",
                id: b.id,
                name: b.title,
                note: b.hotkey ? hkLabel(b.hotkey) : undefined,
                value: this.settings.visible[b.id] !== false,
            })),
        }));

        const settings = [
            ...categories,
            {
                type: "category",
                id: "misc",
                name: "Прочее",
                collapsible: true,
                shown: false,
                settings: [{
                    type: "switch",
                    id: "debugLogs",
                    name: "Отладочные логи",
                    note: "Подробный вывод в консоль. Включайте только для диагностики.",
                    value: this.settings.debugLogs === true,
                }],
            },
        ];

        return UI.buildSettingsPanel({
            settings,
            onChange: (_categoryId, settingId, value) => {
                if (settingId === "debugLogs") {
                    this.settings.debugLogs = value;
                } else {
                    this.settings.visible[settingId] = value;
                }
                this._saveSettings();
                this._applyVis();
            },
        });
    }

    // ── Observer ──────────────────────────────────────────────────────────────
    _startObserver() {
        // Сканирование откладывается до следующего кадра: Discord генерирует
        // сотни мутаций подряд, а попап форматирования всё равно появляется целиком.
        this._mutObs = new MutationObserver((muts) => {
            if (this._scanQueued) return;
            for (const mut of muts) {
                if (mut.addedNodes.length) { this._queueScan(); return; }
            }
        });
        this._mutObs.observe(document.body, { childList: true, subtree: true });
        this._scan();
    }

    _queueScan() {
        this._scanQueued = true;
        requestAnimationFrame(() => {
            this._scanQueued = false;
            this._scan();
        });
    }

    _scan() {
        // Попап живёт только пока есть выделение — самая дешёвая отсечка.
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        document.querySelectorAll(TOOLBAR_SEL).forEach(el => this._maybeInject(el));
    }

    _maybeInject(el) {
        // Проверяем не только WeakSet, но и наличие кнопок: Discord может
        // перерисовать содержимое контейнера, и наши кнопки исчезнут.
        if (this._injected.has(el) && el.querySelector(".tfx-btn")) return;

        const r = el.getBoundingClientRect();
        const btnCount = el.querySelectorAll("button,[role='button']").length;
        const cls = (el.className || "").toString().split(" ")[0] || "<no-class>";
        const skip = (why) => this._log(`SKIP ${cls}: ${why}`);

        // Только плавающий попап выделения, а не нижняя панель ввода.
        if (el.closest("form,[class*='channelTextArea'],[class*='textArea_']")) return skip("inside composer");
        if (btnCount < 4 || btnCount > 16) return skip("button count");
        if (!el.closest('[class*="layer"],[class*="popover"],[class*="appLayers"]')) return skip("not in layer");

        const labels = [...el.querySelectorAll("[aria-label]")].map(n => (n.getAttribute("aria-label") || "").toLowerCase());
        const hasKnownFormatting = labels.some(t =>
            t.includes("bold") || t.includes("italic") || t.includes("underline") || t.includes("strikethrough")
            || t.includes("spoiler") || t.includes("code")
        );
        const svgBtnCount = [...el.querySelectorAll("button,[role='button']")].filter(b => b.querySelector("svg")).length;
        if (!hasKnownFormatting && svgBtnCount < 3) return skip("no formatting markers");

        // Размер попапа форматирования: ~32-45px высота, 100-600px ширина
        if (r.width < 80 || r.width > 700) return skip("width range");
        if (r.height < 20 || r.height > 60) return skip("height range");
        if (el.children.length < 2) return skip("children count");

        const hasNativeBtn = el.querySelector('[aria-label]') !== null
            || el.querySelector('[class*="button_"]') !== null
            || el.querySelector('[class*="Button_"]') !== null;
        if (!hasNativeBtn) return skip("native button markers");

        if (!(window.getSelection()?.toString() ?? "").trim()) return skip("empty selection");

        this._log(`injecting into ${cls} ${Math.round(r.width)}x${Math.round(r.height)}`);
        this._injected.add(el);
        this._injectIntoDom(el);
    }

    _injectIntoDom(container) {
        const candidates = [container, ...container.querySelectorAll(":scope > *")];
        const target = candidates.reduce((best, cur) => {
            const curBtns = cur.querySelectorAll?.("button,[role='button']").length ?? 0;
            const bestBtns = best.querySelectorAll?.("button,[role='button']").length ?? 0;
            return curBtns > bestBtns ? cur : best;
        }, container);
        if (target.querySelector(".tfx-btn")) return;

        const sep = document.createElement("div");
        sep.className = "tfx-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.setAttribute("contenteditable", "false");
        target.appendChild(sep);

        for (const btn of BTNS) target.appendChild(this._mkBtn(btn));

        this._applyVis(target);
        this._refreshActive(target);
    }

    _mkBtn(btn) {
        const el = document.createElement("button");
        el.className = "tfx-btn";
        el.dataset.tfxId = btn.id;
        el.type = "button";
        el.setAttribute("aria-label", btn.title);
        el.setAttribute("contenteditable", "false");
        el.setAttribute("spellcheck", "false");
        el.setAttribute("tabindex", "-1");
        el.draggable = false;

        if (btn.swatch) {
            // Цветной свотч собирается из данных, без innerHTML.
            const sw = document.createElement("span");
            sw.className = btn.square ? "tfx-sw tfx-sw-sq" : "tfx-sw";
            sw.style.background = btn.swatch;
            if (btn.swatchBorder) sw.style.borderColor = btn.swatchBorder;
            el.appendChild(sw);
        } else {
            el.textContent = btn.label;
        }
        if (btn.labelStyle) el.style.cssText += `;${btn.labelStyle}`;

        // Нативный тултип BetterDiscord — сам следит за позицией и очищается
        // вместе с узлом, в отличие от прежнего глобального #tfx-tip.
        const tipContent = document.createElement("div");
        tipContent.append(btn.title);
        if (btn.hotkey) {
            const hk = document.createElement("span");
            hk.className = "tfx-tip-hk";
            hk.textContent = hkLabel(btn.hotkey);
            tipContent.appendChild(hk);
        }
        try {
            UI.createTooltip(el, tipContent, { side: "top" });
        } catch (err) {
            this._log(`createTooltip failed: ${err?.message}`);
        }

        const halt = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
        };
        el.addEventListener("pointerdown", (e) => { halt(e); this._saveSel(); }, true);
        el.addEventListener("mousedown", halt, true);
        el.addEventListener("mouseup", halt, true);
        el.addEventListener("click", (e) => { halt(e); this._exec(btn.id); }, true);
        el.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            halt(e);
            this._exec(btn.id);
        }, true);
        return el;
    }

    _applyVis(root) {
        const host = root ?? document.body;
        host.querySelectorAll(".tfx-btn").forEach(el => {
            el.classList.toggle("tfx-hidden", this.settings.visible[el.dataset.tfxId] === false);
        });
        const anyVisible = host === document.body
            ? BTNS.some(b => this.settings.visible[b.id] !== false)
            : host.querySelector(".tfx-btn:not(.tfx-hidden)") !== null;
        host.querySelectorAll(".tfx-sep").forEach(s => { s.style.display = anyVisible ? "" : "none"; });
    }

    _registerHotkeys() {
        this._keyHandler = (e) => {
            // Сначала дешёвая проверка модификаторов и клавиши, и только потом
            // поиск текстового поля — _ta() дёргает Webpack и querySelectorAll.
            const btn = BTNS.find(b => {
                if (!b.hotkey || this.settings.visible[b.id] === false) return false;
                const hk = b.hotkey;
                if (!!hk.ctrl !== e.ctrlKey || !!hk.shift !== e.shiftKey || !!hk.alt !== e.altKey) return false;
                // e.code — физическая клавиша: работает на любой раскладке и с Shift+цифра.
                if (hk.code && e.code === hk.code) return true;
                return e.key.toUpperCase() === hk.key.toUpperCase();
            });
            if (!btn) return;

            const ta = this._ta();
            if (!ta) return;
            const ae = document.activeElement;
            if (ae !== ta && !ta.contains(ae)) return;

            e.preventDefault();
            e.stopPropagation();
            this._saveSel();
            this._exec(btn.id);
        };
        document.addEventListener("keydown", this._keyHandler, true);
    }

    _exec(id) {
        const btn = BTNS.find(b => b.id === id);
        if (!btn) return;
        this._log(`exec ${id} (${btn.type})`);
        switch (btn.type) {
            case "ansi":       this._wrap(...ANSI[id]);        break;
            case "wrap":       this._wrap(...btn.wrap);        break;
            case "reset":      this._reset();                  break;
            case "link":       this._link();                   break;
            case "clearall":   this._clearAll();               break;
            case "lineprefix": this._linePrefix(btn.prefix);   break;
            case "numbered":   this._numbered();               break;
        }
        // Перерисовываем подсветку только в том тулбаре, где нажали кнопку.
        const container = document.activeElement?.closest?.(TOOLBAR_SEL);
        setTimeout(() => {
            if (container) this._refreshActive(container);
            else document.querySelectorAll(TOOLBAR_SEL).forEach(c => {
                if (this._injected.has(c)) this._refreshActive(c);
            });
        }, 0);
    }

    _reset() {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;
        const strip = (s) => s.replace(ANSI_RE(), "$1");
        if (this._replaceOnSlate(strip)) return;
        if (ta.tagName === "TEXTAREA") {
            const s = this._snap?.start ?? ta.selectionStart;
            const e = this._snap?.end   ?? ta.selectionEnd;
            if (s === e) return;
            const stripped = strip(ta.value.slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, stripped);
            return;
        }
        this._replaceRangeText(strip);
    }

    _link() {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;

        // Выделение и его контекст фиксируются ДО открытия модала: модал
        // забирает фокус и уничтожает исходный Range.
        let selectedText = "";
        let slateState = null;
        let snapState = null;

        if (ta.tagName !== "TEXTAREA") {
            const sn = ReactUtils.getOwnerInstance(ta);
            const sl = sn?.ref?.current?.getSlateEditor?.();
            const info = this._slateInfo(sl, this._snap?.slateSel ?? sl?.selection);
            if (info) {
                selectedText = info.text.slice(info.start, info.end);
                slateState = { sl, sn, info };
            } else {
                selectedText = this._getSelectedText();
            }
        } else {
            const s = this._snap?.start ?? ta.selectionStart;
            const e = this._snap?.end   ?? ta.selectionEnd;
            if (s !== e) {
                selectedText = ta.value.slice(s, e);
                snapState = { start: s, end: e };
            }
        }

        if (!selectedText) return;

        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "https://...";
        inp.className = "tfx-link-inp";
        inp.autofocus = true;

        const label = document.createElement("span");
        label.textContent = "URL ссылки:";
        label.style.cssText = "font-size:13px;color:var(--text-muted,#aaa);display:block;";

        const wrap = document.createElement("div");
        wrap.append(label, inp);

        const insert = () => {
            const url = inp.value.trim();
            if (!url) return;
            const rep = `[${selectedText}](${url})`;
            if (slateState) {
                const { sl, sn, info } = slateState;
                this._put(sl, info.path, info.start, info.end, rep, info.start, info.start + rep.length);
                sn?.focus?.();
            } else if (snapState) {
                ta.focus();
                ta.setSelectionRange(snapState.start, snapState.end);
                document.execCommand("insertText", false, rep);
            } else {
                this._restoreSel();
                document.execCommand("insertText", false, rep);
            }
        };

        let submitted = false;
        UI.showConfirmationModal("Добавить гиперссылку", wrap, {
            confirmText: "Вставить",
            cancelText: "Отмена",
            onConfirm: () => { if (!submitted) { submitted = true; insert(); } },
        });

        // Enter в поле = подтверждение, без похода мышкой к кнопке.
        inp.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            if (submitted) return;
            submitted = true;
            insert();
            document.querySelector('[class*="modal-"] [aria-label="Close"]')?.click();
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        requestAnimationFrame(() => inp.focus());
    }

    _clearAll() {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;
        const strip = (s) => {
            let r = s;
            r = r.replace(ANSI_RE(), "$1");                                   // ANSI-блоки
            r = r.replace(/```\w*\n?([\s\S]*?)\n?```/g, "$1");                // код-блоки
            r = r.replace(/`([^`\n]+)`/g, "$1");                              // инлайн-код
            r = r.replace(/\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/g, "$1");      // жирный курсив
            r = r.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, "$1");          // жирный
            r = r.replace(/~~(?=\S)([\s\S]+?)(?<=\S)~~/g, "$1");              // зачёркнутый
            r = r.replace(/\|\|([\s\S]+?)\|\|/g, "$1");                       // спойлер
            r = r.replace(/__(?=\S)([\s\S]+?)(?<=\S)__/g, "$1");              // подчёркивание
            // Курсив: границы обязательны, иначе ломается snake_case и «2 * 3 * 4».
            r = r.replace(/(?<![*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![*\w])/g, "$1");
            r = r.replace(/(?<![_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?![_\w])/g, "$1");
            r = r.replace(/^>>> /gm, "");                                     // многострочная цитата
            r = r.replace(/^> /gm, "");                                       // цитата
            r = r.replace(/^-# /gm, "");                                      // маленький текст
            r = r.replace(/^#{1,3} /gm, "");                                  // заголовки
            r = r.replace(/^- /gm, "");                                       // список
            r = r.replace(/^\d+\. /gm, "");                                   // нумерованный список
            return r;
        };
        if (this._replaceOnSlate(strip)) return;
        if (ta.tagName === "TEXTAREA") {
            const s = this._snap?.start ?? ta.selectionStart;
            const e = this._snap?.end   ?? ta.selectionEnd;
            if (s === e) return;
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, strip(ta.value.slice(s, e)));
            return;
        }
        this._replaceRangeText(strip);
    }

    _wrap(L, R) {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;

        const toggle = (selected) => {
            if (selected.startsWith(L) && selected.endsWith(R) && selected.length >= L.length + R.length) {
                return selected.slice(L.length, selected.length - R.length);
            }
            return L + selected + R;
        };

        // Slate не поддерживает \n в операции insert_text — каждая новая строка
        // там отдельный узел. ANSI-обёртки содержат переносы (```ansi\n...\n```),
        // поэтому для них Slate обходим полностью и работаем через execCommand.
        const hasNewline = L.includes("\n") || R.includes("\n");

        if (ta.tagName !== "TEXTAREA") {
            if (!hasNewline && this._replaceOnSlate(toggle)) return;
            this._replaceRangeText(toggle);
            return;
        }

        let s = ta.selectionStart, e = ta.selectionEnd;
        if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
        if (s === e) return;
        const full = ta.value ?? "";
        const st = this._wrapState(full, s, e, L, R);
        let from = s, to = e, rep = full.slice(s, e);
        if (st === "inner") rep = rep.slice(L.length, rep.length - R.length);
        else if (st === "outer") { from = s - L.length; to = e + R.length; }
        else rep = L + rep + R;
        ta.focus(); ta.setSelectionRange(from, to);
        document.execCommand("insertText", false, rep);
        ta.setSelectionRange(from, from + rep.length);
        this._saveSel();
    }

    _linePrefix(prefix) {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;
        const toggle = (txt) => {
            const lines = txt.split("\n");
            const nonEmpty = lines.filter(l => l !== "");
            const all = nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith(prefix));
            return all
                ? lines.map(l => l === "" ? l : l.slice(prefix.length)).join("\n")
                : lines.map(l => l === "" ? l : prefix + l).join("\n");
        };
        if (this._replaceOnSlate(toggle)) return;
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            if (s === e) return;
            const rep = toggle((ta.value ?? "").slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, rep);
            ta.setSelectionRange(s, s + rep.length);
            this._saveSel(); return;
        }
        this._replaceRangeText(toggle);
    }

    _numbered() {
        this._restoreSel();
        const ta = this._ta(); if (!ta) return;
        const toggle = (txt) => {
            const lines = txt.split("\n");
            const nonEmpty = lines.filter(l => l.trim() !== "");
            const all = nonEmpty.length > 0 && nonEmpty.every(l => /^\d+\.\s/.test(l));
            if (all) return lines.map(l => l.replace(/^\d+\.\s/, "")).join("\n");
            let counter = 1;
            return lines.map(l => l.trim() === "" ? l : `${counter++}. ${l}`).join("\n");
        };
        if (this._replaceOnSlate(toggle)) return;
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            if (s === e) return;
            const rep = toggle((ta.value ?? "").slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, rep);
            ta.setSelectionRange(s, s + rep.length);
            this._saveSel(); return;
        }
        this._replaceRangeText(toggle);
    }

    _refreshActive(container) {
        if (!container) return;
        const ta = this._ta(); if (!ta) return;
        container.querySelectorAll(".tfx-btn").forEach(el => {
            const id = el.dataset.tfxId;
            const btn = BTNS.find(b => b.id === id); if (!btn) return;
            let active = false;
            if (btn.type === "wrap")       active = this._isActive(ta, ...btn.wrap);
            if (btn.type === "ansi")       active = this._isActive(ta, ...ANSI[id]);
            if (btn.type === "reset")      active = this._hasAnsi(ta);
            if (btn.type === "lineprefix") active = this._isPrefixActive(ta, btn.prefix);
            if (btn.type === "numbered")   active = this._isNumberedActive(ta);
            el.classList.toggle("tfx-active", active);
        });
    }

    /** Текст текущего выделения, с учётом сохранённого снимка для TEXTAREA. */
    _selText(ta) {
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            return ta.value?.slice(s, e) ?? "";
        }
        return this._getSelectedText();
    }

    _isPrefixActive(ta, prefix) {
        const sel = this._selText(ta);
        if (!sel) return false;
        const nonEmpty = sel.split("\n").filter(l => l !== "");
        return nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith(prefix));
    }

    _isNumberedActive(ta) {
        const sel = this._selText(ta);
        if (!sel) return false;
        const nonEmpty = sel.split("\n").filter(l => l.trim() !== "");
        return nonEmpty.length > 0 && nonEmpty.every(l => /^\d+\.\s/.test(l));
    }

    _isActive(ta, L, R) {
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            if (s === e) return false;
            return this._wrapState(ta.value ?? "", s, e, L, R) !== "none";
        }
        const selected = this._getSelectedText();
        if (!selected) return false;
        return selected.startsWith(L) && selected.endsWith(R) && selected.length >= L.length + R.length;
    }

    _hasAnsi(ta) {
        return ANSI_RE().test(this._selText(ta));
    }

    /** Класс поля ввода Discord. Кешируется — иначе Webpack-поиск на каждый вызов. */
    _textAreaClass() {
        if (this._taClassKey === undefined) {
            const cls = Webpack.getByKeys("channelTextArea", "textArea");
            this._taClassKey = cls?.textArea?.split(" ")[0] ?? null;
        }
        return this._taClassKey;
    }

    _ta() {
        const ae = document.activeElement;
        if (ae?.matches?.('div[contenteditable="true"]')) return ae;

        const sel = window.getSelection();
        if (sel?.anchorNode) {
            const ce = sel.anchorNode.nodeType === 1
                ? sel.anchorNode.closest?.('div[contenteditable="true"]')
                : sel.anchorNode.parentElement?.closest?.('div[contenteditable="true"]');
            if (ce) return ce;
        }

        const key = this._textAreaClass();
        const all = key
            ? [...document.querySelectorAll(`.${key}`)]
            : [...document.querySelectorAll('[class*="textArea_"]')];

        if (sel?.anchorNode) {
            const bySel = all.find(el => el.contains(sel.anchorNode));
            if (bySel) return bySel;
        }
        const byActive = all.find(el => el.contains(document.activeElement));
        if (byActive) return byActive;
        return all[0] ?? document.querySelector('div[contenteditable="true"]');
    }

    _saveSel() {
        const ta = this._ta();
        if (!ta) return;
        if (ta.tagName === "TEXTAREA") {
            const { selectionStart: s, selectionEnd: e } = ta;
            this._snap = s !== e ? { type: "textarea", start: s, end: e } : null;
            return;
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            try {
                const sn = ReactUtils.getOwnerInstance(ta);
                const sl = sn?.ref?.current?.getSlateEditor?.();
                const slateSel = sl?.selection ? JSON.parse(JSON.stringify(sl.selection)) : null;
                this._snap = { type: "range", range: sel.getRangeAt(0).cloneRange(), ta, sl, slateSel };
            } catch (err) {
                this._snap = null;
                this._log(`saveSel failed: ${err?.message}`);
            }
        } else {
            this._snap = null;
        }
    }

    _restoreSel() {
        const snap = this._snap;
        if (!snap) return;
        const ta = this._ta();
        if (!ta) return;
        if (snap.type === "textarea" && ta.tagName === "TEXTAREA") {
            ta.focus(); ta.setSelectionRange(snap.start, snap.end);
            return;
        }
        if (snap.type === "range") {
            const target = snap.ta ?? ta;
            // Важно: сначала восстанавливаем DOM Range, потом фокусируем.
            // Если сделать наоборот — Slate's onFocus срабатывает и сбрасывает
            // editor.selection по текущему (collapsed) DOM-выделению.
            try {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(snap.range);
            } catch (err) {
                this._log(`addRange failed: ${err?.message}`);
            }
            target.focus();
            // Запасной вариант: явно восстанавливаем Slate-selection на случай,
            // если onFocus всё-таки сбросил его после нашего addRange.
            try {
                if (snap.sl && snap.slateSel) snap.sl.selection = JSON.parse(JSON.stringify(snap.slateSel));
            } catch (_) { /* Slate мог перерисоваться — не критично */ }
        }
    }

    _getSelectedText() {
        const sel = window.getSelection();
        if (sel?.rangeCount && !sel.isCollapsed) return sel.toString();
        return "";
    }

    _replaceRangeText(transformFn) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return;
        const selected = sel.toString();
        if (!selected) return;
        const rep = transformFn(selected);
        if (typeof rep !== "string" || rep === selected) return;
        document.execCommand("insertText", false, rep);
    }

    _replaceOnSlate(transformFn) {
        const ta = this._ta();
        if (!ta || ta.tagName === "TEXTAREA") return false;
        const sn = ReactUtils.getOwnerInstance(ta);
        const sl = sn?.ref?.current?.getSlateEditor?.();
        // Приоритет — сохранённый slateSel, т.к. target.focus() в _restoreSel
        // мог сбросить sl.selection через Slate's onFocus до того как мы успели.
        const info = this._slateInfo(sl, this._snap?.slateSel ?? sl?.selection);
        if (!info) return false;
        const selected = info.text.slice(info.start, info.end);
        const rep = transformFn(selected);
        if (typeof rep !== "string" || rep === selected) return true;
        this._put(sl, info.path, info.start, info.end, rep, info.start, info.start + rep.length);
        sn?.focus?.();
        return true;
    }

    _slateInfo(sl, selection = null) {
        const sel = selection ?? sl?.selection;
        if (!sel?.anchor || !sel?.focus) return null;
        const a = sel.anchor, f = sel.focus;
        if (JSON.stringify(a.path) !== JSON.stringify(f.path)) return null;
        const start = Math.min(a.offset, f.offset);
        const end   = Math.max(a.offset, f.offset);
        if (start === end) return null;
        const path = a.path;
        let node = sl.children;
        for (const idx of path) node = node?.[idx];
        const text = typeof node?.text === "string" ? node.text : "";
        if (!text) return null;
        return { path, start, end, text };
    }

    _put(sl, path, start, end, rep, ss, se) {
        const cn = path.reduce((a, i) => a?.[i], sl.children);
        const cur = typeof cn?.text === "string" ? cn.text : "";
        const rem = cur.slice(start, end);
        if (rem.length) sl.apply({ type: "remove_text", path, offset: start, text: rem });
        if (rep.length) sl.apply({ type: "insert_text", path, offset: start, text: rep });
        sl.selection = {
            anchor: { path: [...path], offset: ss },
            focus:  { path: [...path], offset: se },
        };
    }

    _wrapState(text, start, end, L, R) {
        const sel = text.slice(start, end);
        if (sel.startsWith(L) && sel.endsWith(R) && sel.length >= L.length + R.length) return "inner";
        if (start >= L.length && end + R.length <= text.length) {
            if (text.slice(start - L.length, start) === L && text.slice(end, end + R.length) === R) return "outer";
        }
        return "none";
    }

};

/*@end@*/
