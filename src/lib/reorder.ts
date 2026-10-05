import { useState, type Dispatch, type SetStateAction, type DragEvent } from 'react';

/**
 * Drag-and-drop reordering for uploaded-image grids.
 *
 * Usage: call once per grid, spread `dragProps(i)` on each cell and append
 * `dragClass(i, base)` to its class list. Uses the HTML5 drag API — no
 * dependency, works with right-click-free mouse drags on every grid that
 * renders a list of image URLs.
 */
export function useReorderable<T>(setItems: Dispatch<SetStateAction<T[]>>) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const dragProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag without payload in setData.
      e.dataTransfer.setData('text/plain', String(index));
      setDragFrom(index);
    },
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragFrom !== null && dragFrom !== index) setDragOver(index);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      const from = dragFrom ?? (raw === '' ? null : Number(raw));
      if (from === null || Number.isNaN(from) || from === index) {
        setDragFrom(null);
        setDragOver(null);
        return;
      }
      setItems(prev => {
        if (from < 0 || from >= prev.length || index < 0 || index >= prev.length) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDragFrom(null);
      setDragOver(null);
    },
    onDragEnd: () => {
      setDragFrom(null);
      setDragOver(null);
    },
  });

  /** Visual feedback: dragged cell dims, the hovered target gets a ring. */
  const dragClass = (index: number, base: string) => {
    if (dragFrom === index) return `${base} opacity-40`;
    if (dragOver === index && dragFrom !== null) return `${base} ring-2 ring-purple-500`;
    return base;
  };

  return { dragProps, dragClass, dragging: dragFrom !== null };
}
