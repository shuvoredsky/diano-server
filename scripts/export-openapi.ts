import fs from 'fs';
import path from 'path';
import { swaggerDocument } from '../src/docs/swagger';

const outputPath = path.resolve(__dirname, '../openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(swaggerDocument, null, 2), 'utf-8');

console.info(`✅ Successfully exported OpenAPI specification to ${outputPath}`);
console.info(`   - Endpoints documented: ${Object.keys(swaggerDocument.paths).length}`);
console.info(`   - Schemas defined: ${Object.keys(swaggerDocument.components.schemas).length}`);
