import React, {useMemo, useState} from 'react';
import type {IconType} from 'react-icons';
import {FiCheckCircle, FiCircle, FiPauseCircle, FiPlayCircle, FiX} from 'react-icons/fi';
import {
    changeStatus, parseTodo, setTaskDates, shortStamp, STATUS_LABEL, STATUS_ORDER,
    type Task, type TaskStatus, todayStr,
} from '../utils/todo';
import MarkdownView, {InlineMarkdown} from './MarkdownView';

export const STATUS_STYLE: Record<TaskStatus, {icon: IconType; color: string}> = {
    todo: {icon: FiCircle, color: 'text-gray-500'},
    progress: {icon: FiPlayCircle, color: 'text-sky-400'},
    done: {icon: FiCheckCircle, color: 'text-emerald-400'},
    hold: {icon: FiPauseCircle, color: 'text-amber-400'},
};

const statusTime = (t: Task, s: TaskStatus) =>
    s === 'progress' ? t.progressAt : s === 'done' ? t.doneAt : s === 'hold' ? t.holdAt : undefined;

const TaskMeta: React.FC<{task: Task; today: string}> = ({task, today}) => {
    const items: {text: string; cls: string}[] = [];
    if (task.start) items.push({text: `시작일 ${shortStamp(task.start)}`, cls: 'text-gray-500'});
    if (task.due) {
        const open = task.status !== 'done';
        if (open && task.due < today) items.push({text: `마감 ${shortStamp(task.due)} 지남`, cls: 'font-medium text-red-400'});
        else if (open && task.due === today) items.push({text: '오늘 마감', cls: 'font-medium text-amber-300'});
        else items.push({text: `마감 ${shortStamp(task.due)}`, cls: 'text-gray-400'});
    }
    if (task.progressAt) items.push({text: `진행 ${shortStamp(task.progressAt)}`, cls: 'text-sky-400/90'});
    if (task.holdAt) items.push({text: `보류 ${shortStamp(task.holdAt)}`, cls: 'text-amber-400/90'});
    if (task.doneAt) items.push({text: `완료 ${shortStamp(task.doneAt)}`, cls: 'text-emerald-400/90'});
    if (!items.length) return null;
    return (
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-xs">
            {items.map(i => (
                <span key={i.text} className={i.cls}>{i.text}</span>
            ))}
        </div>
    );
};

const TaskRow: React.FC<{task: Task; today: string; onOpen?: (t: Task) => void}> = ({task, today, onOpen}) => {
    if (!task.text && !task.children.length) return null;
    const {icon: Icon, color} = STATUS_STYLE[task.status];
    const textCls =
        task.status === 'done' ? 'text-gray-500 line-through decoration-gray-600'
            : task.status === 'hold' ? 'text-gray-400' : 'text-gray-200';

    return (
        <li>
            <div className="flex items-start gap-2 py-1">
                <button
                    type="button"
                    onClick={() => onOpen?.(task)}
                    disabled={!onOpen}
                    aria-label={`${task.text} — ${STATUS_LABEL[task.status]}. 상태 변경`}
                    className={`-m-1 shrink-0 rounded-full p-1 ${color} ${onOpen ? 'hover:bg-gray-700' : ''}`}
                >
                    <Icon size={20} />
                </button>
                <div className={`min-w-0 flex-1 leading-snug ${onOpen ? 'cursor-pointer' : ''}`} onClick={() => onOpen?.(task)}>
                    <div className={textCls}>
                        {/* 진행중인 항목과 그 상위 항목은 코드로 표시 */}
                        {task.active
                            ? <code className="rounded bg-gray-950 px-1.5 py-0.5 text-[0.93em] text-sky-300">{task.text}</code>
                            : <InlineMarkdown content={task.text} />}
                    </div>
                    {task.notes.map((n, i) => (
                        <div key={i} className="mt-0.5 text-sm text-gray-400"><InlineMarkdown content={n} /></div>
                    ))}
                    <TaskMeta task={task} today={today} />
                </div>
            </div>
            {task.children.length > 0 && (
                <ul className="ml-2.5 border-l border-gray-700 pl-3">
                    {task.children.map(c => (
                        <TaskRow key={c.line} task={c} today={today} onOpen={onOpen} />
                    ))}
                </ul>
            )}
        </li>
    );
};

