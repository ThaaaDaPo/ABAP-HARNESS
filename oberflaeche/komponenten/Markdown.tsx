// Zeigt Markdown an – Antworten des Agenten und die Vorschau von Instructions (E-59).
//
// Sicher, weil der Text aus dem Modell, aus Tickets oder Quelltext stammen kann:
// 1. marked setzt HTML, das im Text steht, nicht um, sondern zeigt es als Text. So erscheinen auch
//    ABAP-Feldsymbole wie <ls_zeile> statt zu verschwinden.
// 2. Bilder werden nicht geladen, sondern als Link gezeigt – eine Bildadresse könnte sonst ohne Zutun
//    Daten an einen fremden Server schicken.
// 3. DOMPurify lässt danach nur eine feste Liste harmloser Tags durch und Links nur mit http(s)/mailto;
//    Links öffnen in einem neuen Tab ohne Zugriff auf die App.
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { useMemo } from "react";

function alsText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const markdown = new Marked({ gfm: true, async: false }).use({
  renderer: {
    html({ text }) {
      return alsText(text);
    },
    image({ href, text }) {
      return `<a href="${alsText(href)}">${alsText(text || "Bild")}</a>`;
    },
  },
});

const erlaubteTags = [
  "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "s", "code", "pre", "blockquote",
  "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "th", "td", "input",
];

const reinigung = {
  ALLOWED_TAGS: erlaubteTags,
  // input nur für Aufgabenlisten (- [x] erledigt): marked erzeugt sie deaktiviert
  ALLOWED_ATTR: ["href", "title", "start", "align", "type", "checked", "disabled"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

DOMPurify.addHook("afterSanitizeAttributes", (knoten) => {
  if (knoten.tagName === "A") {
    knoten.setAttribute("target", "_blank");
    knoten.setAttribute("rel", "noopener noreferrer");
  }
  if (knoten.tagName === "INPUT") knoten.setAttribute("disabled", "");
});

export function zuHtml(text: string): string {
  return DOMPurify.sanitize(markdown.parse(text) as string, reinigung);
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => zuHtml(text), [text]);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
