import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder, Decoration} from "@codemirror/view";
import {EditorState, StateField, StateEffect} from "@codemirror/state";
import {defaultKeymap, history, historyKeymap, indentWithTab} from "@codemirror/commands";
import {indentUnit, bracketMatching, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting, HighlightStyle} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap} from "@codemirror/autocomplete";
import {searchKeymap, highlightSelectionMatches} from "@codemirror/search";
import {lintGutter, setDiagnostics, lintKeymap} from "@codemirror/lint";
import {python} from "@codemirror/lang-python";
import {tags as t} from "@lezer/highlight";
import {indentationMarkers} from "@replit/codemirror-indentation-markers";

// Colours come from the page's CSS variables, so light/dark follow the page (VS Code Light+ / Dark+ values).
const v = n => `var(--${n})`;
const vsHighlight = HighlightStyle.define([
  {tag: [t.controlKeyword, t.moduleKeyword], color: v("syn-kw")},
  {tag: [t.definitionKeyword, t.operatorKeyword, t.keyword, t.bool, t.null, t.self], color: v("syn-kw2")},
  {tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)], color: v("syn-fn")},
  {tag: [t.variableName, t.definition(t.variableName), t.propertyName], color: v("syn-var")},
  {tag: [t.className, t.definition(t.className)], color: v("syn-type")},
  {tag: [t.string, t.special(t.string)], color: v("syn-str")},
  {tag: t.escape, color: v("syn-num")},
  {tag: t.number, color: v("syn-num")},
  {tag: [t.comment, t.lineComment], color: v("syn-com")},
  {tag: [t.modifier], color: v("syn-kw2")},
]);

