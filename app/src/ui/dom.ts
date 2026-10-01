export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 게임 속 선택지 대화상자. 고른 버튼의 인덱스를 돌려준다.
export function choose(message: string, buttons: string[]): Promise<number> {
  return new Promise((resolve) => {
    const back = el("div", "modal");
    const box = el("div", "modal-box");
    box.append(el("p", "", escapeHtml(message)));
    const row = el("div", "modal-buttons");
    buttons.forEach((label, i) => {
      const b = el("button", i === 0 ? "primary" : "");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        back.remove();
        resolve(i);
      });
      row.append(b);
    });
    box.append(row);
    back.append(box);
    document.body.append(back);
    (row.firstChild as HTMLButtonElement).focus();
  });
}
