// 단서 문서 보기와 두 문서 나란히 보기(docs/07: 필체 비교가 핵심 2의 열쇠라 필수).
import { DOC_TITLES, renderDoc, type DocContext, type DocId } from "../content/texts";
import type { Strings } from "../i18n";
import { el } from "./dom";

export class DocViewer {
  private root = el("div", "docview");
  private open: DocId[] = [];
  onClose?: () => void;

  constructor(
    private ctx: () => DocContext,
    private t: () => Strings,
    private found: () => DocId[],
  ) {
    this.root.hidden = true;
    document.body.append(this.root);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.root.hidden) {
        e.stopImmediatePropagation();
        this.close();
      }
    });
  }

  get isOpen() {
    return !this.root.hidden;
  }

  show(id: DocId) {
    this.open = [id];
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.open = [];
    this.onClose?.();
  }

  private render(picking = false) {
    const t = this.t();
    const ctx = this.ctx();
    this.root.replaceChildren();
    const bar = el("div", "docbar");
    const compare = el("button", "", t.compare);
    compare.type = "button";
    compare.disabled = this.open.length > 1 || this.found().length < 2;
    compare.addEventListener("click", () => this.render(true));
    const close = el("button", "", t.close);
    close.type = "button";
    close.addEventListener("click", () => this.close());
    bar.append(compare, close);
    this.root.append(bar);

    const panes = el("div", `docpanes n${this.open.length}`);
    for (const id of this.open) {
      const pane = el("article", `doc doc-${id}`);
      pane.append(el("h2", "doc-title", DOC_TITLES[id][ctx.lang]));
      pane.append(el("div", "doc-body", renderDoc(id, ctx)));
      panes.append(pane);
    }
    this.root.append(panes);

    if (picking) {
      const pick = el("div", "docpick");
      pick.append(el("p", "", t.compareHint));
      for (const id of this.found().filter((d) => !this.open.includes(d))) {
        const b = el("button", "", DOC_TITLES[id][ctx.lang]);
        b.type = "button";
        b.addEventListener("click", () => {
          this.open = [...this.open, id];
          this.render();
        });
        pick.append(b);
      }
      this.root.append(pick);
    }
    this.root.hidden = false;
  }
}
