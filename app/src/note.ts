// 질문 입력창(종이 쪽지). 한글 조합 입력, 끼어드는 단어, 단계별 글자 수 제한을 다룬다(docs/05).
// 입력창 내용은 "글자"와 "끼어든 단어" 조각의 목록으로 보고, 끼어든 단어는 파란 잉크 span으로 그린다.

type Segment = { kind: "text"; value: string } | { kind: "intruded"; word: string } | { kind: "erasing"; value: string };

export type NoteContent = {
  judgeText: string; // 판정에 보낼 문장(끼어든 단어 제외)
  displayText: string; // 교신 기록에 남는 문장
  intruded: string[]; // 지우지 않고 남긴 끼어든 단어
};

export class NoteInput {
  private composing = false;
  private idleTimer: number | undefined;
  private eraseTimer: number | undefined;
  private enabled = true;

  constructor(
    private el: HTMLDivElement,
    private counter: HTMLElement,
    private opts: {
      limit: () => number;
      showCounter: () => boolean;
      onSubmit: () => void;
      onIdle?: () => void; // 입력을 멈추고 0.5초 뒤(한글은 조합이 끝난 뒤부터 센다)
      erase?: (text: string) => [number, number][]; // 오염 3단계부터 지워지는 단어
    },
  ) {
    el.contentEditable = "true";
    el.spellcheck = false;
    el.addEventListener("compositionstart", () => {
      this.composing = true;
      window.clearTimeout(this.idleTimer);
    });
    el.addEventListener("compositionend", () => {
      this.composing = false;
      this.afterEdit();
    });
    el.addEventListener("beforeinput", (e) => {
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
        e.preventDefault();
        return;
      }
      // 조합 중이 아닌 입력은 제한에 닿으면 막는다. 조합 입력은 조합이 끝난 뒤 잘라낸다.
      if (!this.composing && e.inputType.startsWith("insert") && e.inputType !== "insertCompositionText") {
        const adding = e.data?.length ?? 1;
        if (this.length() + adding > this.opts.limit()) e.preventDefault();
      }
    });
    el.addEventListener("input", () => {
      if (!this.composing) this.afterEdit();
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && !this.composing) {
        e.preventDefault();
        this.opts.onSubmit();
      }
    });
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " ");
      document.execCommand("insertText", false, text.slice(0, Math.max(0, this.opts.limit() - this.length())));
    });
    this.updateCounter();
  }

  private segments(): Segment[] {
    const out: Segment[] = [];
    const push = (value: string) => {
      const last = out[out.length - 1];
      if (last?.kind === "text") last.value += value;
      else if (value) out.push({ kind: "text", value });
    };
    for (const node of this.el.childNodes) {
      if (node instanceof HTMLElement && node.dataset.erasing) {
        out.push({ kind: "erasing", value: node.textContent ?? "" });
      } else if (node instanceof HTMLElement && node.dataset.word) {
        // 끼어든 단어를 일부라도 고쳤으면 더는 끼어든 단어가 아니다(남은 글자는 일반 글자)
        if (node.textContent === node.dataset.word) out.push({ kind: "intruded", word: node.dataset.word });
        else push(node.textContent ?? "");
      } else {
        push((node.textContent ?? "").replace(/\n/g, " "));
      }
    }
    return out;
  }

  private render(segs: Segment[]) {
    this.el.replaceChildren(
      ...segs.map((s) => {
        if (s.kind === "text") return document.createTextNode(s.value);
        if (s.kind === "erasing") {
          const e = document.createElement("span");
          e.className = "erasing";
          e.dataset.erasing = "1";
          e.textContent = s.value;
          return e;
        }
        const span = document.createElement("span");
        span.className = "intruded";
        span.dataset.word = s.word;
        span.textContent = s.word;
        return span;
      }),
    );
  }

  private caretIndex(): number | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !this.el.contains(sel.anchorNode)) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(this.el);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    return range.toString().length;
  }

  private setCaret(index: number) {
    const sel = window.getSelection();
    if (!sel) return;
    const walker = document.createTreeWalker(this.el, NodeFilter.SHOW_TEXT);
    let left = index;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (left <= len) {
        const r = document.createRange();
        r.setStart(node, left);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
      left -= len;
    }
    const r = document.createRange();
    r.selectNodeContents(this.el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  private length() {
    return (this.el.textContent ?? "").length;
  }

  private afterEdit() {
    const segs = this.segments();
    const limit = this.opts.limit();
    let total = segs.reduce((a, s) => a + (s.kind === "intruded" ? s.word.length : s.value.length), 0);
    const hadSpans = this.el.querySelectorAll("span").length;
    const keptSpans = segs.filter((s) => s.kind === "intruded").length;
    if (total > limit) {
      // 넘친 만큼 뒤쪽의 플레이어 글자부터 잘라낸다
      for (let i = segs.length - 1; i >= 0 && total > limit; i--) {
        const s = segs[i];
        if (s.kind !== "text") continue;
        const cut = Math.min(s.value.length, total - limit);
        s.value = s.value.slice(0, s.value.length - cut);
        total -= cut;
      }
      this.render(segs.filter((s) => s.kind !== "text" || s.value));
      this.setCaret(total);
    } else if (hadSpans !== keptSpans) {
      const caret = this.caretIndex();
      this.render(segs);
      if (caret != null) this.setCaret(caret);
    }
    this.updateCounter();
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.composing && this.enabled) this.opts.onIdle?.();
    }, 500);
    if (this.opts.erase) {
      window.clearTimeout(this.eraseTimer);
      this.eraseTimer = window.setTimeout(() => this.markErasing(), 300);
    }
  }

  // 입력하면 잠깐 보였다가 1초 뒤 잉크가 물에 풀리듯 사라진다(docs/05)
  private markErasing() {
    if (this.composing || !this.opts.erase) return;
    const segs = this.segments();
    const out: Segment[] = [];
    let found = false;
    for (const s of segs) {
      if (s.kind !== "text") {
        out.push(s);
        continue;
      }
      const ranges = this.opts.erase(s.value);
      let pos = 0;
      for (const [a, b] of ranges) {
        if (a > pos) out.push({ kind: "text", value: s.value.slice(pos, a) });
        out.push({ kind: "erasing", value: s.value.slice(a, b) });
        pos = b;
        found = true;
      }
      if (pos < s.value.length) out.push({ kind: "text", value: s.value.slice(pos) });
    }
    if (!found) return;
    const caret = this.caretIndex();
    this.render(out);
    if (caret != null) this.setCaret(caret);
    window.setTimeout(() => this.removeErasing(), 800);
  }

  private removeErasing() {
    if (this.composing) {
      window.setTimeout(() => this.removeErasing(), 300);
      return;
    }
    const segs = this.segments();
    if (!segs.some((s) => s.kind === "erasing")) return;
    const caret = this.caretIndex();
    let removedBefore = 0;
    let pos = 0;
    for (const s of segs) {
      const len = s.kind === "intruded" ? s.word.length : s.value.length;
      if (s.kind === "erasing" && caret != null && pos < caret) removedBefore += Math.min(len, caret - pos);
      pos += len;
    }
    this.render(segs.filter((s) => s.kind !== "erasing"));
    if (caret != null) this.setCaret(caret - removedBefore);
    this.updateCounter();
  }

  updateCounter() {
    this.counter.hidden = !this.opts.showCounter();
    this.counter.textContent = `${this.length()} / ${this.opts.limit()}`;
  }

  // 끼어드는 단어를 문장 가운데 띄어쓰기 자리에 슬며시 넣는다
  intrude(word: string, index: number) {
    if (this.composing) return false;
    const segs = this.segments();
    const caret = this.caretIndex();
    const out: Segment[] = [];
    let pos = 0;
    let inserted = false;
    for (const s of segs) {
      const len = s.kind === "intruded" ? s.word.length : s.value.length;
      if (!inserted && s.kind === "text" && index >= pos && index <= pos + len) {
        const at = index - pos;
        out.push({ kind: "text", value: s.value.slice(0, at) + " " });
        out.push({ kind: "intruded", word });
        out.push({ kind: "text", value: (s.value.slice(at).startsWith(" ") ? "" : " ") + s.value.slice(at) });
        inserted = true;
      } else out.push(s);
      pos += len;
    }
    if (!inserted) out.push({ kind: "text", value: " " }, { kind: "intruded", word });
    this.render(out.filter((s) => s.kind !== "text" || s.value));
    if (caret != null) this.setCaret(caret > index ? caret + word.length + 2 : caret);
    this.updateCounter();
    return true;
  }

  plainText(): string {
    return this.segments()
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
  }

  content(): NoteContent {
    const segs = this.segments();
    const squash = (t: string) => t.replace(/\s+/g, " ").trim();
    return {
      judgeText: squash(segs.map((s) => (s.kind === "text" ? s.value : " ")).join("")),
      displayText: squash(segs.map((s) => (s.kind === "text" ? s.value : s.kind === "intruded" ? s.word : " ")).join("")),
      intruded: segs.flatMap((s) => (s.kind === "intruded" ? [s.word] : [])),
    };
  }

  clear() {
    this.el.replaceChildren();
    this.updateCounter();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.el.contentEditable = on ? "true" : "false";
    this.el.classList.toggle("disabled", !on);
    if (on) this.el.focus();
  }
}
