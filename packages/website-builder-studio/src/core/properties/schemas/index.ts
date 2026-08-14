import { Registry } from '../PropertyRegistry';

// Foundation - Layout
import { 
  SectionManifest, ContainerManifest, GridManifest,
  CardManifest, SpacerManifest, DividerManifest,
  TabsManifest, AccordionManifest
} from './foundation/layout';

// Foundation - Typography
import { 
  HeadingManifest, ParagraphManifest, BlockquoteManifest 
} from './foundation/typography';

// Foundation - Media
import { ImageManifest, VideoManifest, GalleryManifest } from './foundation/media';

// Foundation - Forms & Buttons
import { 
  ButtonManifest, ButtonGroupManifest 
} from './foundation/buttons';
import { 
  ContactFormManifest, NewsletterManifest 
} from './foundation/forms';

// Foundation - Navigation
import { 
  HeaderManifest, NavbarManifest, FooterManifest 
} from './foundation/navigation';

// Event - Core
import { 
  HeroManifest, SpeakerGridManifest, SponsorGridManifest, 
  AgendaManifest, PricingManifest, CountdownManifest, 
  VenueManifest, StatisticsManifest, CommitteeManifest 
} from './event/event';
import { ComponentLibraryManifests } from './componentLibrary';
import { ACETERNITY_BUILDER_MANIFESTS } from '../../../component-assets/aceternity/adapters';

const ALL_MANIFESTS = [
  // Layout
  SectionManifest, ContainerManifest, GridManifest,
  CardManifest, SpacerManifest, DividerManifest,
  TabsManifest, AccordionManifest,
  
  // Typography
  HeadingManifest, ParagraphManifest, BlockquoteManifest,
  
  // Media
  ImageManifest, VideoManifest, GalleryManifest,
  
  // Forms & Buttons
  ButtonManifest, ButtonGroupManifest,
  ContactFormManifest, NewsletterManifest,
  
  // Navigation
  HeaderManifest, NavbarManifest, FooterManifest,
  
  // Event Specific
  HeroManifest, SpeakerGridManifest, SponsorGridManifest, 
  AgendaManifest, PricingManifest, CountdownManifest, 
  VenueManifest, StatisticsManifest, CommitteeManifest,
  ...ComponentLibraryManifests,
  ...ACETERNITY_BUILDER_MANIFESTS,
];

// Register all components
ALL_MANIFESTS.forEach(manifest => {
  if (manifest.category === 'Event') {
    manifest.supportsData = true;
    manifest.dataBinding = {
      fields: ['eventName', 'speakers', 'sessions', 'sponsors', 'venue', 'stats'],
      fallback: 'mock',
    };
  }
  Registry.register(manifest);
});

console.log(`✅ Registered ${ALL_MANIFESTS.length} Component Manifests in Website Builder PropertyRegistry.`);