const vsTheme = EditorView.theme({
  "&": {backgroundColor: v("code-bg"), color: v("syn-text"), fontSize: "14px", border: `1px solid ${v("line")}`, borderRadius: "10px", maxHeight: "480px", overflow: "hidden"},
  "&.cm-focused": {outline: `3px solid ${v("teal")}`, outlineOffset: "2px"},
  ".cm-scroller": {fontFamily: v("mono"), lineHeight: "21px", minHeight: "230px", overflow: "auto", fontVariantLigatures: "none"},
  ".cm-content": {caretColor: v("syn-text"), padding: "10px 0"},
  ".cm-cursor, .cm-dropCursor": {borderLeftColor: v("syn-text"), borderLeftWidth: "2px"},
  ".cm-gutters": {backgroundColor: v("code-bg"), color: v("syn-gut"), border: "none"},
  ".cm-lineNumbers .cm-gutterElement": {padding: "0 10px 0 12px", minWidth: "4ch"},
  ".cm-activeLine": {backgroundColor: v("syn-active")},
  ".cm-activeLineGutter": {backgroundColor: "transparent", color: v("syn-text")},
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {backgroundColor: `${v("syn-sel")} !important`},
  ".cm-selectionMatch": {backgroundColor: v("syn-match")},
  "&.cm-focused .cm-matchingBracket": {backgroundColor: v("syn-bracket"), outline: `1px solid ${v("syn-gut")}`},
  ".cm-placeholder": {color: v("syn-gut")},
  ".cm-errLine": {backgroundColor: v("syn-bad")},
  ...Object.fromEntries(Object.entries({logic: "#E5484D", punc: "#E2B200", spell: "#A56DE2", miss: "#3D8BEA", indent: "#2FA36B"}).flatMap(([k, c]) => [
    [`.cm-errLine.cm-e-${k}`, {backgroundColor: v(`e-${k}-line`)}],
    [`.cm-lintRange.cm-e-${k}`, {backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3"><path d="m0 2.5 l2 -1.5 l1 0 l2 1.5 l1 0" stroke="${c}" fill="none" stroke-width="1"/></svg>`)}")`}],
  ])),
  ".cm-foldGutter .cm-gutterElement": {color: v("syn-gut"), padding: "0 4px"},
  ".cm-tooltip": {backgroundColor: v("surface"), color: v("ink"), border: `1px solid ${v("line")}`, borderRadius: "6px", fontFamily: v("body")},
  ".cm-tooltip-autocomplete > ul": {fontFamily: v("mono"), fontSize: "13px"},
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {backgroundColor: v("syn-sel"), color: v("syn-text")},
  ".cm-completionDetail": {color: v("muted")},
  ".cm-diagnostic": {padding: "6px 10px", fontFamily: v("body")},
  ".cm-diagnostic-error": {borderLeft: `4px solid ${v("bad")}`},
  ".cm-panels": {backgroundColor: v("sunk"), color: v("ink")},
  ".cm-panels.cm-panels-bottom": {borderTop: `1px solid ${v("line")}`},
  ".cm-panel input, .cm-panel button, .cm-panel label": {fontFamily: v("body"), fontSize: "13px"},
  ".cm-textfield": {backgroundColor: v("code-bg"), color: v("syn-text"), border: `1px solid ${v("line")}`},
  ".cm-button": {backgroundImage: "none", backgroundColor: v("surface"), color: v("ink"), border: `1px solid ${v("line")}`},
});

// Red background on lines with problems (moves with the text when you edit).
const setErr = StateEffect.define();
const SEV = {logic: "error", punc: "warning", miss: "info", spell: "info", indent: "info"};
const errLine = {};
for(const k of Object.keys(SEV)) errLine[k] = Decoration.line({class: "cm-errLine cm-e-" + k});
const errField = StateField.define({
  create: () => Decoration.none,
  update(d, tr){ d = d.map(tr.changes); for(const e of tr.effects) if(e.is(setErr)) d = e.value; return d; },
  provide: f => EditorView.decorations.from(f),
});

function create(parent, doc, opts){
  const {placeholderText = "", label = "Code editor", onChange = () => {}} = opts || {};
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(), foldGutter(), highlightActiveLineGutter(),
        highlightSpecialChars(), history(), drawSelection(), dropCursor(),
        EditorState.allowMultipleSelections.of(true), indentOnInput(),
        bracketMatching(), closeBrackets(), autocompletion(), rectangularSelection(), crosshairCursor(),
        highlightActiveLine(), highlightSelectionMatches(),
        indentationMarkers({colors: {light: v("syn-guide"), dark: v("syn-guide"), activeLight: v("syn-guide-active"), activeDark: v("syn-guide-active")}}),
        EditorState.tabSize.of(4), indentUnit.of("    "),
        python(), syntaxHighlighting(vsHighlight), vsTheme, errField,
        placeholder(placeholderText),
        EditorView.contentAttributes.of({"aria-label": label, spellcheck: "false", autocorrect: "off", autocapitalize: "off"}),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        EditorView.updateListener.of(u => { if(u.docChanged) onChange(u.state.doc.toString()); }),
      ],
    }),
  });
  return {
    view,
    focus: () => view.focus(),
    getValue: () => view.state.doc.toString(),
    // items: [{line, msg}] (or plain line numbers with one shared msg)
    setErrors(items, msg){
      const d = view.state.doc, byLine = new Map(), list = [];
      for(const it of items || []){
        const line = typeof it === "number" ? it : it.line, m = (typeof it === "number" ? msg : it.msg) || "There's a problem on this line.";
        const kind = (typeof it === "object" && SEV[it.kind]) ? it.kind : "logic";
        if(!Number.isInteger(line) || line < 1 || line > d.lines) continue;
        list.push({line, m, kind});
        if(!byLine.has(line)) byLine.set(line, kind);
      }
      const ok = [...byLine.keys()].sort((a, b) => a - b);
      const diags = list.sort((a, b) => a.line - b.line).map(({line, m, kind}) => {
        const l = d.line(line), lead = l.text.match(/^\s*/)[0].length, from = l.from + lead;
        return {from, to: Math.max(from, l.to), severity: SEV[kind], message: m, markClass: "cm-e-" + kind};
      });
      view.dispatch(setDiagnostics(view.state, diags));
      const effects = [setErr.of(Decoration.set(ok.map(n => errLine[byLine.get(n)].range(d.line(n).from)), true))];
      if(ok.length) effects.push(EditorView.scrollIntoView(d.line(ok[0]).from, {y: "center"}));
      view.dispatch({effects});
    },
  };
}
window.CM = {create};
