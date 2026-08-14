import './styles.css';

// Client-facing editor entrypoint. Keep the public catalog/export helpers out of
// the initial studio chunk; the library panels load their data on demand.
export { WebsiteBuilderStudio } from './WebsiteBuilderStudio';
export type * from './types';
