/**
 * Stops every HTMLAudioElement in the document (e.g. poem background music when leaving the reader).
 */
export function stopAllPoemAudio() {
  if (typeof document === 'undefined') {
    return;
  }

  document.querySelectorAll('audio').forEach((el) => {
    el.pause();
    el.currentTime = 0;
  });
}
