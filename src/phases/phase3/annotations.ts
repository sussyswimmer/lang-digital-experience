/** Typed access to the photo annotations in content/phase3.json. */
import raw from '../../../content/phase3.json';
import type { HatAnnotation } from './hats';

type XY = [number, number];

export interface PhotoInfo {
  photo: string;
  width: number;
  height: number;
}

export interface ProtectionAnnotation extends PhotoInfo {
  apex: XY;
  brim: { l: XY; r: XY; d: number };
  face: { x: number; y: number; w: number; h: number };
}

export interface HeritageAnnotation extends PhotoInfo {
  hatRegion: XY[];
}

export interface IdentityAnnotation extends PhotoInfo {
  hats: HatAnnotation[];
}

export const ANN = raw as unknown as {
  protection: ProtectionAnnotation;
  heritage: HeritageAnnotation;
  identity: IdentityAnnotation;
};
