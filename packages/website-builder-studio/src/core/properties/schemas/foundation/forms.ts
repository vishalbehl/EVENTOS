import type { ComponentManifest } from '../../PropertyRegistry';

export const ContactFormManifest: ComponentManifest = {
  id: 'contact-form',
  title: 'Contact Form',
  icon: 'mail',
  category: 'Forms',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-success-msg', type: 'Text', label: 'Success Message', target: { kind: 'attribute', name: 'data-success-msg' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'data-field-name', type: 'Toggle', label: 'Name Field', defaultValue: true, target: { kind: 'attribute', name: 'data-field-name' } },
          { id: 'data-field-email', type: 'Toggle', label: 'Email Field', defaultValue: true, target: { kind: 'attribute', name: 'data-field-email' } },
          { id: 'data-field-company', type: 'Toggle', label: 'Company Field', target: { kind: 'attribute', name: 'data-field-company' } },
          { id: 'data-field-phone', type: 'Toggle', label: 'Phone Field', target: { kind: 'attribute', name: 'data-field-phone' } },
          { id: 'data-field-message', type: 'Toggle', label: 'Message Field', defaultValue: true, target: { kind: 'attribute', name: 'data-field-message' } },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-input-style',
            type: 'Select',
            label: 'Input Style',
            target: { kind: 'attribute', name: 'data-input-style' },
            options: [
              { value: 'outline', label: 'Outlined' },
              { value: 'filled', label: 'Filled' },
              { value: 'underline', label: 'Underline' },
            ],
            defaultValue: 'outline'
          },
          { id: 'data-btn-label', type: 'Text', label: 'Submit Button Label', defaultValue: 'Submit', target: { kind: 'content', selector: 'button[type="submit"],button' } },
        ],
      },
    ]
  }
};

export const NewsletterManifest: ComponentManifest = {
  id: 'newsletter',
  title: 'Newsletter Signup',
  icon: 'send',
  category: 'Forms',
  schema: {
    groups: [
      {
        groupId: 'CONTENT',
        properties: [
          { id: 'data-placeholder', type: 'Text', label: 'Placeholder Text', defaultValue: 'Enter your email', target: { kind: 'attribute', name: 'placeholder', selector: 'input[type="email"],input' } },
          { id: 'data-btn-text', type: 'Text', label: 'Button Text', defaultValue: 'Subscribe', target: { kind: 'content', selector: 'button[type="submit"],button' } },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout',
            type: 'Select',
            label: 'Layout',
            target: { kind: 'attribute', name: 'data-layout' },
            options: [
              { value: 'inline', label: 'Inline' },
              { value: 'stacked', label: 'Stacked' },
            ],
            defaultValue: 'inline'
          },
        ],
      },
    ]
  }
};
