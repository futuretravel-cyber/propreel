import { useState } from "react";

/**
 * Manages per-photo work-in-progress state (prompt, style, result, strength,
 * applied edit) keyed by photo URL. Switching or deleting photos never loses
 * the work stored against other photos.
 */
export function usePhotoWorkState(allPhotos, defaultStrength) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  // work[url] = { prompt, styleKey, result, strength, applied }
  const [work, setWork] = useState({});

  const safeIdx = allPhotos.length > 0 ? Math.min(selectedIdx, allPhotos.length - 1) : 0;
  const url = allPhotos[safeIdx];
  const w = url ? work[url] || {} : {};

  const customPrompt = w.prompt || "";
  const selectedStyleKey = w.styleKey || null;
  const resultPhoto = w.result || null;
  const strength = w.strength ?? defaultStrength;
  const appliedEdit = w.applied || null;

  const patch = (updater) =>
    setWork(prev => {
      const u = allPhotos[safeIdx];
      if (!u) return prev;
      return { ...prev, [u]: { ...prev[u], ...updater(prev[u] || {}) } };
    });

  const setCustomPrompt = (v) => patch(() => ({ prompt: v }));
  const setSelectedStyleKey = (k) => patch(() => ({ styleKey: k }));
  const setResultPhoto = (v) => patch(() => ({ result: v }));
  const setStrength = (v) => patch(() => ({ strength: v }));
  const setAppliedEdit = (v) => patch(() => ({ applied: v, result: null }));

  const getApplied = (u) => (work[u] || {}).applied || null;
  const deleteWork = (u) =>
    setWork(prev => {
      const next = { ...prev };
      delete next[u];
      return next;
    });

  return {
    selectedIdx: safeIdx,
    setSelectedIdx,
    customPrompt, setCustomPrompt,
    selectedStyleKey, setSelectedStyleKey,
    resultPhoto, setResultPhoto,
    strength, setStrength,
    appliedEdit, setAppliedEdit,
    getApplied, deleteWork,
  };
}