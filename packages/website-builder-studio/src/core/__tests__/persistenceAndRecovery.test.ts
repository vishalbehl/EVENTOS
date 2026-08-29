import { beforeEach, describe, expect, it } from 'vitest';
import type { WebsiteProjectData } from '../../types';
import { useWebsiteDocumentStore } from '../websiteDocumentStore';

const starterProject: WebsiteProjectData = {
  name: 'Persistence Test Project',
  activePageId: 'home',
  theme: {
    primary: '#7c3aed',
    secondary: '#22d3ee',
    background: '#080912',
    surface: '#111827',
    card: '#151629',
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: '',
      isHomePage: true,
      html: '',
      css: '',
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      components: [
        {
          type: 'heading',
          tagName: 'h1',
          attributes: { 'data-wb-instance-id': 'h1_main' },
          content: 'Initial Headline',
        },
      ],
    },
  ],
};

describe('Phase 9: Persistence, Dirty State & Crash Recovery', () => {
  beforeEach(() => {
    useWebsiteDocumentStore.getState().initialize(starterProject);
  });

  it('tracks dirty state upon instance modification and clears upon markClean', () => {
    const store = useWebsiteDocumentStore.getState();
    expect(store.isDirty).toBe(false);

    // Modify a property
    store.updateInstanceProps('h1_main', { content: 'Updated Headline' });
    expect(useWebsiteDocumentStore.getState().isDirty).toBe(true);

    // Simulate successful server save
    useWebsiteDocumentStore.getState().markClean();
    expect(useWebsiteDocumentStore.getState().isDirty).toBe(false);
  });

  it('saves, loads, and clears local recovery backup', () => {
    const store = useWebsiteDocumentStore.getState();
    store.updateInstanceProps('h1_main', { content: 'Crash-Prone Unsaved Headline' });

    // Save local recovery backup
    store.saveLocalRecovery('wb_test_recovery');

    // Simulate a reload with fresh starter project
    store.initialize(starterProject);
    expect((useWebsiteDocumentStore.getState().document?.instances['h1_main']?.props.content)).not.toBe('Crash-Prone Unsaved Headline');

    // Restore from local crash recovery
    const restored = useWebsiteDocumentStore.getState().loadLocalRecovery('wb_test_recovery');
    expect(restored).toBe(true);
    expect(useWebsiteDocumentStore.getState().document?.instances['h1_main']?.props.content).toBe('Crash-Prone Unsaved Headline');
    expect(useWebsiteDocumentStore.getState().isDirty).toBe(true);

    // Clear local recovery
    useWebsiteDocumentStore.getState().clearLocalRecovery('wb_test_recovery');
    const retryLoad = useWebsiteDocumentStore.getState().loadLocalRecovery('wb_test_recovery');
    expect(retryLoad).toBe(false);
  });

  it('creates immutable checkpoints and rolls back faithfully', () => {
    const store = useWebsiteDocumentStore.getState();
    const originalChecksum = store.document?.checksum;

    // Create Checkpoint 1
    const chk1 = store.createCheckpoint('Checkpoint 1: Initial state');
    expect(chk1).toBeTruthy();
    expect(useWebsiteDocumentStore.getState().checkpoints).toHaveLength(1);

    // Make major changes
    store.createPage('Agenda');
    store.updateInstanceProps('h1_main', { content: 'Radical Redesign Headline' });
    expect(useWebsiteDocumentStore.getState().document?.pages).toHaveLength(2);

    // Create Checkpoint 2
    const chk2 = store.createCheckpoint('Checkpoint 2: Added Agenda');
    expect(chk2).toBeTruthy();
    expect(useWebsiteDocumentStore.getState().checkpoints).toHaveLength(2);

    // Roll back to Checkpoint 1
    const restored = useWebsiteDocumentStore.getState().restoreCheckpoint(chk1);
    expect(restored).toBe(true);

    const docAfterRollback = useWebsiteDocumentStore.getState().document!;
    expect(docAfterRollback.pages).toHaveLength(1);
    expect(docAfterRollback.instances['h1_main']?.props.content).toBe('Initial Headline');
    expect(docAfterRollback.checksum).toBe(originalChecksum);
  });
});
