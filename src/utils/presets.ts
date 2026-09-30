import type {MemoKind} from '../types/memo';

export interface Preset {
    name: string;
    icon: string;
    chip: string;       // 카테고리 칩 색상 (Tailwind 클래스)
    template: string;   // 빈 글에서 선택하면 채워지는 기본 틀
}

export const DAILY = '일일업무';

export const MEMO_PRESETS: Preset[] = [
    {
        name: '업무',
        icon: '💼',
        chip: 'bg-sky-900/70 text-sky-200',
        template: '## 진행 상황\n- [ ] \n\n## 이슈 / 막힌 점\n- \n\n## 다음 할 일\n- [ ] \n',
    },
    {
        name: '상태',
        icon: '🌡️',
        chip: 'bg-rose-900/60 text-rose-200',
        template: '## 컨디션\n- 에너지: /5\n- 기분: \n\n## 지금 드는 생각\n',
    },
    {
        name: '아이디어',
        icon: '💡',
        chip: 'bg-amber-900/60 text-amber-200',
        template: '## 아이디어\n\n## 왜 필요한가\n\n## 다음 단계\n- [ ] \n',
    },
];

export const TODO_PRESETS: Preset[] = [
    {name: DAILY, icon: '📋', chip: 'bg-emerald-900/60 text-emerald-200', template: '## 오늘 할 일\n- [ ] \n'},
    {name: '업무', icon: '💼', chip: 'bg-sky-900/70 text-sky-200', template: '- [ ] \n'},
    {name: '개인', icon: '🏠', chip: 'bg-violet-900/60 text-violet-200', template: '- [ ] \n'},
];

export const presetsFor = (kind: MemoKind) => (kind === 'todo' ? TODO_PRESETS : MEMO_PRESETS);

export const findPreset = (category: string, kind?: MemoKind) =>
    (kind ? presetsFor(kind) : [...MEMO_PRESETS, ...TODO_PRESETS]).find(p => p.name === category);

export const isTemplate = (content: string, kind: MemoKind) =>
    !content.trim() || presetsFor(kind).some(p => p.template.trim() === content.trim());

export const categoryIcon = (category: string) => findPreset(category)?.icon ?? '📁';
export const categoryChip = (category: string) => findPreset(category)?.chip ?? 'bg-gray-700 text-gray-200';
