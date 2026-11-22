'use strict';
// Veb-qism kutadigan "FurNative" ko'prigini Windows uchun taqdim etadi (Android qobig'idagi bilan bir xil nomlar).
const { contextBridge, ipcRenderer } = require('electron');
const call = (op, ...a) => ipcRenderer.sendSync('fur:sync', op, ...a);
contextBridge.exposeInMainWorld('FurNative', {
  version: () => call('version'),
  checkUpdate: () => ipcRenderer.send('fur:update'),
  openExternal: u => ipcRenderer.send('fur:external', String(u)),
  saveFile: (name, mime, b64, last) => ipcRenderer.send('fur:save', String(name), String(b64), !!last),
  // yozuvlar: Videolar\FURQON Recordings
  recSaveBegin: (name, mime) => call('recSaveBegin', String(name), String(mime)),
  recSaveChunk: (tok, b64) => call('recSaveChunk', String(tok), String(b64)),
  recSaveEnd: (tok, ok) => call('recSaveEnd', String(tok), !!ok),
  recList: () => call('recList'),
  recDelete: id => call('recDelete', String(id)),
  recWhere: () => call('recWhere'),
  recShare: id => ipcRenderer.send('fur:recShow', String(id)),
  recShareLabel: () => 'Papkada ko‘rsatish',
  // .fur faylni ikki marta bosib / "Ochish" orqali kelgan fayllar
  incomingList: () => call('incomingList'),
  incomingChunk: (id, off, len) => call('incomingChunk', Number(id), Number(off), Number(len)),
  incomingDone: id => ipcRenderer.send('fur:incomingDone', Number(id))
});
