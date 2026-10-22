import type { components } from "../api/generated/schema";
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}
export type FileResource = components["schemas"]["FileResource"];
