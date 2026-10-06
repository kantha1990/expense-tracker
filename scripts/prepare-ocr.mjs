import {mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const dest='public/ocr';mkdirSync(dest,{recursive:true});mkdirSync(dest+'/core',{recursive:true});mkdirSync(dest+'/lang',{recursive:true});
const worker='node_modules/tesseract.js/dist';for(const f of ['worker.min.js','worker.min.js.LICENSE.txt'])copyFileSync(path.join(worker,f),path.join(dest,f));
const core='node_modules/tesseract.js-core';for(const f of readdirSync(core).filter(f=>f.endsWith('.wasm.js')||f.endsWith('.wasm')||f==='LICENSE'))copyFileSync(path.join(core,f),path.join(dest,'core',f));
for(const lang of ['eng','nep']){copyFileSync(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,`${dest}/lang/${lang}.traineddata.gz`);copyFileSync(`node_modules/@tesseract.js-data/${lang}/README.md`,`${dest}/lang/${lang}-README.md`);}
console.log('Prepared self-hosted OCR worker, WASM cores and English/Nepali language data.');
