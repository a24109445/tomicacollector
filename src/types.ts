export type Tomica = {
  id: number;
  barcode: string;
  number: string;
  name: string;
  series: string;
  version: string;
  madeIn: string;
  year: string;
  ownedCount: number;
  hasSticker: number;
  photoUri: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type TomicaDraft = Omit<Tomica, 'id' | 'createdAt' | 'updatedAt'>;

export type Screen =
  | { name: 'list' }
  | { name: 'form'; id?: number; barcode?: string }
  | { name: 'scanner' };
