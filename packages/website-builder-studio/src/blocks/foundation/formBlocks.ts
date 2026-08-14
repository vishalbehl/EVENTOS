import type { Editor } from 'grapesjs';

const icon = (paths: string) => `
  <svg class="gjs-block-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const card = (svg: string, label: string) => `
  <div class="gjs-block-custom">
    <div class="gjs-block-icon-wrapper">${svg}</div>
    <div class="gjs-block-label">${label}</div>
  </div>`;

const inputStyle = 'width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--muted); background: var(--bg-surface-hover, var(--muted)); color: var(--foreground); font-size: 14px; box-sizing: border-box; outline: none;';
const labelStyle = 'display: block; font-size: 12px; font-weight: 600; color: var(--muted-foreground); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.06em;';

export function registerFormBlocks(editor: Editor) {
  const bm = editor.BlockManager;

  bm.add('form-contact', {
    label: card(icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'), 'Contact Form'),
    category: 'Forms',
    content: `
      <form data-gjs-type="contact-form" style="display: flex; flex-direction: column; gap: 18px; padding: 32px; background: var(--muted); border: 1px solid var(--border); border-radius: 20px; max-width: 560px; box-sizing: border-box;">
        <h3 style="font-size: 22px; font-weight: 700; color: var(--foreground); margin: 0 0 4px 0;">Get In Touch</h3>
        <p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 8px 0;">We'd love to hear from you. Fill out the form and we'll be in touch soon.</p>
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 200px;">
            <label style="${labelStyle}">First Name</label>
            <input type="text" placeholder="John" style="${inputStyle}" />
          </div>
          <div style="flex: 1; min-width: 200px;">
            <label style="${labelStyle}">Last Name</label>
            <input type="text" placeholder="Doe" style="${inputStyle}" />
          </div>
        </div>
        <div>
          <label style="${labelStyle}">Email Address</label>
          <input type="email" placeholder="john@example.com" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">Subject</label>
          <input type="text" placeholder="Enquiry about registration" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">Message</label>
          <textarea rows="4" placeholder="Your message..." style="${inputStyle} resize: vertical; height: auto;"></textarea>
        </div>
        <button type="submit" style="background: var(--pri, var(--primary)); color: var(--background); border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; align-self: flex-start;">Send Message</button>
      </form>`,
  });

  bm.add('form-newsletter', {
    label: card(icon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'), 'Newsletter Form'),
    category: 'Forms',
    content: `
      <div data-gjs-type="newsletter" style="padding: 48px 24px; text-align: center; background: var(--muted); border: 1px solid color-mix(in srgb, var(--primary) 15%, transparent); border-radius: 20px; box-sizing: border-box;">
        <h3 style="font-size: 28px; font-weight: 800; color: var(--foreground); margin: 0 0 8px 0;">Stay Updated</h3>
        <p style="font-size: 16px; color: var(--muted-foreground); margin: 0 0 28px 0;">Get the latest news, speaker announcements, and schedule updates delivered to your inbox.</p>
        <form data-gjs-type="newsletter" style="display: flex; gap: 12px; max-width: 480px; margin: 0 auto; flex-wrap: wrap; justify-content: center;">
          <input type="email" placeholder="Enter your email address" style="${inputStyle} max-width: 320px;" />
          <button type="submit" style="background: var(--pri, var(--primary)); color: var(--background); border: none; padding: 13px 24px; border-radius: 10px; font-weight: 700; cursor: pointer; white-space: nowrap;">Subscribe</button>
        </form>
        <p style="font-size: 12px; color: var(--muted-foreground); margin: 16px 0 0 0;">No spam. Unsubscribe at any time.</p>
      </div>`,
  });

  bm.add('form-sponsor-inquiry', {
    label: card(icon('<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>'), 'Sponsor Inquiry'),
    category: 'Forms',
    content: `
      <form data-gjs-type="contact-form" style="display: flex; flex-direction: column; gap: 18px; padding: 32px; background: var(--muted); border: 1px solid var(--border); border-radius: 20px; max-width: 560px; box-sizing: border-box;">
        <h3 style="font-size: 22px; font-weight: 700; color: var(--foreground); margin: 0 0 4px 0;">Become a Sponsor</h3>
        <p style="font-size: 14px; color: var(--muted-foreground); margin: 0 0 8px 0;">Partner with us and reach thousands of industry professionals at the premier event of the year.</p>
        <div>
          <label style="${labelStyle}">Company Name</label>
          <input type="text" placeholder="Acme Corp" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">Contact Email</label>
          <input type="email" placeholder="partnerships@company.com" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">Interested Tier</label>
          <select style="${inputStyle}">
            <option value="">Select sponsorship tier...</option>
            <option>Platinum</option>
            <option>Gold</option>
            <option>Silver</option>
            <option>Exhibitor</option>
          </select>
        </div>
        <div>
          <label style="${labelStyle}">Message</label>
          <textarea rows="3" placeholder="Tell us about your organization..." style="${inputStyle} resize: vertical;"></textarea>
        </div>
        <button type="submit" style="background: var(--pri, var(--primary)); color: var(--background); border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; align-self: flex-start;">Submit Inquiry</button>
      </form>`,
  });

  bm.add('form-input', {
    label: card(icon('<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="7" y1="12" x2="11" y2="12"/>'), 'Input Field'),
    category: 'Forms',
    content: `
      <div data-gjs-type="contact-form" style="padding: 8px 0; box-sizing: border-box;">
        <label style="${labelStyle}">Field Label</label>
        <input type="text" placeholder="Enter value..." style="${inputStyle}" />
      </div>`,
  });

  bm.add('form-textarea', {
    label: card(icon('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="14" y2="12"/>'), 'Textarea'),
    category: 'Forms',
    content: `
      <div data-gjs-type="contact-form" style="padding: 8px 0; box-sizing: border-box;">
        <label style="${labelStyle}">Message</label>
        <textarea rows="5" placeholder="Your message..." style="${inputStyle} resize: vertical;"></textarea>
      </div>`,
  });

  bm.add('form-select', {
    label: card(icon('<rect x="3" y="6" width="18" height="12" rx="2"/><polyline points="9 11 12 14 15 11"/>'), 'Dropdown'),
    category: 'Forms',
    content: `
      <div data-gjs-type="contact-form" style="padding: 8px 0; box-sizing: border-box;">
        <label style="${labelStyle}">Select Option</label>
        <select style="${inputStyle}">
          <option value="">Choose an option...</option>
          <option>Option 1</option>
          <option>Option 2</option>
          <option>Option 3</option>
        </select>
      </div>`,
  });
}
