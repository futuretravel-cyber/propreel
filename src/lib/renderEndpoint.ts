/**
 * The Modal render worker's origin. One definition for every render-path
 * caller (the video wizards, clip re-roll, assembly, cancel); the same value
 * was previously copy-pasted across App.tsx, modalClient.ts and useFlashHead.ts.
 */
export const RENDER_ENDPOINT =
  import.meta.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';
