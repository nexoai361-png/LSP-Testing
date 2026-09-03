import ace from 'ace-builds';

// Ensure global ace exists before any ace mode/theme/ext script runs
(window as any).ace = ace;

if (ace && ace.config) {
  ace.config.set('basePath', './');
  ace.config.set('modePath', './');
  ace.config.set('themePath', './');
  ace.config.set('workerPath', './');
  ace.config.set('packaged', true);
  (ace.config as any).set('useWorker', false);
  (ace.config as any).set('loadWorkerFromBlob', false);
}

export default ace;


