/**
 * 카테고리는 폴더 경로로 저장한다: "업무/프로젝트A/회의"
 * 예전의 한 단계 카테고리("업무")는 최상위 폴더로 그대로 동작한다.
 */

export const SEP = '/';

export const splitPath = (path: string) => path.split(SEP).map(s => s.trim()).filter(Boolean);
export const normalizePath = (path: string) => splitPath(path).join(SEP);
export const folderName = (path: string) => splitPath(path).pop() ?? '';
export const parentPath = (path: string) => splitPath(path).slice(0, -1).join(SEP);
export const rootOf = (path: string) => splitPath(path)[0] ?? '';
export const depthOf = (path: string) => splitPath(path).length;

/** 폴더 이름에는 구분자(/)를 쓸 수 없다 */
export const cleanName = (name: string) => name.replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

export const joinPath = (parent: string, name: string) => normalizePath(parent ? `${parent}${SEP}${name}` : name);

/** path가 folder 자신이거나 그 하위에 있는가 */
export const isInside = (path: string, folder: string) => path === folder || path.startsWith(folder + SEP);

/** "a/b/c" → ["a", "a/b", "a/b/c"] */
export const withAncestors = (path: string) => {
    const parts = splitPath(path);
    return parts.map((_p, i) => parts.slice(0, i + 1).join(SEP));
};

/** from 폴더(와 하위)를 to 경로로 옮겼을 때의 새 경로. 해당 없으면 그대로 */
export const movePath = (path: string, from: string, to: string) =>
    isInside(path, from) ? normalizePath(to + path.slice(from.length)) : path;

/** 화면 표시용: "업무 › 회의" */
export const pathLabel = (path: string) => splitPath(path).join(' › ');

const collator = new Intl.Collator('ko', {numeric: true, sensitivity: 'base'});
export const comparePath = (a: string, b: string) => {
    const pa = splitPath(a);
    const pb = splitPath(b);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
        const c = collator.compare(pa[i], pb[i]);
        if (c) return c;
    }
    return pa.length - pb.length;
};

/** 저장된 폴더 + 글에 쓰인 폴더(상위 포함)를 합친 전체 목록 */
export function collectFolders(stored: string[], categories: string[]) {
    const set = new Set<string>();
    [...stored, ...categories].forEach(p => withAncestors(normalizePath(p)).forEach(a => set.add(a)));
    return [...set].sort(comparePath);
}

export interface FolderNode {
    path: string;
    name: string;
    depth: number;
    count: number;      // 이 폴더에 바로 들어 있는 글 수
    total: number;      // 하위 폴더 포함
    children: FolderNode[];
}

export function buildTree(paths: string[], counts: Map<string, number>): FolderNode[] {
    const nodes = new Map<string, FolderNode>();
    const roots: FolderNode[] = [];
    [...paths].sort(comparePath).forEach(path => {
        const node: FolderNode = {path, name: folderName(path), depth: depthOf(path) - 1, count: counts.get(path) ?? 0, total: 0, children: []};
        nodes.set(path, node);
        const parent = nodes.get(parentPath(path));
        if (parent) parent.children.push(node);
        else roots.push(node);
    });
    const sum = (n: FolderNode): number => (n.total = n.count + n.children.reduce((s, c) => s + sum(c), 0));
    roots.forEach(sum);
    return roots;
}

export function countByFolder(categories: string[]) {
    const counts = new Map<string, number>();
    categories.forEach(c => {
        const p = normalizePath(c);
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    return counts;
}
