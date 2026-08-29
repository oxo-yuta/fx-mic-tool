// File System Access API 経由で fx-mic のディスクを読み書きする。
// Chrome / Edge のみ。secure context（https または localhost）が必要。

const CONFIG = 'config.json';

export const supported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export class Disk {
  constructor() { this.handle = null; }

  get connected() { return !!this.handle; }
  get name() { return this.handle?.name ?? null; }

  async pick() {
    if (!supported()) {
      throw new Error('このブラウザは File System Access API に対応していない（Chrome / Edge が必要）');
    }
    this.handle = await window.showDirectoryPicker({ id: 'fx-mic-disk', mode: 'readwrite' });
    return this.handle.name;
  }

  async _permit() {
    if (!this.handle) throw new Error('ディスクが選択されていない');
    const opts = { mode: 'readwrite' };
    if ((await this.handle.queryPermission(opts)) === 'granted') return;
    if ((await this.handle.requestPermission(opts)) !== 'granted') {
      throw new Error('書き込み権限が得られなかった');
    }
  }

  /** ディスク上のファイル一覧（config.json と *.wav のみ。deploy.sh と同じ規則） */
  async list() {
    await this._permit();
    const out = new Map();
    for await (const [name, h] of this.handle.entries()) {
      if (h.kind !== 'file' || name.startsWith('.')) continue;
      if (name !== CONFIG && !name.toLowerCase().endsWith('.wav')) continue;
      const f = await h.getFile();
      out.set(name, { size: f.size, lastModified: f.lastModified, handle: h });
    }
    return out;
  }

  async readConfig() {
    await this._permit();
    try {
      const h = await this.handle.getFileHandle(CONFIG);
      return await (await h.getFile()).text();
    } catch (e) {
      if (e.name === 'NotFoundError') return null;
      throw e;
    }
  }

  async readFile(name) {
    await this._permit();
    const h = await this.handle.getFileHandle(name);
    return await (await h.getFile()).arrayBuffer();
  }

  async writeFile(name, data) {
    await this._permit();
    const h = await this.handle.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(data);
    await w.close();
  }

  async remove(name) {
    await this._permit();
    await this.handle.removeEntry(name);
  }

  /**
   * ディスクの現状を丸ごと読み出してバックアップ用のオブジェクトにする。
   * 上書きする前に必ず呼ぶこと。
   */
  async snapshot() {
    const files = await this.list();
    const out = [];
    for (const [name] of files) out.push({ name, data: await this.readFile(name) });
    return out;
  }
}

/** ブラウザのダウンロードとして config.json を保存する（ディスクが無いときの逃げ道） */
export function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
