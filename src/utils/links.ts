/**
 * 앱 안의 글 · 댓글 · 이미지를 가리키는 링크 (마크다운 링크 문법 그대로)
 *   글(메모·할일): [제목](memo:글uid)
 *   댓글:          [제목 › 댓글](memo:글uid#c-댓글id)
 *   이미지:        [이미지 이름](memo-img:이미지id)     ← 앞에 ! 를 붙이면 그림으로 표시
 * uid와 댓글·이미지 id는 백업으로 다른 기기에 옮겨도 그대로라 링크가 유지된다.
 */

export const MEMO_PROTOCOL = 'memo:';
const IMG_PROTOCOL = 'memo-img:'; // utils/image.ts와 같은 값 (이 파일은 가볍게 유지)

export type RefTarget =
    | {type: 'memo'; uid: string}
    | {type: 'comment'; uid: string; commentId: string}
    | {type: 'image'; imageId: string};

const ID = '[A-Za-z0-9][A-Za-z0-9-]*';
const MEMO_HREF = new RegExp(`^memo:(${ID})(?:#c-(${ID}))?$`);
const IMG_HREF = new RegExp(`^memo-img:(${ID})$`);

export function parseRef(href: string | undefined): RefTarget | null {
    if (!href) return null;
    const m = MEMO_HREF.exec(href);
    if (m) return m[2] ? {type: 'comment', uid: m[1], commentId: m[2]} : {type: 'memo', uid: m[1]};
    const i = IMG_HREF.exec(href);
    return i ? {type: 'image', imageId: i[1]} : null;
}

export const isRefHref = (href: string) => href.startsWith(MEMO_PROTOCOL) || href.startsWith(IMG_PROTOCOL);

export const refHref = (t: RefTarget) =>
    t.type === 'image' ? `${IMG_PROTOCOL}${t.imageId}` : `${MEMO_PROTOCOL}${t.uid}${t.type === 'comment' ? `#c-${t.commentId}` : ''}`;

/** 링크 글자에 [ ] 가 있으면 문법이 깨지므로 바꿔 넣는다 */
const cleanLabel = (s: string) => s.replace(/[[\]]/g, m => (m === '[' ? '(' : ')')).replace(/\s+/g, ' ').trim() || '링크';

export const refMarkdown = (label: string, t: RefTarget) => `[${cleanLabel(label)}](${refHref(t)})`;

/** 댓글 링크 글자: "제목 › 댓글 앞부분" */
export const commentLabel = (memoTitle: string, comment: string) => {
    const head = comment.replace(/[#>*_`~[\]()!-]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${memoTitle} › ${head.length > 20 ? `${head.slice(0, 20)}…` : head || '댓글'}`;
};

/** 본문에서 다른 글을 가리키는 링크(uid)들 — 역링크 계산용 */
export function linkedUids(text: string): string[] {
    const out = new Set<string>();
    const re = new RegExp(`\\]\\(memo:(${ID})(?:#c-${ID})?\\)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.add(m[1]);
    return [...out];
}

/** 링크 문법을 글자만 남긴다 (제목 자동 생성 · 보고용 텍스트) */
export const stripRefs = (text: string) => text.replace(/(^|[^!])\[([^\]]*)\]\((?:memo|memo-img):[^)\s]*\)/g, '$1$2');
