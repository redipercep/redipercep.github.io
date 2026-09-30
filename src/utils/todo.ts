/**
 * 할일은 마크다운 목록으로 작성하고, 상태와 날짜도 본문에 함께 적는다.
 *
 *   - [ ] 대기          - [/] 진행중          - [x] 완료          - [-] 보류
 *   - [/] 보고서 작성 🛫 2026-09-30 📅 2026-10-02 🔄 2026-09-30 10:20
 *
 *   🛫 시작일 · 📅 마감일 · 🔄 진행 시각 · ⏸️ 보류 시각 · ✅ 완료 시각
 *
 * 들여쓴 항목은 하위 항목이 된다. 본문에 모두 들어 있으므로 백업·복사해도 정보가 유지된다.
 */

export type TaskStatus = 'todo' | 'progress' | 'done' | 'hold';

export const STATUS_ORDER: TaskStatus[] = ['todo', 'progress', 'done', 'hold'];
export const STATUS_LABEL: Record<TaskStatus, string> = {todo: '대기', progress: '진행중', done: '완료', hold: '보류'};
const STATUS_CHAR: Record<TaskStatus, string> = {todo: ' ', progress: '/', done: 'x', hold: '-'};
const CHAR_STATUS: Record<string, TaskStatus> = {' ': 'todo', '/': 'progress', x: 'done', X: 'done', '-': 'hold'};

export interface Task {
    line: number;           // 본문에서의 줄 번호
    indent: number;
    lead: string;           // 앞쪽 공백 원문
    bullet: string;         // -, *, 1. 등
    hasBox: boolean;
    status: TaskStatus;
    text: string;           // 날짜 표시를 뺀 내용
    start?: string;         // YYYY-MM-DD
    due?: string;
    progressAt?: string;    // YYYY-MM-DD HH:mm
    holdAt?: string;
    doneAt?: string;
    notes: string[];        // 항목 아래 들여쓴 설명 줄
    children: Task[];
    parent: Task | null;
    active: boolean;        // 자신 또는 하위 항목이 진행중
}

export type Segment = {type: 'md'; text: string} | {type: 'tasks'; roots: Task[]};

export interface ParsedTodo {
    segments: Segment[];
    tasks: Task[];
    roots: Task[];
}

