import { Registry } from '../PropertyRegistry';

// Foundation - Layout
import { 
  SectionManifest, ContainerManifest, GridManifest, 
  TabsManifest, AccordionManifest 
} from './foundation/layout';

// Foundation - Typography
import { 
  HeadingManifest, ParagraphManifest, BlockquoteManifest 
} from './foundation/typography';

// Foundation - Media
import { 
  ImageManifest, VideoManifest, GalleryManifest, LottieManifest 
} from './foundation/media';

// Foundation - Forms & Buttons
import { 
  ButtonManifest, ButtonGroupManifest 
} from './foundation/buttons';
import { 
  ContactFormManifest, NewsletterManifest 
} from './foundation/forms';

// Foundation - Navigation
import { 
  NavbarManifest, FooterManifest 
} from './foundation/navigation';

// Event - Core
import { 
  HeroManifest, SpeakerGridManifest, SponsorGridManifest, 
  AgendaManifest, PricingManifest, CountdownManifest, 
  VenueManifest, StatisticsManifest, CommitteeManifest 
} from './event/event';

const ALL_MANIFESTS = [
  // Layout
  SectionManifest, ContainerManifest, GridManifest, 
  TabsManifest, AccordionManifest,
  
  // Typography
  HeadingManifest, ParagraphManifest, BlockquoteManifest,
  
  // Media
  ImageManifest, VideoManifest, GalleryManifest, LottieManifest,
  
  // Forms & Buttons
  ButtonManifest, ButtonGroupManifest,
  ContactFormManifest, NewsletterManifest,
  
  // Navigation
  NavbarManifest, FooterManifest,
  
  // Event Specific
  HeroManifest, SpeakerGridManifest, SponsorGridManifest, 
  AgendaManifest, PricingManifest, CountdownManifest, 
  VenueManifest, StatisticsManifest, CommitteeManifest
];

// Register all components
ALL_MANIFESTS.forEach(manifest => {
  Registry.register(manifest);
});

console.log(`✅ Registered ${ALL_MANIFESTS.length} Component Manifests in Website Builder PropertyRegistry.`);
