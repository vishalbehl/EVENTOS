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
          {
            id: 'data-submit-action',
            type: 'Select',
            label: 'Submit Action',
            options: [
              { value: 'email', label: 'Send Email' },
              { value: 'webhook', label: 'Trigger Webhook' },
              { value: 'database', label: 'Save to Database' },
            ],
          },
          { id: 'data-success-msg', type: 'Text', label: 'Success Message' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          { id: 'data-field-name', type: 'Toggle', label: 'Name Field', defaultValue: true },
          { id: 'data-field-email', type: 'Toggle', label: 'Email Field', defaultValue: true },
          { id: 'data-field-company', type: 'Toggle', label: 'Company Field' },
          { id: 'data-field-phone', type: 'Toggle', label: 'Phone Field' },
          { id: 'data-field-message', type: 'Toggle', label: 'Message Field', defaultValue: true },
        ],
      },
      {
        groupId: 'STYLE',
        properties: [
          {
            id: 'data-input-style',
            type: 'Select',
            label: 'Input Style',
            options: [
              { value: 'outline', label: 'Outlined' },
              { value: 'filled', label: 'Filled' },
              { value: 'underline', label: 'Underline' },
            ],
            defaultValue: 'outline'
          },
          { id: 'data-btn-label', type: 'Text', label: 'Submit Button Label', defaultValue: 'Submit' },
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
          {
            id: 'data-integration',
            type: 'Select',
            label: 'Integration',
            options: [
              { value: 'mailchimp', label: 'Mailchimp' },
              { value: 'custom-api', label: 'Custom API' },
            ],
          },
          { id: 'data-placeholder', type: 'Text', label: 'Placeholder Text', defaultValue: 'Enter your email' },
          { id: 'data-btn-text', type: 'Text', label: 'Button Text', defaultValue: 'Subscribe' },
        ],
      },
      {
        groupId: 'LAYOUT',
        properties: [
          {
            id: 'data-layout',
            type: 'Select',
            label: 'Layout',
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
