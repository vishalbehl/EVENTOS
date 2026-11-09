import type { FormField, FormFieldOption, FormSettings } from "./types";

/** Explicit catalogue projection, not an authorisation or backend validation substitute. */
export function catalogueDocumentForSave(fields: FormField[], settings: FormSettings) {
  if (fields.length > 100) throw new Error("A catalogue form supports at most 100 fields.");
  if (settings.theme?.header_banner_url) {
    throw new Error("Catalogue banners require managed-asset ownership. Remove the raw banner URL before saving.");
  }
  if (fields.some(field => field.validation?.pattern)) {
    throw new Error("Custom regular expressions are not supported in catalogue templates.");
  }
  const configuration: FormSettings = {
    submit_button_label: settings.submit_button_label,
    success_title: settings.success_title,
    success_message: settings.success_message,
    redirect_url: settings.redirect_url,
    allow_multiple_submissions: settings.allow_multiple_submissions,
    require_login: settings.require_login,
    send_email_confirmation: settings.send_email_confirmation,
    confirmation_email_subject: settings.confirmation_email_subject,
    terms_and_conditions: settings.terms_and_conditions,
    enable_terms: settings.enable_terms,
    enable_preview: settings.enable_preview,
    enable_payment: settings.enable_payment,
    include_default_faqs: settings.include_default_faqs,
    steps: settings.steps?.map(step => ({ id: step.id, title: step.title, description: step.description })),
    faqs: settings.faqs?.map(faq => ({ q: faq.q, a: faq.a, is_default: faq.is_default })),
    theme: settings.theme ? {
      primary_color: settings.theme.primary_color,
      border_radius: settings.theme.border_radius,
      show_header_banner: settings.theme.show_header_banner,
      header_banner_asset_id: settings.theme.header_banner_asset_id,
    } : undefined,
  };
  const projected = fields.map(field => ({
    id: field.id, name: field.name, label: field.label, type: field.type,
    placeholder: field.placeholder, help_text: field.help_text, default_value: field.default_value,
    is_required: field.is_required, is_active: field.is_active, is_default: field.is_default,
    sort_order: field.sort_order, step_index: field.step_index, grid_width: field.grid_width,
    category: field.category,
    options: field.options && typeof field.options[0] === "string"
      ? [...field.options as string[]]
      : (field.options as FormFieldOption[] | undefined)?.map(option => ({
          label: option.label, value: option.value, is_default: option.is_default,
        })),
    validation: field.validation ? {
      min_length: field.validation.min_length, max_length: field.validation.max_length,
      min_value: field.validation.min_value, max_value: field.validation.max_value,
      custom_error_message: field.validation.custom_error_message,
      allowed_file_types: field.validation.allowed_file_types,
      max_file_size_mb: field.validation.max_file_size_mb,
    } : undefined,
  }));
  return { fields: projected, settings: configuration };
}
