/** 편집기 본문 편집 도우미 (순수 함수 + 되돌리기가 유지되는 입력) */

export interface EditResult {
    text: string;
    selStart: number;
    selEnd: number;
}

export const LIST_LINE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]|$)/;
const UNIT = '  ';

export const isListLine = (line: string) => LIST_LINE.test(line);
const indentOf = (line: string) => (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length;

function lineStarts(lines: string[]) {
    const starts: number[] = [];
    let acc = 0;
    lines.forEach(l => {
        starts.push(acc);
        acc += l.length + 1;
    });
    return starts;
}

function lineAt(starts: number[], pos: number) {
    let i = starts.length - 1;
    while (i > 0 && starts[i] > pos) i--;
    return i;
}

/** 커서가 있는 줄 */
export function currentLine(text: string, pos: number) {
    const s = text.lastIndexOf('\n', pos - 1) + 1;
    const e = text.indexOf('\n', pos);
    return text.slice(s, e < 0 ? text.length : e);
}

/** 목록 항목 i의 하위 줄(더 깊이 들여쓴 줄) 번호들. 사이의 빈 줄은 뒤에 하위 줄이 이어질 때만 포함 */
function subtree(lines: string[], i: number) {
    const base = indentOf(lines[i]);
    const out: number[] = [];
    let j = i + 1;
    while (j < lines.length) {
        if (!lines[j].trim()) {
            let k = j + 1;
            while (k < lines.length && !lines[k].trim()) k++;
            if (k < lines.length && indentOf(lines[k]) > base) {
                for (let x = j; x <= k; x++) out.push(x);
                j = k + 1;
                continue;
            }
            break;
        }
        if (indentOf(lines[j]) <= base) break;
        out.push(j);
        j++;
    }
    return out;
}

/**
 * 선택한 줄을 한 단계 들여쓰기(dir=1) / 내어쓰기(dir=-1).
 * 목록 항목을 옮기면 그 하위 항목도 함께 옮겨 구조가 유지된다.
 * 바꿀 것이 없으면 null.
 */
export function shiftLines(text: string, selStart: number, selEnd: number, dir: 1 | -1): EditResult | null {
    const lines = text.split('\n');
    const starts = lineStarts(lines);
    const a = lineAt(starts, selStart);
    let b = lineAt(starts, selEnd);
    if (selEnd > selStart && selEnd === starts[b] && b > a) b--; // 다음 줄 맨 앞까지 선택한 경우 그 줄은 제외

    const target = new Set<number>();
    for (let i = a; i <= b; i++) {
        if (!lines[i].trim()) continue;
        if (dir < 0 && indentOf(lines[i]) === 0) continue; // 더 내어쓸 수 없는 줄(과 그 하위)은 그대로
        target.add(i);
        if (isListLine(lines[i])) subtree(lines, i).forEach(j => target.add(j));
    }
    if (!target.size) return null;

    if (dir > 0) {
        // 목록 항목은 바로 위 항목보다 한 단계까지만 깊어질 수 있다 (더 깊으면 마크다운이 코드 블록으로 바꿔 버림)
        const head = Math.min(...target);
        if (isListLine(lines[head])) {
            let p = head - 1;
            while (p >= 0 && !lines[p].trim()) p--;
            const max = p >= 0 && (isListLine(lines[p]) || /^[ \t]/.test(lines[p])) ? indentOf(lines[p]) + UNIT.length : 0;
            if (indentOf(lines[head]) + UNIT.length > max) return null;
        }
    }

    const delta = new Map<number, number>();
    target.forEach(i => {
        if (!lines[i].trim()) return;
        if (dir > 0) {
            lines[i] = UNIT + lines[i];
            delta.set(i, UNIT.length);
        } else {
            const n = /^( {1,2}|\t)/.exec(lines[i])?.[0].length ?? 0;
            lines[i] = lines[i].slice(n);
            delta.set(i, -n);
        }
    });

    const next = lineStarts(lines);
    const map = (pos: number) => {
        const i = lineAt(starts, pos);
        const col = pos - starts[i];
        return next[i] + Math.min(lines[i].length, Math.max(0, col + (delta.get(i) ?? 0)));
    };
    return {text: lines.join('\n'), selStart: map(selStart), selEnd: map(selEnd)};
}

/**
 * 바뀐 부분만 골라 브라우저 입력 명령으로 바꾼다 → Ctrl+Z 되돌리기 기록이 유지된다.
 * 지원하지 않는 환경이면 false (호출한 쪽에서 상태로 직접 바꿈)
 */
export function replaceWithUndo(el: HTMLTextAreaElement, next: string): boolean {
    const prev = el.value;
    if (prev === next) return true;
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
        endPrev--;
        endNext--;
    }
    const insert = next.slice(start, endNext);
    try {
        el.focus();
        el.setSelectionRange(start, endPrev);
        const ok = insert ? document.execCommand('insertText', false, insert) : document.execCommand('delete');
        return ok && el.value === next;
    } catch {
        return false;
    }
}
