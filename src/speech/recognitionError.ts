export function recognitionErrorMessage(reason = 'unknown'): string {
  const recovery = 'Use the microphone button to try again, or the keyboard button to type.';
  if (reason === 'network') return 'The speech recognition connection failed. ' + recovery;
  if (reason === 'not-allowed' || reason === 'service-not-allowed') return 'The browser did not allow speech recognition. Check microphone permission for this page. ' + recovery;
  if (reason === 'audio-capture') return 'The browser could not capture microphone audio. Check that your microphone is connected and available. ' + recovery;
  if (reason === 'language-not-supported') return 'Speech recognition could not use the selected language. ' + recovery;
  return 'Speech recognition stopped because of a browser error. ' + recovery;
}