const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+|$)(?:\[([ xX/-])\](?:[ \t]+|$))?(.*)$/;
const TOKEN_RE = /[ \t]*(🛫|📅|🔄|⏸\uFE0F?|✅)[ \t]*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/gu;
const FENCE_RE = /^[ \t]*(```|~~~)/;

// ─── 날짜 ─────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowStamp = (d = new Date()) => `${todayStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const localDate = (iso: string) => todayStr(new Date(iso));

/** 예: [일일업무] 20260930 수 */
export const dailyTitle = (d = new Date()) =>
    `[일일업무] ${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} ${DAYS[d.getDay()]}`;

/** 2026-09-30 14:20 → 09/30 14:20 (올해가 아니면 연도 포함) */
export function shortStamp(v: string) {
    const md = v.slice(5).replace('-', '/');
    return v.slice(0, 4) === String(new Date().getFullYear()) ? md : `${v.slice(0, 4)}/${md}`;
}

// ─── 해석 ─────────────────────────────────────────
const width = (s: string) => s.replace(/\t/g, '    ').length;

function parseLine(raw: string, line: number): Task | null {
    const m = LIST_RE.exec(raw);
    if (!m) return null;
    const t: Task = {
        line,
        indent: width(m[1]),
        lead: m[1],
        bullet: m[2],
        hasBox: m[3] !== undefined,
        status: CHAR_STATUS[m[3] ?? ' '],
        text: '',
        notes: [],
        children: [],
        parent: null,
        active: false,
    };
    t.text = m[4]
        .replace(TOKEN_RE, (_all, key: string, value: string) => {
            const v = value.replace('T', ' ');
            if (key === '🛫') t.start = v.slice(0, 10);
            else if (key === '📅') t.due = v.slice(0, 10);
            else if (key === '🔄') t.progressAt = v;
            else if (key === '✅') t.doneAt = v;
            else t.holdAt = v;
            return '';
        })
        .trim();
    return t;
}

export function parseTodo(content: string): ParsedTodo {
    const lines = content.split('\n');
    const segments: Segment[] = [];
    const tasks: Task[] = [];
    const roots: Task[] = [];
    let md: string[] = [];
    let group: Task[] | null = null;
    let stack: Task[] = [];
    let inFence = false;

    const flushMd = () => {
        if (md.some(l => l.trim())) segments.push({type: 'md', text: md.join('\n')});
        md = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        if (inFence || FENCE_RE.test(raw)) {
            if (FENCE_RE.test(raw)) inFence = !inFence;
            group = null;
            stack = [];
            md.push(raw);
            continue;
        }
        const t = parseLine(raw, i);
        if (t) {
            if (!group) {
                flushMd();
                group = [];
                segments.push({type: 'tasks', roots: group});
            }
            while (stack.length && stack[stack.length - 1].indent >= t.indent) stack.pop();
            const parent = stack.length ? stack[stack.length - 1] : null;
            t.parent = parent;
            if (parent) parent.children.push(t);
            else {
                group.push(t);
                roots.push(t);
            }
            stack.push(t);
            tasks.push(t);
            continue;
        }
        if (!raw.trim()) {
            if (!group) md.push(raw);
            continue;
        }
        if (group && /^[ \t]/.test(raw) && stack.length) {
            stack[stack.length - 1].notes.push(raw.trim());
            continue;
        }
        group = null;
        stack = [];
        md.push(raw);
    }
    flushMd();

    const markActive = (t: Task): boolean => {
        const child = t.children.map(markActive).some(Boolean);
        t.active = t.status === 'progress' || child;
        return t.active;
    };
    roots.forEach(markActive);
    return {segments, tasks, roots};
}

// ─── 수정 ─────────────────────────────────────────
function serialize(t: Task) {
    const tokens = [
        t.start && `🛫 ${t.start}`,
        t.due && `📅 ${t.due}`,
        t.progressAt && `🔄 ${t.progressAt}`,
        t.holdAt && `⏸️ ${t.holdAt}`,
        t.doneAt && `✅ ${t.doneAt}`,
    ].filter(Boolean);
    return `${t.lead}${t.bullet} [${STATUS_CHAR[t.status]}] ${[t.text, ...tokens].filter(Boolean).join(' ')}`.trimEnd();
}

/** 상태를 바꾸고 해당 상태의 시각을 기록. 지나간 완료·보류 시각은 지운다 */
function applyStatus(t: Task, status: TaskStatus, now: string) {
    t.status = status;
    if (status === 'todo') t.progressAt = t.holdAt = t.doneAt = undefined;
    if (status === 'progress') {
        t.progressAt = now;
        t.holdAt = t.doneAt = undefined;
    }
    if (status === 'hold') {
        t.holdAt = now;
        t.doneAt = undefined;
    }
    if (status === 'done') {
        t.doneAt = now;
        t.holdAt = undefined;
    }
}

const hasProgress = (t: Task): boolean => t.children.some(c => c.status === 'progress' || hasProgress(c));

/**
 * 하위 항목이 모두 완료 → 상위도 완료(가장 늦은 완료 시각).
 * 완료된 상위 아래에 미완료 항목이 생기면 → 상위를 진행중/대기로 되돌림.
 */
function reconcile(nodes: Task[], touch: (t: Task) => void, now: string) {
    for (const n of nodes) {
        reconcile(n.children, touch, now);
        const kids = n.children.filter(c => c.text || c.children.length);
        if (!kids.length) continue;
        if (kids.every(c => c.status === 'done')) {
            const last = kids.map(c => c.doneAt ?? now).sort().pop() as string;
            if (n.status !== 'done' || n.doneAt !== last) {
                n.status = 'done';
                n.doneAt = last;
                n.holdAt = undefined;
                touch(n);
            }
        } else if (n.status === 'done') {
            n.doneAt = undefined;
            if (hasProgress(n)) {
                n.status = 'progress';
                n.progressAt = n.progressAt ?? now;
            } else {
                n.status = 'todo';
                n.progressAt = undefined;
            }
            touch(n);
        }
    }
}

function rewrite(content: string, fn: (p: ParsedTodo, touch: (t: Task) => void, drop: Set<number>) => void) {
    const lines = content.split('\n');
    const parsed = parseTodo(content);
    const dirty = new Set<Task>();
    const drop = new Set<number>();
    const touch = (t: Task) => dirty.add(t);
    fn(parsed, touch, drop);
    reconcile(parsed.roots, touch, nowStamp());
    dirty.forEach(t => (lines[t.line] = serialize(t)));
    return lines.filter((_l, i) => !drop.has(i)).join('\n');
}

const descendants = (t: Task): Task[] => t.children.flatMap(c => [c, ...descendants(c)]);

export function changeStatus(content: string, line: number, status: TaskStatus) {
    const now = nowStamp();
    return rewrite(content, (p, touch) => {
        const t = p.tasks.find(x => x.line === line);
        if (!t) return;
        applyStatus(t, status, now);
        touch(t);
        // 상위를 완료하면 남은 하위 항목도 같은 시각에 완료
        if (status === 'done') {
            descendants(t).filter(d => d.status !== 'done').forEach(d => {
                applyStatus(d, 'done', now);
                touch(d);
            });
        }
    });
}

export function setTaskDates(content: string, line: number, dates: {start?: string | null; due?: string | null}) {
    return rewrite(content, (p, touch) => {
        const t = p.tasks.find(x => x.line === line);
        if (!t) return;
        if ('start' in dates) t.start = dates.start || undefined;
        if ('due' in dates) t.due = dates.due || undefined;
        touch(t);
    });
}

/** 저장 시: 모든 목록 항목을 할일로 맞추고, 시작일이 없으면 오늘로, 빈 항목은 제거 */
export function normalizeTodo(content: string, today = todayStr()) {
    return rewrite(content, (p, touch, drop) => {
        for (const t of p.tasks) {
            if (!t.text && !t.children.length && !t.notes.length) {
                drop.add(t.line);
                continue;
            }
            if (!t.hasBox || !t.start) {
                t.start = t.start ?? today;
                touch(t);
            }
        }
    }).replace(/\n{3,}/g, '\n\n');
}

/** 완료된 항목(하위까지 전부 완료)을 줄째 제거 — 일일업무 이어쓰기용 */
export function removeCompleted(content: string) {
    const lines = content.split('\n');
    const drop = new Set<number>();
    const dropTree = (t: Task) => {
        drop.add(t.line);
        t.children.forEach(dropTree);
    };
    const walk = (t: Task) => {
        if ([t, ...descendants(t)].every(x => x.status === 'done')) dropTree(t);
        else t.children.forEach(walk);
    };
    const parsed = parseTodo(content);
    parsed.roots.forEach(walk);
    // 드롭된 항목 아래 설명 줄도 함께 제거
    let dropping = false;
    let dropIndent = 0;
    const byLine = new Map(parsed.tasks.map(t => [t.line, t]));
    const out: string[] = [];
    lines.forEach((l, i) => {
        const t = byLine.get(i);
        if (t) {
            dropping = drop.has(i);
            dropIndent = t.indent;
        } else if (dropping && l.trim() && width(/^[ \t]*/.exec(l)![0]) <= dropIndent) {
            dropping = false;
        }
        if (!dropping || (!t && !l.trim())) out.push(l);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function todoStats(content: string, today = todayStr()) {
    const tasks = parseTodo(content).tasks.filter(t => t.text);
    return {
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        progress: tasks.filter(t => t.status === 'progress').length,
        overdue: tasks.filter(t => t.due && t.status !== 'done' && t.due < today).length,
    };
}

const asCode = (s: string) => (s.includes('`') ? `\`\` ${s} \`\`` : `\`${s}\``);

/** 메신저 등에 붙여넣기 좋은 형태: 진행중 항목과 그 상위는 `코드`로 */
export function toReportText(title: string, content: string) {
    const lines: (string | null)[] = content.split('\n');
    for (const t of parseTodo(content).tasks) {
        if (!t.text && !t.children.length) {
            lines[t.line] = null;
            continue;
        }
        const text = t.active ? asCode(t.text) : t.text;
        const state =
            t.status === 'done' ? (t.doneAt ? ` (완료 ${shortStamp(t.doneAt)})` : ' (완료)')
                : t.status === 'progress' ? ' (진행중)'
                    : t.status === 'hold' ? ' (보류)' : '';
        const due = t.due && t.status !== 'done' ? ` ~${shortStamp(t.due)}` : '';
        lines[t.line] = `${t.lead}- [${t.status === 'done' ? 'x' : ' '}] ${text}${state}${due}`;
    }
    return `${title}\n\n${lines.filter(l => l !== null).join('\n').trim()}\n`;
}
