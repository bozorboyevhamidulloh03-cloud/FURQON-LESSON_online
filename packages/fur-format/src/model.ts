export type PageType = 'document' | 'board';
export type Background = 'grid' | 'white' | 'dark';
export interface View { s: number; x: number; y: number }
export interface StrokeObj { t: 'stroke'; id: string; pts: [number, number][]; c: string; w: number; hl: boolean }
export interface ShapeObj { t: 'line' | 'arrow' | 'rect' | 'ellipse'; id: string; x1: number; y1: number; x2: number; y2: number; c: string; w: number }
export interface TextObj { t: 'text'; id: string; x: number; y: number; tx: string; s: number; c: string }
/** Qirqish: har tomondan olib tashlanadigan ulush, % (0–90). */
export interface Crop { l: number; t: number; r: number; b: number }
export interface ImageObj { t: 'image'; id: string; a: string; x: number; y: number; w: number; h: number; crop?: Crop }
export type FurObject = StrokeObj | ShapeObj | TextObj | ImageObj;
export interface Run { t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean; c?: string; hl?: string; fs?: number; ff?: string; href?: string }
export type Align = 'left' | 'center' | 'right' | 'justify';
export interface TextBlock { id: string; type: 'heading' | 'paragraph' | 'li'; level?: 1 | 2 | 3; list?: 'bullet' | 'ordered'; indent?: number; align?: Align; runs: Run[] }
/** Birlashtirilgan katak: (r,c) — yuqori-chap katak, rs × cs — qator va ustun soni. Qolgan kataklar yashirin va bo‘sh. */
export interface CellMerge { r: number; c: number; rs: number; cs: number }
/** Katak uslubi: a — matn tekislanishi, bg — katak foni. Kalit: "qator,ustun". */
export interface CellStyle { a?: Align; bg?: string }
export interface TableBlock { id: string; type: 'table'; header: boolean; rows: Run[][][]; merges?: CellMerge[]; cs?: Record<string, CellStyle> }
export type ImageWrap = 'block' | 'left' | 'right' | 'behind' | 'front';
/** wrap: block (matn bilan, o‘z qatorida), left/right (matn o‘rab oladi), behind/front (matn ortida/ustida, x=% kenglik, y=px) */
export interface ImageBlock { id: string; type: 'image'; a: string; w: number; align: Align; caption: Run[]; wrap?: ImageWrap; x?: number; y?: number; crop?: Crop }
export type Block = TextBlock | TableBlock | ImageBlock;
export interface Layout { margin: 'narrow' | 'normal' | 'wide'; header: string; footer: string; pageNumbers: boolean }
export const defaultLayout = (): Layout => ({ margin: 'normal', header: '', footer: '', pageNumbers: true });
export interface FurPage { id: string; type: PageType; title: string; bg: Background; view: View; objects: FurObject[]; blocks: Block[] }
export interface FurAsset { id: string; mime: string; data: Uint8Array }
export interface FurDocument { title: string; author: string; created: number; modified: number; pages: FurPage[]; assets: FurAsset[]; layout: Layout }

export const FORMAT_VERSION = '1.1';
export function uid(prefix: string): string { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function newPage(type: PageType, title = ''): FurPage {
  return { id: uid('p'), type, title, bg: type === 'board' ? 'grid' : 'white', view: { s: 1, x: 0, y: 0 }, objects: [], blocks: type === 'document' ? [{ id: uid('b'), type: 'paragraph', runs: [] }] : [] };
}
export function newDocument(title = 'Nomsiz dars', author = ''): FurDocument {
  const now = Date.now();
  return { title, author, created: now, modified: now, pages: [newPage('board')], assets: [], layout: defaultLayout() };
}