interface SheetProps {
    task: Task;
    onStatus: (s: TaskStatus) => void;
    onDates: (d: {start?: string | null; due?: string | null}) => void;
    onClose: () => void;
}

const TaskSheet: React.FC<SheetProps> = ({task, onStatus, onDates, onClose}) => (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
        <div
            role="dialog"
            aria-label="할일 상태 변경"
            onClick={e => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-gray-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-gray-200 sm:max-w-sm sm:rounded-2xl"
        >
            <div className="mb-3 flex items-start gap-2">
                <p className="min-w-0 flex-1 break-words font-medium text-gray-50">{task.text}</p>
                <button onClick={onClose} aria-label="닫기" className="-mr-2 -mt-1 rounded-full p-2 hover:bg-gray-800">
                    <FiX size={20} />
                </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {STATUS_ORDER.map(s => {
                    const {icon: Icon, color} = STATUS_STYLE[s];
                    const time = statusTime(task, s);
                    return (
                        <button
                            key={s}
                            onClick={() => onStatus(s)}
                            aria-pressed={task.status === s}
                            className={`flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-sm ${
                                task.status === s ? 'bg-gray-700 ring-2 ring-emerald-500' : 'bg-gray-800 hover:bg-gray-700'
                            }`}
                        >
                            <Icon size={22} className={color} />
                            {STATUS_LABEL[s]}
                            <span className="h-4 text-[11px] text-gray-500">{time ? shortStamp(time).slice(-11) : ''}</span>
                        </button>
                    );
                })}
            </div>
            {task.children.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">완료로 바꾸면 하위 항목도 모두 완료됩니다. 하위 항목이 모두 끝나면 자동으로 완료됩니다.</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <label className="block">
                    <span className="mb-1 block text-gray-400">시작일</span>
                    <input
                        type="date"
                        value={task.start ?? ''}
                        onChange={e => e.target.value && onDates({start: e.target.value})}
                        className="w-full rounded-lg bg-gray-800 px-2 py-2 text-base text-gray-200 outline-none [color-scheme:dark]"
                    />
                </label>
                <label className="block">
                    <span className="mb-1 flex items-center justify-between text-gray-400">
                        마감일
                        {task.due && (
                            <button type="button" onClick={() => onDates({due: null})} className="text-xs text-gray-500 underline">
                                지우기
                            </button>
                        )}
                    </span>
                    <input
                        type="date"
                        value={task.due ?? ''}
                        min={task.start}
                        onChange={e => onDates({due: e.target.value || null})}
                        className="w-full rounded-lg bg-gray-800 px-2 py-2 text-base text-gray-200 outline-none [color-scheme:dark]"
                    />
                </label>
            </div>
        </div>
    </div>
);

interface Props {
    content: string;
    onChange?: (content: string) => void; // 없으면 읽기 전용 (미리보기)
}

const TodoView: React.FC<Props> = ({content, onChange}) => {
    const parsed = useMemo(() => parseTodo(content), [content]);
    const [openLine, setOpenLine] = useState<number | null>(null);
    const today = todayStr();
    const open = openLine == null ? undefined : parsed.tasks.find(t => t.line === openLine);
    const onOpen = onChange ? (t: Task) => setOpenLine(t.line) : undefined;

    return (
        <div className="text-[15px]">
            {parsed.segments.map((seg, i) =>
                seg.type === 'md' ? (
                    <MarkdownView key={i} content={seg.text} />
                ) : (
                    <ul key={i} className="mb-2">
                        {seg.roots.map(t => (
                            <TaskRow key={t.line} task={t} today={today} onOpen={onOpen} />
                        ))}
                    </ul>
                ),
            )}
            {open && onChange && (
                <TaskSheet
                    task={open}
                    onClose={() => setOpenLine(null)}
                    onStatus={s => {
                        if (s !== open.status) onChange(changeStatus(content, open.line, s));
                        setOpenLine(null);
                    }}
                    onDates={d => onChange(setTaskDates(content, open.line, d))}
                />
            )}
        </div>
    );
};

export default TodoView;
