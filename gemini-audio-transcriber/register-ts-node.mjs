import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node ESM loader without triggering experimental warnings.
register('ts-node/esm', pathToFileURL('./'));
