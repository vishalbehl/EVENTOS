/**
 * Master block registry barrel.
 * Registers ALL foundation + event blocks into a GrapesJS editor instance.
 *
 * Usage:
 *   import { registerAllBlocks } from './blocks';
 *   registerAllBlocks(editor, eventSnapshot);
 */

import type { Editor } from 'grapesjs';
import type { EventDataSnapshot } from '../types';

// Foundation blocks
import { registerLayoutBlocks } from './foundation/layoutBlocks';
import { registerTypographyBlocks } from './foundation/typographyBlocks';
import { registerMediaBlocks } from './foundation/mediaBlocks';
import { registerButtonBlocks } from './foundation/buttonBlocks';
import { registerFormBlocks } from './foundation/formBlocks';
import { registerHeaderBlocks, registerNavigationBlocks, registerUtilityBlocks } from './foundation/navigationBlocks';

// Event blocks
import { registerHeroBlocks } from './event/heroBlocks';
import { registerSpeakerBlocks } from './event/speakerBlocks';
import { registerAgendaBlocks } from './event/agendaBlocks';
import { registerSponsorBlocks, registerRegistrationBlocks } from './event/sponsorBlocks';
import {
  registerOverviewBlocks,
  registerStatisticsBlocks,
  registerCountdownBlocks,
  registerVenueBlocks,
  registerGalleryBlocks,
  registerContactFooterBlocks,
} from './event/overviewBlocks';

export function registerAllBlocks(editor: Editor, snapshot?: EventDataSnapshot): void {
  // ── Phase 1: Foundation Components ────────────────────────────────────────
  registerLayoutBlocks(editor);
  registerTypographyBlocks(editor);
  registerMediaBlocks(editor);
  registerButtonBlocks(editor);
  registerFormBlocks(editor);
  registerHeaderBlocks(editor);
  registerNavigationBlocks(editor);
  registerUtilityBlocks(editor);

  // ── Phase 2: Event Component Families ─────────────────────────────────────
  // Hero & Headers
  registerHeroBlocks(editor, snapshot);

  // Event Overview
  registerOverviewBlocks(editor, snapshot);

  // Statistics, Countdown
  registerStatisticsBlocks(editor, snapshot);
  registerCountdownBlocks(editor, snapshot);

  // People
  registerSpeakerBlocks(editor, snapshot);

  // Program
  registerAgendaBlocks(editor, snapshot);

  // Commercial
  registerSponsorBlocks(editor, snapshot);
  registerRegistrationBlocks(editor, snapshot);

  // Venue, Gallery, Contact, Footer, Marketing
  registerVenueBlocks(editor, snapshot);
  registerGalleryBlocks(editor, snapshot);
  registerContactFooterBlocks(editor, snapshot);
}

// Legacy adapter: convert old EventDataBindings to partial EventDataSnapshot
// for backward compat during migration.
export { registerAllBlocks as registerEventBlocks };
