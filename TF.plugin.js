/**
 * @name TFExtra
 * @description Встраивает ANSI-цвета (текст и фон), заголовки H1–H3, подчёркивание, списки, код-блок и другое кастомное форматирование в попап Discord.
 * @version 5.1.5
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

const { Patcher, DOM, ReactUtils, Webpack, Logger, Data } = BdApi;
const PLUGIN_NAME = "TFExtra";
const VERSION     = "5.1.6";

// Попап форматирования Discord при выделении текста использует класс buttons_XXXXX
// Но такой же класс есть и в панели снизу — различаем по наличию нативных кнопок Discord внутри
const TOOLBAR_SEL = '[class*="buttons_"]';

const ANSI = {
    // Foreground colors
    ansiRed:       ["```ansi\n\u001b[1;31m", "\u001b[0m\n```"],
    ansiGreen:     ["```ansi\n\u001b[1;32m", "\u001b[0m\n```"],
    ansiYellow:    ["```ansi\n\u001b[1;33m", "\u001b[0m\n```"],
    ansiBlue:      ["```ansi\n\u001b[1;34m", "\u001b[0m\n```"],
    ansiMagenta:   ["```ansi\n\u001b[1;35m", "\u001b[0m\n```"],
    ansiCyan:      ["```ansi\n\u001b[1;36m", "\u001b[0m\n```"],
    ansiWhite:     ["```ansi\n\u001b[1;37m", "\u001b[0m\n```"],
    // Background colors
    ansiBgRed:     ["```ansi\n\u001b[41m", "\u001b[0m\n```"],
    ansiBgGreen:   ["```ansi\n\u001b[42m", "\u001b[0m\n```"],
    ansiBgYellow:  ["```ansi\n\u001b[43m", "\u001b[0m\n```"],
    ansiBgBlue:    ["```ansi\n\u001b[44m", "\u001b[0m\n```"],
    ansiBgMagenta: ["```ansi\n\u001b[45m", "\u001b[0m\n```"],
    ansiBgCyan:    ["```ansi\n\u001b[46m", "\u001b[0m\n```"],
    ansiBgWhite:   ["```ansi\n\u001b[47m", "\u001b[0m\n```"],
};

// FIX: обновлён regex — теперь матчит как fg (1;31) так и bg (41) коды
const ANSI_RE = () => /```ansi\n\u001b\[(?:\d+;)*\d+m([\s\S]*?)\u001b\[0m\n```/g;

const BTNS = [
    // ── Инлайн-форматирование ──────────────────────────────────────────────
    { id:"underline",  type:"wrap",  wrap:["__","__"],       label:"U\u0332", labelStyle:"text-decoration:underline;font-weight:700;font-size:13px;",                     title:"Подчёркивание",           hotkey:{ctrl:true,shift:true,key:"U"},   defaultVisible:true },
    // ── Блочное форматирование ─────────────────────────────────────────────
    { id:"h1",         type:"lineprefix", prefix:"# ",       label:"H1",      labelStyle:"font-size:11px;font-weight:700;",                                                title:"Заголовок 1",             hotkey:{ctrl:true,shift:true,key:"1"},   defaultVisible:true },
    { id:"h2",         type:"lineprefix", prefix:"## ",      label:"H2",      labelStyle:"font-size:11px;font-weight:700;",                                                title:"Заголовок 2",             hotkey:{ctrl:true,shift:true,key:"2"},   defaultVisible:true },
    { id:"h3",         type:"lineprefix", prefix:"### ",     label:"H3",      labelStyle:"font-size:11px;font-weight:700;",                                                title:"Заголовок 3",             hotkey:{ctrl:true,shift:true,key:"3"},   defaultVisible:true },
    { id:"smallText",  type:"lineprefix", prefix:"-# ",      label:"-#",      labelStyle:"font-size:11px;font-weight:700;",                                                title:"Маленький текст",         hotkey:null,                             defaultVisible:true },
    { id:"list",       type:"lineprefix", prefix:"- ",       label:"•",       labelStyle:"font-size:14px;font-weight:700;",                                                title:"Список",                  hotkey:null,                             defaultVisible:true },
    { id:"numList",    type:"numbered",                      label:"1.",      labelStyle:"font-size:12px;font-weight:700;",                                                title:"Нумерованный список",     hotkey:null,                             defaultVisible:true },
    { id:"codeblock",  type:"wrap",  wrap:["```\n","\n```"], label:"</>",     labelStyle:"font-family:monospace;font-weight:700;font-size:11px;letter-spacing:-0.5px;",   title:"Код-блок",                hotkey:{ctrl:true,shift:true,key:"K"},   defaultVisible:true },
    // ── Утилиты ────────────────────────────────────────────────────────────
    { id:"hyperlink",  type:"link",                          label:"🔗",      labelStyle:"font-size:13px;",                                                                title:"Гиперссылка",             hotkey:{ctrl:true,shift:true,key:"L"},   defaultVisible:true },
    { id:"clearAll",   type:"clearall",                      label:"✕fmt",    labelStyle:"font-size:10px;font-weight:700;opacity:0.8;",                                    title:"Очистить форматирование", hotkey:null,                             defaultVisible:true },
    // ── ANSI цвета текста (круглые свотчи) ────────────────────────────────
    { id:"ansiRed",     type:"ansi", label:'<span class="tfx-sw" style="background:#ed4245"></span>',                                            title:"Текст: Красный",     hotkey:null, defaultVisible:true },
    { id:"ansiGreen",   type:"ansi", label:'<span class="tfx-sw" style="background:#57f287"></span>',                                            title:"Текст: Зелёный",     hotkey:null, defaultVisible:true },
    { id:"ansiYellow",  type:"ansi", label:'<span class="tfx-sw" style="background:#faa61a"></span>',                                            title:"Текст: Жёлтый",      hotkey:null, defaultVisible:true },
    { id:"ansiBlue",    type:"ansi", label:'<span class="tfx-sw" style="background:#5865f2"></span>',                                            title:"Текст: Синий",       hotkey:null, defaultVisible:true },
    { id:"ansiMagenta", type:"ansi", label:'<span class="tfx-sw" style="background:#c678dd"></span>',                                            title:"Текст: Пурпурный",   hotkey:null, defaultVisible:true },
    { id:"ansiCyan",    type:"ansi", label:'<span class="tfx-sw" style="background:#56b6c2"></span>',                                            title:"Текст: Циан",        hotkey:null, defaultVisible:true },
    { id:"ansiWhite",   type:"ansi", label:'<span class="tfx-sw" style="background:#dce0e8;border-color:rgba(255,255,255,0.45)"></span>',        title:"Текст: Белый",       hotkey:null, defaultVisible:true },
    { id:"ansiReset",   type:"reset",label:"\u2715", labelStyle:"font-size:12px;font-weight:700;opacity:0.7;",                                   title:"Убрать ANSI",    hotkey:null, defaultVisible:true },
    // ── ANSI фон (квадратные свотчи) ──────────────────────────────────────
    { id:"ansiBgRed",     type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#c0392b"></span>',                                title:"Фон: Красный",   hotkey:null, defaultVisible:true },
    { id:"ansiBgGreen",   type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#27ae60"></span>',                                title:"Фон: Зелёный",   hotkey:null, defaultVisible:true },
    { id:"ansiBgYellow",  type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#e67e22"></span>',                                title:"Фон: Жёлтый",    hotkey:null, defaultVisible:true },
    { id:"ansiBgBlue",    type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#5865f2"></span>',                                title:"Фон: Синий",     hotkey:null, defaultVisible:true },
    { id:"ansiBgMagenta", type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#8e44ad"></span>',                                title:"Фон: Пурпурный", hotkey:null, defaultVisible:true },
    { id:"ansiBgCyan",    type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#16a085"></span>',                                title:"Фон: Циан",      hotkey:null, defaultVisible:true },
    { id:"ansiBgWhite",   type:"ansi", label:'<span class="tfx-sw tfx-sw-sq" style="background:#dce0e8;border-color:rgba(0,0,0,0.25)"></span>',  title:"Фон: Белый",     hotkey:null, defaultVisible:true },
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
#tfx-tip {
    position: fixed;
    visibility: hidden;
    opacity: 0;
    pointer-events: none;
    background: var(--background-floating, #18191c);
    color: var(--header-primary, #fff);
    font-size: 12px;
    font-weight: 500;
    padding: 5px 9px;
    border-radius: 5px;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    z-index: 100000;
    text-align: center;
    transition: opacity 100ms ease, visibility 0ms linear 100ms;
}
#tfx-tip.on { visibility:visible; opacity:1; transition: opacity 100ms ease 400ms, visibility 0ms linear 400ms; }
#tfx-tip .hk { display:block; margin-top:2px; font-size:10px; opacity:0.5; font-family:monospace; }
.tfx-s { padding:16px; color:var(--text-normal); font-size:14px; }
.tfx-s h2 { font-size:16px; font-weight:700; margin:0 0 2px; color:var(--header-primary); }
.tfx-s .ver { font-size:11px; opacity:0.4; margin-bottom:18px; }
.tfx-s .sec { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; opacity:.45; margin-bottom:10px; }
.tfx-s .row { display:flex; align-items:center; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--background-modifier-accent,rgba(255,255,255,.06)); }
.tfx-s .row:last-child { border-bottom:none; }
.tfx-s .rl { display:flex; align-items:center; gap:10px; }
.tfx-s .rp { width:24px; text-align:center; flex-shrink:0; }
.tfx-s .rn { font-size:14px; }
.tfx-s .rh { display:block; font-size:10px; font-family:monospace; opacity:.4; margin-top:1px; }
.tfx-tog { position:relative; width:36px; height:20px; flex-shrink:0; cursor:pointer; }
.tfx-tog input { opacity:0; width:0; height:0; position:absolute; }
.tfx-tog-t { position:absolute; inset:0; border-radius:20px; background:var(--background-modifier-accent,rgba(255,255,255,.15)); transition:background 150ms; }
.tfx-tog input:checked + .tfx-tog-t { background:#5865f2; }
.tfx-tog-t::after { content:''; position:absolute; width:14px; height:14px; border-radius:50%; background:#fff; top:3px; left:3px; transition:transform 150ms ease; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.tfx-tog input:checked + .tfx-tog-t::after { transform:translateX(16px); }
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
    return { visible: vis };
}

// FIX: добавлена поддержка Alt в подсказке горячей клавиши
function hkLabel(hk) {
    if (!hk) return "";
    return [hk.ctrl && "Ctrl", hk.alt && "Alt", hk.shift && "Shift", hk.key].filter(Boolean).join("+");
}

module.exports = class TFExtra {
    _snap     = null;
    settings  = defaultSettings();
    _mutObs   = null;
    _keyHandler = null;
    _tipEl    = null;
    _injected = new WeakSet();

    start() {
        this._loadSettings();
        DOM.addStyle(PLUGIN_NAME, CSS);
        document.querySelectorAll(".tfx-sep, .tfx-btn").forEach(el => el.remove());
        this._mkTip();
        this._startObserver();
        this._registerHotkeys();
        Logger.info(PLUGIN_NAME, `v${VERSION} started`);
    }

    stop() {
        Patcher.unpatchAll(PLUGIN_NAME);
        DOM.removeStyle(PLUGIN_NAME);
        this._mutObs?.disconnect();
        if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler, true);
        this._tipEl?.remove();
        document.querySelectorAll(".tfx-sep, .tfx-btn").forEach(el => el.remove());
        Logger.info(PLUGIN_NAME, "stopped");
    }

    _loadSettings() {
        const s = Data.load(PLUGIN_NAME, "settings");
        if (s) this.settings = { visible: { ...defaultSettings().visible, ...s.visible } };
        if (!Object.values(this.settings.visible).some(Boolean)) {
            this.settings = defaultSettings();
            this._saveSettings();
        }
    }
    _saveSettings() { Data.save(PLUGIN_NAME, "settings", this.settings); }

    getSettingsPanel() {
        const root = document.createElement("div");
        root.className = "tfx-s";
        root.innerHTML = `<h2>TFExtra</h2><div class="ver">v${VERSION} — кнопки встроены в нативный попап Discord</div><div class="sec">Видимость кнопок</div>`;
        for (const btn of BTNS) {
            const row = document.createElement("div");
            row.className = "row";
            const ps = document.createElement("span");
            ps.innerHTML = btn.label;
            if (btn.labelStyle) ps.style.cssText = btn.labelStyle;
            row.innerHTML = `
                <div class="rl">
                    <div class="rp"></div>
                    <div><div class="rn">${btn.title}</div>${btn.hotkey ? `<span class="rh">${hkLabel(btn.hotkey)}</span>` : ""}</div>
                </div>
                <label class="tfx-tog">
                    <input type="checkbox" ${this.settings.visible[btn.id] !== false ? "checked" : ""}>
                    <div class="tfx-tog-t"></div>
                </label>`;
            row.querySelector(".rp").appendChild(ps);
            row.querySelector("input").addEventListener("change", (e) => {
                this.settings.visible[btn.id] = e.target.checked;
                this._saveSettings();
                this._applyVis();
            });
            root.appendChild(row);
        }
        return root;
    }

    _mkTip() {
        this._tipEl = document.createElement("div");
        this._tipEl.id = "tfx-tip";
        document.body.appendChild(this._tipEl);
    }
    _showTip(anchor, title, hk) {
        if (!this._tipEl) return;
        this._tipEl.innerHTML = "";
        this._tipEl.appendChild(document.createTextNode(title));
        if (hk) { const s = document.createElement("span"); s.className = "hk"; s.textContent = hk; this._tipEl.appendChild(s); }
        this._tipEl.style.cssText = "left:-9999px;top:-9999px;";
        this._tipEl.classList.add("on");
        requestAnimationFrame(() => {
            const ar = anchor.getBoundingClientRect();
            const tw = this._tipEl.offsetWidth, th = this._tipEl.offsetHeight;
            let l = ar.left + ar.width / 2 - tw / 2;
            let t = ar.top - th - 8;
            l = Math.max(6, Math.min(l, window.innerWidth - tw - 6));
            if (t < 6) t = ar.bottom + 8;
            this._tipEl.style.left = l + "px";
            this._tipEl.style.top  = t + "px";
        });
    }
    _hideTip() { this._tipEl?.classList.remove("on"); }

    // ── Observer ──────────────────────────────────────────────────────────────
    _startObserver() {
        const tryInject = (node) => {
            if (!node || node.nodeType !== 1) return;
            if (node.matches?.(TOOLBAR_SEL)) {
                Logger.info(PLUGIN_NAME, `Observer: direct match on ${node.className.split(" ")[0]}`);
                this._maybeInject(node);
            }
            const found = node.querySelectorAll?.(TOOLBAR_SEL) ?? [];
            if (found.length) Logger.info(PLUGIN_NAME, `Observer: found ${found.length} children matching ${TOOLBAR_SEL}`);
            found.forEach(el => this._maybeInject(el));
        };

        this._mutObs = new MutationObserver((muts) => {
            for (const mut of muts)
                for (const added of mut.addedNodes) tryInject(added);
        });
        this._mutObs.observe(document.body, { childList: true, subtree: true });
        Logger.info(PLUGIN_NAME, "Observer started, scanning existing DOM...");
        tryInject(document.body);
        Logger.info(PLUGIN_NAME, `Initial scan done. Total [${TOOLBAR_SEL}] in DOM: ${document.querySelectorAll(TOOLBAR_SEL).length}`);
    }

    _maybeInject(el) {
        if (this._injected.has(el)) return;

        const r = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const btnCount = el.querySelectorAll("button,[role='button']").length;
        const labels = [...el.querySelectorAll("[aria-label]")].map(n => (n.getAttribute("aria-label") || "").toLowerCase());
        const hasKnownFormatting = labels.some(t =>
            t.includes("bold") || t.includes("italic") || t.includes("underline") || t.includes("strikethrough")
            || t.includes("spoiler") || t.includes("code")
        );
        const svgBtnCount = [...el.querySelectorAll("button,[role='button']")].filter(b => b.querySelector("svg")).length;
        const inLayer = !!el.closest('[class*="layer"],[class*="popover"],[class*="appLayers"]');
        const cls = (el.className || "").toString().split(" ")[0] || "<no-class>";
        const skip = (why) => Logger.info(PLUGIN_NAME, `SKIP ${cls}: ${why} | pos=${cs.position} size=${Math.round(r.width)}x${Math.round(r.height)} btns=${btnCount} labels=${labels.slice(0,6).join(",")}`);

        // Только плавающий попап выделения, а не нижняя панель ввода.
        if (el.closest("form,[class*='channelTextArea'],[class*='textArea_']")) return skip("inside composer");
        if (btnCount < 4 || btnCount > 16) return skip("button count");
        if (!inLayer) return skip("not in layer");
        if (!hasKnownFormatting && svgBtnCount < 3) return skip("no formatting markers");

        // Размер попапа форматирования: ~32-45px высота, 100-600px ширина
        if (r.width < 80 || r.width > 700) return skip("width range");
        if (r.height < 20 || r.height > 60) return skip("height range");
        if (el.children.length < 2) return skip("children count");

        // Главная проверка: внутри должны быть нативные кнопки Discord
        const hasNativeBtn = el.querySelector('[aria-label]') !== null
            || el.querySelector('[class*="button_"]') !== null
            || el.querySelector('[class*="Button_"]') !== null;
        if (!hasNativeBtn) return skip("native button markers");

        const sel = window.getSelection();
        const selected = (sel?.toString() ?? "").trim();
        if (!selected) return skip("empty selection");

        Logger.info(PLUGIN_NAME, `✅ INJECTING: ${cls} ${Math.round(r.width)}x${Math.round(r.height)} btns=${btnCount}`);
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
        const cCls = (container.className || "").toString().split(" ")[0] || "<no-class>";
        const tCls = (target.className || "").toString().split(" ")[0] || "<no-class>";
        Logger.info(PLUGIN_NAME, `INJECT TARGET picked: container=${cCls} target=${tCls} targetBtns=${target.querySelectorAll("button,[role='button']").length}`);
        if (target.querySelector(".tfx-btn")) {
            Logger.info(PLUGIN_NAME, `INJECT SKIP ${tCls}: already has .tfx-btn`);
            return;
        }

        const sep = document.createElement("div");
        sep.className = "tfx-sep";
        sep.setAttribute("aria-hidden", "true");
        sep.setAttribute("contenteditable", "false");
        target.appendChild(sep);

        for (const btn of BTNS) target.appendChild(this._mkBtn(btn));

        this._applyVis(target);
        this._refreshActive(target);
        Logger.info(PLUGIN_NAME, `✓ injected → ${tCls}; appended=${BTNS.length + 1}`);
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
        // Если метка начинается с '<' — вставляем как HTML (цветные свотчи),
        // иначе как безопасный textContent.
        if (typeof btn.label === "string" && /^<[a-zA-Z]/.test(btn.label.trimStart())) {
            el.innerHTML = btn.label;
        } else {
            el.textContent = btn.label;
        }
        if (btn.labelStyle) el.style.cssText += `;${btn.labelStyle}`;
        const hk = btn.hotkey ? hkLabel(btn.hotkey) : null;
        const halt = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
        };
        el.addEventListener("mouseenter", () => this._showTip(el, btn.title, hk));
        el.addEventListener("mouseleave", () => this._hideTip());
        el.addEventListener("pointerdown", (e) => { halt(e); this._saveSel(); }, true);
        el.addEventListener("mousedown", halt, true);
        el.addEventListener("mouseup", halt, true);
        el.addEventListener("click", (e) => { halt(e); this._hideTip(); this._exec(btn.id); }, true);
        el.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            halt(e);
            this._hideTip();
            this._exec(btn.id);
        }, true);
        return el;
    }

    _applyVis(root) {
        const host = root ?? document.body;
        let hidden = 0, shown = 0;
        host.querySelectorAll(".tfx-btn").forEach(el => {
            el.classList.toggle("tfx-hidden", this.settings.visible[el.dataset.tfxId] === false);
            if (el.classList.contains("tfx-hidden")) hidden++;
            else shown++;
        });
        // FIX: проверяем видимость кнопок именно в текущем контейнере, а не глобально
        const anyVisible = host === document.body
            ? BTNS.some(b => this.settings.visible[b.id] !== false)
            : host.querySelectorAll(".tfx-btn:not(.tfx-hidden)").length > 0;
        host.querySelectorAll(".tfx-sep").forEach(s => { s.style.display = anyVisible ? "" : "none"; });
        Logger.info(PLUGIN_NAME, `VIS host=${(host.className || "").toString().split(" ")[0] || "body"} shown=${shown} hidden=${hidden} any=${anyVisible}`);
    }

    _registerHotkeys() {
        this._keyHandler = (e) => {
            const ta = this._ta();
            if (!ta) return;
            const ae = document.activeElement;
            if (ae !== ta && !ta.contains(ae)) return;
            for (const btn of BTNS) {
                if (!btn.hotkey || this.settings.visible[btn.id] === false) continue;
                const hk = btn.hotkey;
                // FIX: добавлена проверка altKey для поддержки горячих клавиш с Alt
                if (!!hk.ctrl !== e.ctrlKey || !!hk.shift !== e.shiftKey || !!hk.alt !== e.altKey) continue;
                if (e.key.toUpperCase() !== hk.key.toUpperCase()) continue;
                e.preventDefault(); e.stopPropagation();
                this._saveSel(); this._exec(btn.id); return;
            }
        };
        document.addEventListener("keydown", this._keyHandler, true);
    }

    _exec(id) {
        const btn = BTNS.find(b => b.id === id);
        if (!btn) { Logger.info(PLUGIN_NAME, `_exec: unknown id=${id}`); return; }
        Logger.info(PLUGIN_NAME, `_exec: id=${id} type=${btn.type}`);
        switch (btn.type) {
            case "ansi":    this._wrap(...ANSI[id]); break;
            case "wrap":    this._wrap(...btn.wrap); break;
            case "reset":   this._reset();           break;
            case "link":    this._link();            break;
            case "clearall":this._clearAll();        break;
            case "lineprefix": this._linePrefix(btn.prefix); break;
            case "numbered":   this._numbered();    break;
        }
        setTimeout(() => {
            document.querySelectorAll(TOOLBAR_SEL).forEach(c => {
                if (this._injected.has(c)) this._refreshActive(c);
            });
        }, 0);
    }

    _reset() {
        Logger.info(PLUGIN_NAME, `_reset: start`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_reset: no ta`); return; }
        const strip = (s) => s.replace(ANSI_RE(), "$1");
        const doneSlate = this._replaceOnSlate((selected) => strip(selected));
        if (doneSlate) { Logger.info(PLUGIN_NAME, `_reset: done via slate`); return; }
        if (ta.tagName === "TEXTAREA") {
            const s = this._snap?.start ?? ta.selectionStart;
            const e = this._snap?.end   ?? ta.selectionEnd;
            if (s === e) { Logger.info(PLUGIN_NAME, `_reset: TEXTAREA collapsed`); return; }
            const stripped = strip(ta.value.slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, stripped);
            Logger.info(PLUGIN_NAME, `_reset: done via TEXTAREA execCommand`);
            return;
        }
        this._replaceRangeText((selected) => strip(selected));
        this._clearSlateSelection();
        Logger.info(PLUGIN_NAME, `_reset: done via replaceRangeText`);
    }

    _link() {
        Logger.info(PLUGIN_NAME, `_link: start`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_link: no ta`); return; }

        // Сохраняем выделенный текст и состояние ДО открытия модала
        let selectedText = "";
        let slateState = null;
        let snapState = null;

        if (ta.tagName !== "TEXTAREA") {
            const sn = ReactUtils.getOwnerInstance(ta);
            const sl = sn?.ref?.current?.getSlateEditor();
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

        Logger.info(PLUGIN_NAME, `_link: selectedText="${selectedText.slice(0, 40)}" slateState=${!!slateState} snapState=${!!snapState}`);
        if (!selectedText) { Logger.info(PLUGIN_NAME, `_link: no selectedText — abort`); return; }

        const inp = document.createElement("input");
        inp.type = "text";
        inp.placeholder = "https://...";
        inp.className = "tfx-link-inp";

        const wrap = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = "URL ссылки:";
        label.style.cssText = "font-size:13px;color:var(--text-muted,#aaa);display:block;";
        wrap.appendChild(label);
        wrap.appendChild(inp);

        BdApi.UI.showConfirmationModal("Добавить гиперссылку", wrap, {
            confirmText: "Вставить",
            cancelText: "Отмена",
            onConfirm: () => {
                const url = inp.value.trim();
                if (!url) { Logger.info(PLUGIN_NAME, `_link: empty url`); return; }
                const rep = `[${selectedText}](${url})`;
                Logger.info(PLUGIN_NAME, `_link: inserting rep="${rep.slice(0, 60)}"`);
                if (slateState) {
                    const { sl, sn, info } = slateState;
                    this._put(sl, info.path, info.start, info.end, rep, info.start, info.start + rep.length);
                    sn?.focus?.();
                } else if (snapState) {
                    ta.focus();
                    ta.setSelectionRange(snapState.start, snapState.end);
                    document.execCommand("insertText", false, rep);
                } else {
                    document.execCommand("insertText", false, rep);
                }
            }
        });
        setTimeout(() => inp.focus(), 150);
    }

    _clearAll() {
        Logger.info(PLUGIN_NAME, `_clearAll: start`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_clearAll: no ta`); return; }
        const strip = (s) => {
            let r = s;
            // ANSI-блоки
            r = r.replace(ANSI_RE(), "$1");
            // Код-блоки (с языком и без)
            r = r.replace(/```\w*\n?([\s\S]*?)\n?```/g, "$1");
            // Инлайн-код
            r = r.replace(/`([^`\n]+)`/g, "$1");
            // Жирный+курсив
            r = r.replace(/\*\*\*([\s\S]+?)\*\*\*/g, "$1");
            // Жирный
            r = r.replace(/\*\*([\s\S]+?)\*\*/g, "$1");
            // Курсив *
            r = r.replace(/\*([\s\S]+?)\*/g, "$1");
            // Подчёркивание
            r = r.replace(/__([\s\S]+?)__/g, "$1");
            // Курсив _
            r = r.replace(/_([\s\S]+?)_/g, "$1");
            // Зачёркнутый
            r = r.replace(/~~([\s\S]+?)~~/g, "$1");
            // Спойлер
            r = r.replace(/\|\|([\s\S]+?)\|\|/g, "$1");
            // Многострочная цитата
            r = r.replace(/^>>> /gm, "");
            // Одиночная цитата
            r = r.replace(/^> /gm, "");
            // Заголовки H1-H3
            r = r.replace(/^#{1,3} /gm, "");
            // Маленький текст
            r = r.replace(/^-# /gm, "");
            // Список
            r = r.replace(/^- /gm, "");
            // Нумерованный список
            r = r.replace(/^\d+\. /gm, "");
            return r;
        };
        const doneSlate = this._replaceOnSlate((selected) => strip(selected));
        if (doneSlate) { Logger.info(PLUGIN_NAME, `_clearAll: done via slate`); return; }
        if (ta.tagName === "TEXTAREA") {
            const s = this._snap?.start ?? ta.selectionStart;
            const e = this._snap?.end   ?? ta.selectionEnd;
            if (s === e) { Logger.info(PLUGIN_NAME, `_clearAll: TEXTAREA collapsed`); return; }
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, strip(ta.value.slice(s, e)));
            Logger.info(PLUGIN_NAME, `_clearAll: done via TEXTAREA execCommand`);
            return;
        }
        this._replaceRangeText((selected) => strip(selected));
        this._clearSlateSelection();
        Logger.info(PLUGIN_NAME, `_clearAll: done via replaceRangeText`);
    }

    _wrap(L, R) {
        Logger.info(PLUGIN_NAME, `_wrap: L="${L.slice(0,20)}" R="${R.slice(0,20)}"`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_wrap: no ta`); return; }

        // Slate не поддерживает \n в операции insert_text — каждая новая строка
        // там отдельный узел. ANSI-обёртки содержат переносы (```ansi\n...\n```),
        // поэтому для них Slate обходим полностью и работаем через execCommand.
        const hasNewline = L.includes("\n") || R.includes("\n");

        if (ta.tagName !== "TEXTAREA") {
            if (!hasNewline) {
                // Для простых оборачиваний без \n пробуем Slate первым.
                const doneSlate = this._replaceOnSlate((selected) => {
                    if (selected.startsWith(L) && selected.endsWith(R) && selected.length >= L.length + R.length) {
                        return selected.slice(L.length, selected.length - R.length);
                    }
                    return L + selected + R;
                });
                if (doneSlate) { Logger.info(PLUGIN_NAME, `_wrap: done via slate`); return; }
            }
            // Fallback (и единственный путь для ANSI): execCommand на DOM-выделении.
            // _restoreSel() выше уже вернул фокус и восстановил Range.
            Logger.info(PLUGIN_NAME, `_wrap: fallback to replaceRangeText hasNewline=${hasNewline}`);
            this._replaceRangeText((selected) => {
                if (selected.startsWith(L) && selected.endsWith(R) && selected.length >= L.length + R.length) {
                    return selected.slice(L.length, selected.length - R.length);
                }
                return L + selected + R;
            });
            this._clearSlateSelection();
            return;
        }

        // TEXTAREA path
        let s = ta.selectionStart, e = ta.selectionEnd;
        if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
        if (s === e) { Logger.info(PLUGIN_NAME, `_wrap: TEXTAREA collapsed`); return; }
        const full = ta.value ?? "";
        const st = this._wrapState(full, s, e, L, R);
        let from = s, to = e, rep = full.slice(s, e);
        if (st === "inner") rep = rep.slice(L.length, rep.length - R.length);
        else if (st === "outer") { from = s - L.length; to = e + R.length; }
        else rep = L + rep + R;
        Logger.info(PLUGIN_NAME, `_wrap: TEXTAREA st=${st} s=${s} e=${e}`);
        ta.focus(); ta.setSelectionRange(from, to);
        document.execCommand("insertText", false, rep);
        ta.setSelectionRange(from, from + rep.length);
        this._saveSel();
    }

    _linePrefix(prefix) {
        Logger.info(PLUGIN_NAME, `_linePrefix: prefix="${prefix}"`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_linePrefix: no ta`); return; }
        const toggle = (txt) => {
            const lines = txt.split("\n");
            const nonEmpty = lines.filter(l => l !== "");
            const all = nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith(prefix));
            return all
                ? lines.map(l => l === "" ? l : l.slice(prefix.length)).join("\n")
                : lines.map(l => l === "" ? l : prefix + l).join("\n");
        };
        const doneSlate = this._replaceOnSlate((selected) => toggle(selected));
        if (doneSlate) { Logger.info(PLUGIN_NAME, `_linePrefix: done via slate`); return; }
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            if (s === e) { Logger.info(PLUGIN_NAME, `_linePrefix: TEXTAREA collapsed`); return; }
            const full = ta.value ?? "";
            const rep = toggle(full.slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, rep);
            ta.setSelectionRange(s, s + rep.length);
            Logger.info(PLUGIN_NAME, `_linePrefix: done via TEXTAREA execCommand`);
            this._saveSel(); return;
        }
        this._replaceRangeText(toggle);
        this._clearSlateSelection();
        Logger.info(PLUGIN_NAME, `_linePrefix: done via replaceRangeText`);
    }

    _numbered() {
        Logger.info(PLUGIN_NAME, `_numbered: start`);
        this._restoreSel();
        const ta = this._ta(); if (!ta) { Logger.info(PLUGIN_NAME, `_numbered: no ta`); return; }
        const toggle = (txt) => {
            const lines = txt.split("\n");
            const nonEmpty = lines.filter(l => l.trim() !== "");
            const all = nonEmpty.length > 0 && nonEmpty.every(l => /^\d+\.\s/.test(l));
            if (all) {
                return lines.map(l => l.replace(/^\d+\.\s/, "")).join("\n");
            }
            let counter = 1;
            return lines.map(l => l.trim() === "" ? l : `${counter++}. ${l}`).join("\n");
        };
        const doneSlate = this._replaceOnSlate((selected) => toggle(selected));
        if (doneSlate) { Logger.info(PLUGIN_NAME, `_numbered: done via slate`); return; }
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            if (s === e) { Logger.info(PLUGIN_NAME, `_numbered: TEXTAREA collapsed`); return; }
            const full = ta.value ?? "";
            const rep = toggle(full.slice(s, e));
            ta.focus(); ta.setSelectionRange(s, e);
            document.execCommand("insertText", false, rep);
            ta.setSelectionRange(s, s + rep.length);
            Logger.info(PLUGIN_NAME, `_numbered: done via TEXTAREA execCommand`);
            this._saveSel(); return;
        }
        this._replaceRangeText(toggle);
        this._clearSlateSelection();
        Logger.info(PLUGIN_NAME, `_numbered: done via replaceRangeText`);
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

    _isPrefixActive(ta, prefix) {
        let sel = "";
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            sel = ta.value?.slice(s, e) ?? "";
        } else {
            sel = this._getSelectedText();
        }
        if (!sel) return false;
        // FIX: пустые строки не учитываются при проверке активности (как и в _linePrefix)
        const nonEmpty = sel.split("\n").filter(l => l !== "");
        return nonEmpty.length > 0 && nonEmpty.every(l => l.startsWith(prefix));
    }

    _isNumberedActive(ta) {
        let sel = "";
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            sel = ta.value?.slice(s, e) ?? "";
        } else {
            sel = this._getSelectedText();
        }
        if (!sel) return false;
        // FIX: пустые строки игнорируются при проверке активности
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
        let sel = "";
        if (ta.tagName === "TEXTAREA") {
            let s = ta.selectionStart, e = ta.selectionEnd;
            if (s === e && this._snap?.type === "textarea") { s = this._snap.start; e = this._snap.end; }
            sel = ta.value?.slice(s, e) ?? "";
        } else {
            sel = this._getSelectedText();
        }
        return ANSI_RE().test(sel);
    }

    _ta() {
        const ae = document.activeElement;
        if (ae?.matches?.('div[contenteditable="true"]')) {
            Logger.info(PLUGIN_NAME, `_ta: via activeElement`);
            return ae;
        }

        const sel = window.getSelection();
        if (sel?.anchorNode) {
            const ce = sel.anchorNode.nodeType === 1
                ? sel.anchorNode.closest?.('div[contenteditable="true"]')
                : sel.anchorNode.parentElement?.closest?.('div[contenteditable="true"]');
            if (ce) {
                Logger.info(PLUGIN_NAME, `_ta: via selection anchorNode`);
                return ce;
            }
        }

        const cls = Webpack.getByKeys("channelTextArea", "textArea");
        const key = cls?.textArea?.split(" ")[0];
        const all = key
            ? [...document.querySelectorAll(`.${key}`)]
            : [...document.querySelectorAll('[class*="textArea_"]')];

        if (sel?.anchorNode) {
            const bySel = all.find(el => el.contains(sel.anchorNode));
            if (bySel) {
                Logger.info(PLUGIN_NAME, `_ta: via textArea contains anchorNode`);
                return bySel;
            }
        }
        const byActive = all.find(el => el.contains(document.activeElement));
        if (byActive) {
            Logger.info(PLUGIN_NAME, `_ta: via textArea contains activeElement`);
            return byActive;
        }
        const result = all[0] ?? document.querySelector('div[contenteditable="true"]');
        Logger.info(PLUGIN_NAME, `_ta: fallback result=${result ? result.tagName : 'null'}`);
        return result;
    }

    // Ищет Slate-редактор несколькими способами, т.к. путь sn.ref.current.getSlateEditor()
    // работает не во всех версиях Discord. Проходим по React-fiber дереву вверх.
    _getSlate(ta) {
        if (!ta) return null;

        // Способ 1: стандартный путь через getOwnerInstance
        try {
            const sn = ReactUtils.getOwnerInstance(ta);
            const sl = sn?.ref?.current?.getSlateEditor?.();
            if (sl) { Logger.info(PLUGIN_NAME, `_getSlate: way1 getOwnerInstance.ref.current.getSlateEditor`); return sl; }
        } catch (_) {}

        // Способ 2: ходим по React-fiber вверх, ищем getSlateEditor / editorRef / memoizedState.editor
        try {
            const fiberKey = Object.keys(ta).find(k => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
            if (!fiberKey) { Logger.info(PLUGIN_NAME, `_getSlate: no fiber key on ta`); return null; }
            let fiber = ta[fiberKey];
            let depth = 0;
            while (fiber && depth < 150) {
                depth++;
                // stateNode.getSlateEditor()
                if (typeof fiber.stateNode?.getSlateEditor === "function") {
                    const sl = fiber.stateNode.getSlateEditor();
                    if (sl) { Logger.info(PLUGIN_NAME, `_getSlate: way2a stateNode.getSlateEditor depth=${depth}`); return sl; }
                }
                // memoizedProps.editorRef.current (содержит Slate editor)
                const editorRef = fiber.memoizedProps?.editorRef ?? fiber.pendingProps?.editorRef;
                if (editorRef?.current?.selection !== undefined && editorRef?.current?.apply) {
                    Logger.info(PLUGIN_NAME, `_getSlate: way2b memoizedProps.editorRef depth=${depth}`);
                    return editorRef.current;
                }
                // memoizedState: ищем поле editor с .selection и .apply
                let ms = fiber.memoizedState;
                while (ms) {
                    const ed = ms.memoizedState ?? ms.queue?.lastRenderedState;
                    if (ed?.selection !== undefined && typeof ed?.apply === "function") {
                        Logger.info(PLUGIN_NAME, `_getSlate: way2c memoizedState.editor depth=${depth}`);
                        return ed;
                    }
                    ms = ms.next;
                }
                fiber = fiber.return;
            }
            Logger.info(PLUGIN_NAME, `_getSlate: not found after ${depth} fibers`);
        } catch (err) {
            Logger.info(PLUGIN_NAME, `_getSlate: fiber walk error: ${err?.message}`);
        }
        return null;
    }

    _saveSel() {
        const ta = this._ta();
        if (!ta) { Logger.info(PLUGIN_NAME, `_saveSel: no ta`); return; }
        if (ta.tagName === "TEXTAREA") {
            const { selectionStart: s, selectionEnd: e } = ta;
            if (s !== e) {
                this._snap = { type: "textarea", start: s, end: e };
                Logger.info(PLUGIN_NAME, `_saveSel: TEXTAREA s=${s} e=${e}`);
            } else {
                Logger.info(PLUGIN_NAME, `_saveSel: TEXTAREA collapsed — snap not saved`);
            }
            return;
        }
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
            try {
                const sl = this._getSlate(ta);
                const slateSel = sl?.selection ? JSON.parse(JSON.stringify(sl.selection)) : null;
                this._snap = { type: "range", range: sel.getRangeAt(0).cloneRange(), ta, sl, slateSel };
                Logger.info(PLUGIN_NAME, `_saveSel: range saved sl=${!!sl} slateSel=${!!slateSel} text="${sel.toString().slice(0, 40)}"`);
            } catch (err) {
                this._snap = null;
                Logger.info(PLUGIN_NAME, `_saveSel: error saving snap: ${err?.message}`);
            }
        } else {
            this._snap = null;
            Logger.info(PLUGIN_NAME, `_saveSel: no selection (collapsed=${sel?.isCollapsed}) — snap cleared`);
        }
    }

    _restoreSel() {
        const snap = this._snap;
        if (!snap) { Logger.info(PLUGIN_NAME, `_restoreSel: no snap`); return; }
        const ta = this._ta();
        if (!ta) { Logger.info(PLUGIN_NAME, `_restoreSel: no ta`); return; }
        if (snap.type === "textarea" && ta.tagName === "TEXTAREA") {
            ta.focus(); ta.setSelectionRange(snap.start, snap.end);
            Logger.info(PLUGIN_NAME, `_restoreSel: TEXTAREA restored s=${snap.start} e=${snap.end}`);
            return;
        }
        if (snap.type === "range") {
            const target = snap.ta ?? ta;
            // Важно: сначала восстанавливаем DOM Range, потом фокусируем.
            // Если сделать наоборот — Slate's onFocus срабатывает и сбрасывает
            // editor.selection по текущему (collapsed) DOM-выделению.
            let rangeOk = false;
            try {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(snap.range);
                rangeOk = !sel.isCollapsed;
            } catch (err) {
                Logger.info(PLUGIN_NAME, `_restoreSel: addRange failed: ${err?.message}`);
            }
            target.focus();
            // FIX: sl.selection НЕ восстанавливаем здесь — это делает _replaceOnSlate
            // непосредственно перед использованием Slate API.
            // Если восстанавливать здесь, а потом применить execCommand (ANSI и др.),
            // DOM меняется без уведомления Slate → "Cannot resolve a DOM point" при ре-рендере.
            Logger.info(PLUGIN_NAME, `_restoreSel: rangeOk=${rangeOk} slateSel=${!!snap.slateSel}`);
        }
    }

    _getSelectedText() {
        const sel = window.getSelection();
        if (sel?.rangeCount && !sel.isCollapsed) return sel.toString();
        return "";
    }

    // После execCommand-операций Slate сохраняет старый sl.selection (устаревший).
    // При ре-рендере React он пытается разрешить DOM-точки по этим old-офсетам
    // → "Cannot resolve a DOM point from Slate point" / "removeChild" ошибки.
    // Обнуляем selection → Slate не пытается навигировать к невалидным координатам.
    _clearSlateSelection() {
        const sl = this._snap?.sl;
        if (sl) { try { sl.selection = null; } catch (_) {} }
    }

    _replaceRangeText(transformFn) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount < 1 || sel.isCollapsed) {
            Logger.info(PLUGIN_NAME, `_replaceRangeText: no selection (collapsed=${sel?.isCollapsed} rangeCount=${sel?.rangeCount})`);
            return;
        }
        const selected = sel.toString();
        if (!selected) { Logger.info(PLUGIN_NAME, `_replaceRangeText: empty text`); return; }
        const rep = transformFn(selected);
        if (typeof rep !== "string" || rep === selected) {
            Logger.info(PLUGIN_NAME, `_replaceRangeText: noop (rep===selected)`);
            return;
        }
        Logger.info(PLUGIN_NAME, `_replaceRangeText: execCommand "${selected.slice(0, 40)}" → "${rep.slice(0, 40)}"`);
        document.execCommand("insertText", false, rep);
    }

    _replaceOnSlate(transformFn) {
        const ta = this._ta();
        if (!ta || ta.tagName === "TEXTAREA") return false;
        const sl = this._getSlate(ta);
        // FIX: восстанавливаем sl.selection здесь, прямо перед Slate API —
        // а не в _restoreSel, иначе execCommand-операции (ANSI) меняют DOM
        // без уведомления Slate и возникает "Cannot resolve a DOM point".
        if (sl && this._snap?.slateSel) {
            try { sl.selection = JSON.parse(JSON.stringify(this._snap.slateSel)); } catch (_) {}
        }
        const info = this._slateInfo(sl, this._snap?.slateSel ?? sl?.selection);
        if (!info) {
            Logger.info(PLUGIN_NAME, `_replaceOnSlate: no info sl=${!!sl} slateSel=${!!this._snap?.slateSel}`);
            return false;
        }
        const selected = info.text.slice(info.start, info.end);
        const rep = transformFn(selected);
        if (typeof rep !== "string" || rep === selected) {
            Logger.info(PLUGIN_NAME, `_replaceOnSlate: noop rep===selected="${selected.slice(0, 30)}"`);
            return true;
        }
        Logger.info(PLUGIN_NAME, `_replaceOnSlate: put path=${JSON.stringify(info.path)} "${selected.slice(0, 30)}" → "${rep.slice(0, 30)}"`);
        this._put(sl, info.path, info.start, info.end, rep, info.start, info.start + rep.length);
        ta.focus();
        return true;
    }

    _slateInfo(sl, selection = null) {
        const sel = selection ?? sl?.selection;
        if (!sel?.anchor || !sel?.focus) {
            Logger.info(PLUGIN_NAME, `_slateInfo: no anchor/focus`);
            return null;
        }
        const a = sel.anchor, f = sel.focus;
        if (JSON.stringify(a.path) !== JSON.stringify(f.path)) {
            Logger.info(PLUGIN_NAME, `_slateInfo: cross-node a=${JSON.stringify(a.path)} f=${JSON.stringify(f.path)}`);
            return null;
        }
        const start = Math.min(a.offset, f.offset);
        const end   = Math.max(a.offset, f.offset);
        if (start === end) {
            Logger.info(PLUGIN_NAME, `_slateInfo: collapsed offset=${start}`);
            return null;
        }
        const path = a.path;
        // FIX: идём через .children на каждом уровне:
        // path=[0,0] → sl.children[0].children[0], а не sl.children[0][0]
        let node = sl;
        for (const idx of path) node = node?.children?.[idx];
        const text = typeof node?.text === "string" ? node.text : "";
        if (!text) {
            Logger.info(PLUGIN_NAME, `_slateInfo: node has no text path=${JSON.stringify(path)}`);
            return null;
        }
        Logger.info(PLUGIN_NAME, `_slateInfo: ok path=${JSON.stringify(path)} start=${start} end=${end} text="${text.slice(start, end).slice(0, 30)}"`);
        return { path, start, end, text };
    }

    _put(sl, path, start, end, rep, ss, se) {
        // FIX: идём через .children на каждом уровне (как в _slateInfo)
        const cn = path.reduce((a, i) => a?.children?.[i], sl);
        const cur = typeof cn?.text === "string" ? cn.text : "";
        const rem = cur.slice(start, end);
        Logger.info(PLUGIN_NAME, `_put: path=${JSON.stringify(path)} rem="${rem.slice(0, 30)}" rep="${rep.slice(0, 30)}"`);
        if (rem.length) sl.apply({ type: "remove_text", path, offset: start, text: rem });
        if (rep.length) sl.apply({ type: "insert_text", path, offset: start, text: rep });
        sl.selection = {
            anchor: { path: [...path], offset: ss },
            focus:  { path: [...path], offset: se },
        };
        Logger.info(PLUGIN_NAME, `_put: done`);
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
