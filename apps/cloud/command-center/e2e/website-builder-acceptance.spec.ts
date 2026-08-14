import { renderWebsiteDocument, type WebsiteDocument } from '@eventos/website-builder-studio';

import { expect, test } from './fixtures/authenticated';

const now = '2026-08-14T00:00:00.000Z';

function starterDocument(): WebsiteDocument {
  return {
    schemaVersion: 1,
    site: { siteName: 'E2E Event Site', publishMode: 'static-resolved' },
    pages: [{ id: 'page_home', name: 'Home', slug: '', isHomePage: true, rootInstanceId: 'root_home', createdAt: now, updatedAt: now }],
    instances: {
      root_home: { id: 'root_home', componentType: 'page-root', componentVersion: 1, children: ['section_home'], props: { pageId: 'page_home' }, styles: {}, bindings: [], states: { locked: true } },
      section_home: { id: 'section_home', componentType: 'section', componentVersion: 1, parentId: 'root_home', children: ['heading_home'], props: { tagName: 'section', attributes: { id: 'hero' } }, styles: { desktop: { padding: '96px 32px', background: '#10152a', color: '#ffffff' } }, bindings: [], states: {} },
      heading_home: { id: 'heading_home', componentType: 'heading', componentVersion: 1, parentId: 'section_home', children: [], props: { tagName: 'h1', content: 'E2E Event Site' }, styles: { desktop: { margin: '0', color: '#ffffff', 'font-size': '56px' } }, bindings: [], states: {} },
    },
    tokens: { theme: { primary: '#7c3aed', secondary: '#22d3ee', background: '#080b13', surface: '#10152a', card: '#151b32' } },
    menus: [],
    assets: [],
    dataSources: [],
    createdAt: now,
    updatedAt: now,
  };
}

test.describe('canonical website builder', () => {
  test('renders, selects nested children, applies a multi-page template, and opens a live preview', async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    const document = starterDocument();
    let previewDocument = document;
    const canvasDiagnostics: string[] = [];
    page.on('console', message => {
      if (message.type() === 'warning' || message.type() === 'error') canvasDiagnostics.push(message.text());
    });
    page.on('pageerror', error => canvasDiagnostics.push(error.message));

    let draftDocument = document;
    let draftVersion = 1;
    let saveAttempts = 0;
    let rejectFirstSave = true;
    await page.route('**/platform/website-templates/master/draft', async route => {
      if (route.request().method() === 'PUT') {
        saveAttempts += 1;
        if (rejectFirstSave) {
          rejectFirstSave = false;
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              detail: { code: 'WEBSITE_TEMPLATE_DRAFT_CONFLICT', serverVersion: draftVersion },
            }),
          });
          return;
        }
        expect(route.request().headers()['if-match']).toBe(String(draftVersion));
        const body = route.request().postDataJSON() as { document?: WebsiteDocument };
        draftDocument = body.document || draftDocument;
        draftVersion += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          template_id: '00000000-0000-4000-8000-000000000010',
          draft_id: '00000000-0000-4000-8000-000000000011',
          name: 'E2E Event Site',
          slug: 'e2e-event-site',
          document: draftDocument,
          schema_version: 1,
          checksum: 'e2e',
          version: draftVersion,
          updated_at: now,
        }),
      });
    });
    await page.route('**/platform/website-templates/master/preview', async route => {
      const body = route.request().postDataJSON() as { document?: WebsiteDocument };
      previewDocument = body.document || previewDocument;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          preview_id: '00000000-0000-4000-8000-000000000012',
          url: 'http://localhost:3000/__e2e-website-preview',
          checksum: previewDocument.checksum || 'e2e-preview',
          expires_at: '2026-08-15T00:00:00.000Z',
        }),
      });
    });
    await page.context().route('http://localhost:3000/__e2e-website-preview', async route => {
      const home = previewDocument.pages.find(candidate => candidate.isHomePage) || previewDocument.pages[0];
      const rendered = renderWebsiteDocument(previewDocument, home.id, 'preview');
      await route.fulfill({ status: 200, contentType: 'text/html', body: rendered.html });
    });

    await page.goto('/website-templates/builder');
    await expect(page.getByText('Components Library')).toBeVisible({ timeout: 30_000 });

    const canvas = page.frameLocator('.gjs-frame');
    await expect(canvas.getByRole('heading', { name: 'E2E Event Site' })).toBeVisible();
    await canvas.getByRole('heading', { name: 'E2E Event Site' }).click();
    await expect(page.locator('.wb-inspector-component-name')).toContainText('Heading');

    await page.getByRole('button', { name: 'Templates' }).click();
    const templateCard = page.locator('.wb-template-card').filter({ hasText: 'Global Tech Summit' });
    await expect(templateCard).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await templateCard.getByRole('button', { name: 'Apply site' }).click();
    await expect(page.getByText('Speakers', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Agenda', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Venue', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect.poll(() => saveAttempts).toBe(2);

    const popupPromise = page.waitForEvent('popup');
    await page.locator('.gjs-action-btn').filter({ hasText: 'Preview' }).first().click();
    const preview = await popupPromise;
    await preview.waitForURL('**/__e2e-website-preview');
    await expect(preview.getByRole('heading', { name: 'Global Tech Summit 2026' })).toBeVisible();
    expect(canvasDiagnostics.join('\n')).not.toContain("Component type 'span' not found");
    expect(canvasDiagnostics.join('\n')).not.toContain("reading 'getComponents'");
    expect(canvasDiagnostics.join('\n')).not.toContain('Parent mismatch');
    expect(canvasDiagnostics.join('\n')).not.toContain('InvalidCharacterError');
  });
});
