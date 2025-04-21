import { schema as gdriveSearchSchema, search } from './gdriveSearch.js';
import { schema as gdriveReadFileSchema, readFile } from './gdriveReadFile.js';
import { schema as gsheetsUpdateCellSchema, updateCell } from './gsheetsUpdateCells.js';
import { schema as gsheetsReadSchema, readSheet } from './gsheetsRead.js';
import { 
  Tool, 
  GDriveSearchInput, 
  GDriveReadFileInput, 
  GSheetsUpdateCellInput,
  GSheetsReadInput 
} from './types.js';

export const tools: [
  Tool<GDriveSearchInput>,
  Tool<GDriveReadFileInput>, 
  Tool<GSheetsUpdateCellInput>,
  Tool<GSheetsReadInput>
] = [
  {
    ...gdriveSearchSchema,
    handler: search,
  },
  {
    ...gdriveReadFileSchema,
    handler: readFile,
  },
  {
    ...gsheetsUpdateCellSchema,
    handler: updateCell,
  },
  {
    ...gsheetsReadSchema,
    handler: readSheet,
  }
];